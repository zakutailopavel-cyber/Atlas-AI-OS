-- Atlas production migration-reconciliation preflight.
-- PREPARED ONLY: do not execute until the owner grants the read-only preflight gate.
--
-- This script returns one anonymized JSON document. It never reads or returns
-- emails, user UUID values, prompts, captions, URLs, Storage object names, or
-- Storage paths. Migration history rows are deliberately not queried: a static
-- SQL statement cannot conditionally reference a relation that may not exist
-- without dynamic SQL. A missing history table is therefore a successful,
-- explicit result rather than error 42P01.

BEGIN;
SET TRANSACTION READ ONLY;

WITH
settings AS (
  SELECT
    current_setting('server_version_num') AS server_version_num,
    current_setting('transaction_read_only') AS transaction_read_only
),
atlas_relation_names(schema_name, relation_name) AS (
  VALUES
    ('public'::name, 'profiles'::name),
    ('public'::name, 'ai_models'::name),
    ('public'::name, 'content_items'::name),
    ('public'::name, 'generation_jobs'::name),
    ('public'::name, 'model_references'::name),
    ('storage'::name, 'buckets'::name),
    ('storage'::name, 'objects'::name)
),
atlas_relations AS (
  SELECT
    wanted.schema_name,
    wanted.relation_name,
    c.oid AS relation_oid,
    c.relkind,
    c.relrowsecurity,
    c.relforcerowsecurity
  FROM atlas_relation_names AS wanted
  LEFT JOIN pg_catalog.pg_namespace AS n
    ON n.nspname = wanted.schema_name
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid
   AND c.relname = wanted.relation_name
   AND c.relkind IN ('r', 'p')
),
history_schema AS (
  SELECT
    n.oid AS schema_oid,
    n.nspname AS schema_name,
    pg_catalog.pg_get_userbyid(n.nspowner) AS owner_name,
    n.nspowner AS owner_oid,
    n.nspacl
  FROM pg_catalog.pg_namespace AS n
  WHERE n.nspname = 'supabase_migrations'
),
history_relation AS (
  SELECT
    c.oid AS relation_oid,
    n.nspname AS schema_name,
    c.relname AS relation_name,
    c.relkind,
    pg_catalog.pg_get_userbyid(c.relowner) AS owner_name,
    c.relowner AS owner_oid,
    c.relacl,
    c.relrowsecurity,
    c.relforcerowsecurity
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'supabase_migrations'
    AND c.relname = 'schema_migrations'
    AND c.relkind IN ('r', 'p')
),
history_columns AS (
  SELECT
    a.attnum AS ordinal_position,
    a.attname AS column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
    a.attnotnull AS not_null,
    a.attidentity AS identity_kind,
    a.attgenerated AS generated_kind,
    pg_catalog.pg_get_expr(d.adbin, d.adrelid, true) AS column_default
  FROM history_relation AS h
  JOIN pg_catalog.pg_attribute AS a ON a.attrelid = h.relation_oid
  LEFT JOIN pg_catalog.pg_attrdef AS d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum
  WHERE a.attnum > 0
    AND NOT a.attisdropped
),
history_constraints AS (
  SELECT
    con.conname AS constraint_name,
    con.contype AS constraint_type,
    con.convalidated AS is_validated,
    pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
  FROM history_relation AS h
  JOIN pg_catalog.pg_constraint AS con ON con.conrelid = h.relation_oid
),
history_indexes AS (
  SELECT
    idx.relname AS index_name,
    i.indisprimary AS is_primary,
    i.indisunique AS is_unique,
    i.indisvalid AS is_valid,
    pg_catalog.pg_get_indexdef(i.indexrelid, 0, true) AS definition
  FROM history_relation AS h
  JOIN pg_catalog.pg_index AS i ON i.indrelid = h.relation_oid
  JOIN pg_catalog.pg_class AS idx ON idx.oid = i.indexrelid
),
history_schema_grants AS (
  SELECT
    CASE
      WHEN acl.grantee = 0 THEN 'PUBLIC'
      ELSE pg_catalog.pg_get_userbyid(acl.grantee)
    END AS grantee,
    acl.privilege_type,
    acl.is_grantable
  FROM history_schema AS h
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    coalesce(h.nspacl, pg_catalog.acldefault('n', h.owner_oid))
  ) AS acl
),
history_table_grants AS (
  SELECT
    CASE
      WHEN acl.grantee = 0 THEN 'PUBLIC'
      ELSE pg_catalog.pg_get_userbyid(acl.grantee)
    END AS grantee,
    acl.privilege_type,
    acl.is_grantable
  FROM history_relation AS h
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    coalesce(h.relacl, pg_catalog.acldefault('r', h.owner_oid))
  ) AS acl
),
relation_manifest_items AS (
  SELECT concat_ws('|',
    r.schema_name,
    r.relation_name,
    coalesce(r.relkind::text, '<missing>'),
    coalesce(r.relrowsecurity::text, '<missing>'),
    coalesce(r.relforcerowsecurity::text, '<missing>')
  ) AS canonical_item
  FROM atlas_relations AS r
),
column_manifest_items AS (
  SELECT concat_ws('|',
    r.schema_name,
    r.relation_name,
    a.attnum::text,
    a.attname,
    pg_catalog.format_type(a.atttypid, a.atttypmod),
    a.attnotnull::text,
    a.attidentity,
    a.attgenerated,
    coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid, true), '<null>')
  ) AS canonical_item
  FROM atlas_relations AS r
  JOIN pg_catalog.pg_attribute AS a ON a.attrelid = r.relation_oid
  LEFT JOIN pg_catalog.pg_attrdef AS d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum
  WHERE a.attnum > 0
    AND NOT a.attisdropped
),
constraint_manifest_items AS (
  SELECT concat_ws('|',
    r.schema_name,
    r.relation_name,
    con.conname,
    con.contype::text,
    con.convalidated::text,
    pg_catalog.pg_get_constraintdef(con.oid, true)
  ) AS canonical_item
  FROM atlas_relations AS r
  JOIN pg_catalog.pg_constraint AS con ON con.conrelid = r.relation_oid
),
index_manifest_items AS (
  SELECT concat_ws('|',
    r.schema_name,
    r.relation_name,
    idx.relname,
    i.indisprimary::text,
    i.indisunique::text,
    i.indisvalid::text,
    pg_catalog.pg_get_indexdef(i.indexrelid, 0, true)
  ) AS canonical_item
  FROM atlas_relations AS r
  JOIN pg_catalog.pg_index AS i ON i.indrelid = r.relation_oid
  JOIN pg_catalog.pg_class AS idx ON idx.oid = i.indexrelid
),
policy_manifest_items AS (
  SELECT concat_ws('|',
    p.schemaname,
    p.tablename,
    p.policyname,
    p.permissive,
    array_to_string(p.roles, ','),
    p.cmd,
    coalesce(p.qual, '<null>'),
    coalesce(p.with_check, '<null>')
  ) AS canonical_item
  FROM pg_catalog.pg_policies AS p
  JOIN atlas_relation_names AS wanted
    ON wanted.schema_name = p.schemaname
   AND wanted.relation_name = p.tablename
),
atlas_function_oids AS (
  SELECT p.oid
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'

  UNION

  SELECT t.tgfoid
  FROM pg_catalog.pg_trigger AS t
  JOIN atlas_relations AS r ON r.relation_oid = t.tgrelid
  WHERE NOT t.tgisinternal
),
function_manifest_items AS (
  SELECT concat_ws('|',
    n.nspname,
    p.proname,
    pg_catalog.pg_get_function_identity_arguments(p.oid),
    pg_catalog.pg_get_function_result(p.oid),
    p.prosecdef::text,
    p.provolatile::text,
    p.proparallel::text
  ) AS canonical_item
  FROM atlas_function_oids AS f
  JOIN pg_catalog.pg_proc AS p ON p.oid = f.oid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
),
trigger_manifest_items AS (
  SELECT concat_ws('|',
    n.nspname,
    c.relname,
    t.tgname,
    t.tgenabled::text,
    t.tgtype::text,
    fn.proname
  ) AS canonical_item
  FROM pg_catalog.pg_trigger AS t
  JOIN atlas_relations AS r ON r.relation_oid = t.tgrelid
  JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_proc AS fn ON fn.oid = t.tgfoid
  WHERE NOT t.tgisinternal
),
storage_manifest_items AS (
  SELECT concat_ws('|',
    b.id,
    b.name,
    b.public::text,
    coalesce(b.file_size_limit::text, '<null>'),
    coalesce(array_to_string(b.allowed_mime_types, ','), '<null>')
  ) AS canonical_item
  FROM storage.buckets AS b
  WHERE b.id = 'atlas-assets'
),
manifest_a_components AS (
  SELECT 'relations_and_rls' AS component,
         count(*)::bigint AS item_count,
         md5(coalesce(string_agg(canonical_item, E'\n' ORDER BY canonical_item), '')) AS component_hash
  FROM relation_manifest_items
  UNION ALL
  SELECT 'columns', count(*)::bigint,
         md5(coalesce(string_agg(canonical_item, E'\n' ORDER BY canonical_item), ''))
  FROM column_manifest_items
  UNION ALL
  SELECT 'constraints', count(*)::bigint,
         md5(coalesce(string_agg(canonical_item, E'\n' ORDER BY canonical_item), ''))
  FROM constraint_manifest_items
  UNION ALL
  SELECT 'indexes', count(*)::bigint,
         md5(coalesce(string_agg(canonical_item, E'\n' ORDER BY canonical_item), ''))
  FROM index_manifest_items
  UNION ALL
  SELECT 'policies', count(*)::bigint,
         md5(coalesce(string_agg(canonical_item, E'\n' ORDER BY canonical_item), ''))
  FROM policy_manifest_items
  UNION ALL
  SELECT 'functions', count(*)::bigint,
         md5(coalesce(string_agg(canonical_item, E'\n' ORDER BY canonical_item), ''))
  FROM function_manifest_items
  UNION ALL
  SELECT 'triggers', count(*)::bigint,
         md5(coalesce(string_agg(canonical_item, E'\n' ORDER BY canonical_item), ''))
  FROM trigger_manifest_items
  UNION ALL
  SELECT 'storage_bucket_metadata', count(*)::bigint,
         md5(coalesce(string_agg(canonical_item, E'\n' ORDER BY canonical_item), ''))
  FROM storage_manifest_items
),
manifest_a AS (
  SELECT
    md5(string_agg(
      concat_ws('|', component, item_count::text, component_hash),
      E'\n' ORDER BY component
    )) AS overall_hash,
    jsonb_agg(
      jsonb_build_object(
        'component', component,
        'item_count', item_count,
        'hash', component_hash
      ) ORDER BY component
    ) AS components
  FROM manifest_a_components
),
row_counts AS (
  SELECT 'profiles' AS aggregate_name, count(*)::bigint AS aggregate_value
  FROM public.profiles
  UNION ALL
  SELECT 'ai_models', count(*)::bigint FROM public.ai_models
  UNION ALL
  SELECT 'content_items', count(*)::bigint FROM public.content_items
  UNION ALL
  SELECT 'generation_jobs', count(*)::bigint FROM public.generation_jobs
  UNION ALL
  SELECT 'model_references', count(*)::bigint FROM public.model_references
  UNION ALL
  SELECT 'atlas_assets_objects', count(*)::bigint
  FROM storage.objects
  WHERE bucket_id = 'atlas-assets'
),
integrity_aggregates AS (
  SELECT 'profiles_without_auth_user' AS aggregate_name, count(*)::bigint AS aggregate_value
  FROM public.profiles AS p
  LEFT JOIN auth.users AS u ON u.id = p.id
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'ai_models_creator_missing_auth_user', count(*)::bigint
  FROM public.ai_models AS m
  LEFT JOIN auth.users AS u ON u.id = m.created_by
  WHERE m.created_by IS NOT NULL AND u.id IS NULL
  UNION ALL
  SELECT 'content_items_orphan_model', count(*)::bigint
  FROM public.content_items AS i
  LEFT JOIN public.ai_models AS m ON m.id = i.model_id
  WHERE i.model_id IS NOT NULL AND m.id IS NULL
  UNION ALL
  SELECT 'content_items_creator_missing_auth_user', count(*)::bigint
  FROM public.content_items AS i
  LEFT JOIN auth.users AS u ON u.id = i.created_by
  WHERE i.created_by IS NOT NULL AND u.id IS NULL
  UNION ALL
  SELECT 'generation_jobs_orphan_model', count(*)::bigint
  FROM public.generation_jobs AS j
  LEFT JOIN public.ai_models AS m ON m.id = j.model_id
  WHERE m.id IS NULL
  UNION ALL
  SELECT 'generation_jobs_creator_missing_auth_user', count(*)::bigint
  FROM public.generation_jobs AS j
  LEFT JOIN auth.users AS u ON u.id = j.created_by
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'model_references_orphan_model', count(*)::bigint
  FROM public.model_references AS r
  LEFT JOIN public.ai_models AS m ON m.id = r.model_id
  WHERE m.id IS NULL
  UNION ALL
  SELECT 'model_references_orphan_generation_job', count(*)::bigint
  FROM public.model_references AS r
  LEFT JOIN public.generation_jobs AS j ON j.id = r.generation_job_id
  WHERE r.generation_job_id IS NOT NULL AND j.id IS NULL
  UNION ALL
  SELECT 'model_references_creator_missing_auth_user', count(*)::bigint
  FROM public.model_references AS r
  LEFT JOIN auth.users AS u ON u.id = r.created_by
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'content_model_creator_mismatch_proxy', count(*)::bigint
  FROM public.content_items AS i
  JOIN public.ai_models AS m ON m.id = i.model_id
  WHERE i.created_by IS DISTINCT FROM m.created_by
  UNION ALL
  SELECT 'job_model_creator_mismatch_proxy', count(*)::bigint
  FROM public.generation_jobs AS j
  JOIN public.ai_models AS m ON m.id = j.model_id
  WHERE j.created_by IS DISTINCT FROM m.created_by
  UNION ALL
  SELECT 'reference_model_creator_mismatch_proxy', count(*)::bigint
  FROM public.model_references AS r
  JOIN public.ai_models AS m ON m.id = r.model_id
  WHERE r.created_by IS DISTINCT FROM m.created_by
  UNION ALL
  SELECT 'reference_job_model_mismatch', count(*)::bigint
  FROM public.model_references AS r
  JOIN public.generation_jobs AS j ON j.id = r.generation_job_id
  WHERE r.model_id IS DISTINCT FROM j.model_id
  UNION ALL
  SELECT 'reference_job_creator_mismatch_proxy', count(*)::bigint
  FROM public.model_references AS r
  JOIN public.generation_jobs AS j ON j.id = r.generation_job_id
  WHERE r.created_by IS DISTINCT FROM j.created_by
  UNION ALL
  SELECT 'models_with_multiple_primary_references', count(*)::bigint
  FROM (
    SELECT r.model_id
    FROM public.model_references AS r
    WHERE r.kind = 'primary'
    GROUP BY r.model_id
    HAVING count(*) > 1
  ) AS grouped
  UNION ALL
  SELECT 'duplicate_reference_locator_groups', count(*)::bigint
  FROM (
    SELECT r.storage_path
    FROM public.model_references AS r
    GROUP BY r.storage_path
    HAVING count(*) > 1
  ) AS grouped
),
manifest_b_rows AS (
  SELECT 'row_count' AS aggregate_type, aggregate_name, aggregate_value
  FROM row_counts
  UNION ALL
  SELECT 'integrity_check', aggregate_name, aggregate_value
  FROM integrity_aggregates
),
manifest_b AS (
  SELECT
    md5(string_agg(
      concat_ws('|', aggregate_type, aggregate_name, aggregate_value::text),
      E'\n' ORDER BY aggregate_type, aggregate_name
    )) AS overall_hash,
    jsonb_agg(
      jsonb_build_object(
        'type', aggregate_type,
        'name', aggregate_name,
        'count', aggregate_value
      ) ORDER BY aggregate_type, aggregate_name
    ) AS aggregates
  FROM manifest_b_rows
),
history_manifest AS (
  SELECT jsonb_build_object(
    'schema_exists', EXISTS (SELECT 1 FROM history_schema),
    'table_exists', EXISTS (SELECT 1 FROM history_relation),
    'schema_owner', (SELECT owner_name FROM history_schema),
    'table_owner', (SELECT owner_name FROM history_relation),
    'relation_kind', (SELECT relkind::text FROM history_relation),
    'rls_enabled', (SELECT relrowsecurity FROM history_relation),
    'rls_forced', (SELECT relforcerowsecurity FROM history_relation),
    'columns', coalesce((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.ordinal_position)
      FROM history_columns AS c
    ), '[]'::jsonb),
    'constraints', coalesce((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.constraint_name)
      FROM history_constraints AS c
    ), '[]'::jsonb),
    'indexes', coalesce((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.index_name)
      FROM history_indexes AS i
    ), '[]'::jsonb),
    'schema_grants', coalesce((
      SELECT jsonb_agg(to_jsonb(g) ORDER BY g.grantee, g.privilege_type)
      FROM history_schema_grants AS g
    ), '[]'::jsonb),
    'table_grants', coalesce((
      SELECT jsonb_agg(to_jsonb(g) ORDER BY g.grantee, g.privilege_type)
      FROM history_table_grants AS g
    ), '[]'::jsonb),
    'versions', NULL,
    'versions_collection_status', CASE
      WHEN EXISTS (SELECT 1 FROM history_relation)
        THEN 'table_present_but_rows_not_queried_by_this_static_preflight'
      ELSE 'table_absent_not_an_error'
    END
  ) AS report
),
final_report AS (
  SELECT jsonb_build_object(
    'preflight_version', '1.0',
    'generated_at', statement_timestamp(),
    'transaction_read_only', settings.transaction_read_only,
    'server_version_num', settings.server_version_num,
    'history_manifest', history_manifest.report,
    'atlas_manifest_a', jsonb_build_object(
      'hash_algorithm', 'md5',
      'overall_hash', manifest_a.overall_hash,
      'components', manifest_a.components
    ),
    'operational_manifest_b', jsonb_build_object(
      'hash_algorithm', 'md5',
      'overall_hash', manifest_b.overall_hash,
      'aggregates', manifest_b.aggregates,
      'interpretation', 'created_by mismatch counts are ownership ambiguity proxies, not proof of cross-owner access'
    ),
    'safety', jsonb_build_object(
      'history_rows_queried', false,
      'row_content_returned', false,
      'user_identifiers_returned', false,
      'storage_object_names_or_paths_returned', false,
      'contains_ddl_or_dml', false,
      'contains_dynamic_sql_rpc_or_http', false,
      'contains_supabase_link_push_or_repair', false,
      'contains_openai_or_modal_commands', false
    )
  ) AS report
  FROM settings
  CROSS JOIN history_manifest
  CROSS JOIN manifest_a
  CROSS JOIN manifest_b
)
SELECT jsonb_pretty(report) AS production_reconciliation_preflight
FROM final_report;

ROLLBACK;
