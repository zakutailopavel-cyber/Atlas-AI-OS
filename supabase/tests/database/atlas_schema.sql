begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'ai_models', 'ai_models exists');
select has_table('public', 'content_items', 'content_items exists');
select has_table('public', 'generation_jobs', 'generation_jobs exists');
select has_table('public', 'model_references', 'model_references exists');

select results_eq(
  $$
    select version::text
    from supabase_migrations.schema_migrations
    order by version
  $$,
  $$
    values
      ('202607120600'::text),
      ('202607120700'::text),
      ('202607120800'::text)
  $$,
  'the complete 0600 -> 0700 -> 0800 chain is recorded'
);

select set_eq(
  $$
    select table_name || ':' || column_name
    from information_schema.columns
    where table_schema = 'public'
      and (table_name, column_name) in (
        ('profiles', 'id'),
        ('profiles', 'email'),
        ('profiles', 'role'),
        ('ai_models', 'id'),
        ('ai_models', 'name'),
        ('ai_models', 'visual_passport'),
        ('content_items', 'id'),
        ('content_items', 'model_id'),
        ('content_items', 'shot_list'),
        ('generation_jobs', 'id'),
        ('generation_jobs', 'model_id'),
        ('generation_jobs', 'kind'),
        ('model_references', 'id'),
        ('model_references', 'model_id'),
        ('model_references', 'storage_path')
      )
  $$,
  $$
    values
      ('profiles:id'),
      ('profiles:email'),
      ('profiles:role'),
      ('ai_models:id'),
      ('ai_models:name'),
      ('ai_models:visual_passport'),
      ('content_items:id'),
      ('content_items:model_id'),
      ('content_items:shot_list'),
      ('generation_jobs:id'),
      ('generation_jobs:model_id'),
      ('generation_jobs:kind'),
      ('model_references:id'),
      ('model_references:model_id'),
      ('model_references:storage_path')
  $$,
  'key Atlas columns match the baseline chain'
);

select set_eq(
  $$
    select con.conname::text
    from pg_constraint as con
    join pg_class as rel on rel.oid = con.conrelid
    join pg_namespace as nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname in (
        'profiles',
        'ai_models',
        'content_items',
        'generation_jobs',
        'model_references'
      )
  $$,
  $$
    values
      ('profiles_pkey'),
      ('profiles_email_key'),
      ('profiles_id_fkey'),
      ('profiles_role_check'),
      ('ai_models_pkey'),
      ('ai_models_created_by_fkey'),
      ('content_items_pkey'),
      ('content_items_model_id_fkey'),
      ('content_items_created_by_fkey'),
      ('generation_jobs_pkey'),
      ('generation_jobs_model_id_fkey'),
      ('generation_jobs_count_check'),
      ('generation_jobs_status_check'),
      ('generation_jobs_created_by_fkey'),
      ('generation_jobs_kind_check'),
      ('model_references_pkey'),
      ('model_references_model_id_fkey'),
      ('model_references_kind_check'),
      ('model_references_generation_job_id_fkey'),
      ('model_references_created_by_fkey')
  $$,
  'Atlas constraints match the baseline chain'
);

select is(
  (
    select count(*)::integer
    from pg_class as rel
    join pg_namespace as nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname in (
        'profiles',
        'ai_models',
        'content_items',
        'generation_jobs',
        'model_references'
      )
      and rel.relrowsecurity
  ),
  5,
  'RLS is enabled on all five Atlas tables'
);

select set_eq(
  $$
    select schemaname || '.' || tablename || ':' || policyname
    from pg_policies
    where (schemaname = 'public' and tablename in (
      'profiles',
      'ai_models',
      'content_items',
      'generation_jobs',
      'model_references'
    )) or (schemaname = 'storage' and tablename = 'objects')
  $$,
  $$
    values
      ('public.profiles:team can view profiles'),
      ('public.ai_models:team can view models'),
      ('public.ai_models:team can create models'),
      ('public.ai_models:team can update models'),
      ('public.content_items:team can view content'),
      ('public.content_items:team can create content'),
      ('public.content_items:team can update content'),
      ('public.generation_jobs:team reads generation jobs'),
      ('public.generation_jobs:team creates generation jobs'),
      ('public.generation_jobs:team updates own generation jobs'),
      ('public.generation_jobs:team deletes own generation jobs'),
      ('public.model_references:team reads model references'),
      ('public.model_references:team creates model references'),
      ('public.model_references:team updates own model references'),
      ('storage.objects:authenticated reads atlas assets'),
      ('storage.objects:service uploads atlas assets')
  $$,
  'legacy Atlas policy names match the migration chain'
);

select has_column(
  'public',
  'generation_jobs',
  'kind',
  'generation_jobs.kind exists'
);

select is(
  (
    select data_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'generation_jobs'
      and column_name = 'kind'
  ),
  'text',
  'generation_jobs.kind uses text'
);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'generation_jobs'
      and column_name = 'kind'
  ),
  'NO',
  'generation_jobs.kind is not nullable'
);

select is(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'generation_jobs'
      and column_name = 'kind'
  ),
  '''avatar''::text',
  'generation_jobs.kind defaults to avatar'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'profiles',
        'ai_models',
        'content_items',
        'generation_jobs',
        'model_references'
      )
      and column_name in (
        'asset_url',
        'review_comment',
        'owner_id',
        'workspace',
        'workspace_id'
      )
  ),
  0,
  'future bridge and ownership columns are absent'
);

select is(
  (
    select count(*)::integer
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and table_name ~ '(workspace|approval)'
  ),
  0,
  'workspace and approval tables are absent'
);

select * from finish();

rollback;
