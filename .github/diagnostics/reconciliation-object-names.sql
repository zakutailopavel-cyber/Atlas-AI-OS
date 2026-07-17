BEGIN;
SET TRANSACTION READ ONLY;

WITH
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
    n.nspname AS schema_name,
    c.relname AS relation_name,
    c.oid AS relation_oid
  FROM atlas_relation_names AS wanted
  JOIN pg_catalog.pg_namespace AS n ON n.nspname = wanted.schema_name
  JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid
   AND c.relname = wanted.relation_name
   AND c.relkind IN ('r', 'p')
),
function_scope AS (
  SELECT
    p.oid AS function_oid,
    true AS is_public_function,
    false AS is_public_table_trigger_function,
    false AS is_storage_trigger_function
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'

  UNION ALL

  SELECT
    t.tgfoid,
    false,
    bool_or(r.schema_name = 'public'),
    bool_or(r.schema_name = 'storage')
  FROM pg_catalog.pg_trigger AS t
  JOIN atlas_relations AS r ON r.relation_oid = t.tgrelid
  WHERE NOT t.tgisinternal
  GROUP BY t.tgfoid
),
classified_functions AS (
  SELECT
    f.function_oid,
    bool_or(f.is_public_function) AS is_public_function,
    bool_or(f.is_public_table_trigger_function) AS is_public_table_trigger_function,
    bool_or(f.is_storage_trigger_function) AS is_storage_trigger_function
  FROM function_scope AS f
  GROUP BY f.function_oid
),
safe_functions AS (
  SELECT
    CASE
      WHEN f.is_storage_trigger_function THEN 'supabase-managed'
      WHEN f.is_public_table_trigger_function THEN 'atlas-trigger-candidate'
      ELSE 'atlas-public-candidate'
    END AS classification,
    'function'::text AS object_type,
    n.nspname AS schema_name,
    p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')'
      AS object_name
  FROM classified_functions AS f
  JOIN pg_catalog.pg_proc AS p ON p.oid = f.function_oid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
),
safe_triggers AS (
  SELECT
    CASE
      WHEN r.schema_name = 'storage' THEN 'supabase-managed'
      ELSE 'atlas-trigger-candidate'
    END AS classification,
    'trigger'::text AS object_type,
    r.schema_name,
    r.relation_name || '.' || t.tgname AS object_name
  FROM pg_catalog.pg_trigger AS t
  JOIN atlas_relations AS r ON r.relation_oid = t.tgrelid
  WHERE NOT t.tgisinternal
),
safe_objects AS (
  SELECT * FROM safe_functions
  UNION ALL
  SELECT * FROM safe_triggers
)
SELECT classification, object_type, schema_name, object_name
FROM safe_objects
ORDER BY classification, object_type, schema_name, object_name;

ROLLBACK;
