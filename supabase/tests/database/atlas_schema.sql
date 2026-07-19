begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

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
      ('202607120800'::text),
      ('202607170900'::text),
      ('202607191000'::text)
  $,
  'the complete 0600 -> 0700 -> 0800 -> 0900 -> 1000 chain is recorded'
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
        ('ai_models', 'owner_id'),
        ('content_items', 'id'),
        ('content_items', 'model_id'),
        ('content_items', 'shot_list'),
        ('generation_jobs', 'id'),
        ('generation_jobs', 'model_id'),
        ('generation_jobs', 'kind'),
        ('generation_jobs', 'owner_id'),
        ('model_references', 'id'),
        ('model_references', 'model_id'),
        ('model_references', 'storage_path'),
        ('model_references', 'owner_id'),
        ('workspaces', 'id'),
        ('workspaces', 'name'),
        ('workspace_members', 'owner_id'),
        ('workspace_members', 'user_id'),
        ('content_items', 'owner_id')
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
      ('ai_models:owner_id'),
      ('content_items:id'),
      ('content_items:model_id'),
      ('content_items:shot_list'),
      ('generation_jobs:id'),
      ('generation_jobs:model_id'),
      ('generation_jobs:kind'),
      ('generation_jobs:owner_id'),
      ('model_references:id'),
      ('model_references:model_id'),
      ('model_references:storage_path'),
      ('model_references:owner_id'),
      ('workspaces:id'),
      ('workspaces:name'),
      ('workspace_members:owner_id'),
      ('workspace_members:user_id'),
      ('content_items:owner_id')
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
        'model_references',
        'workspaces',
        'workspace_members'
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
      ('ai_models_owner_id_fkey'),
      ('content_items_pkey'),
      ('content_items_model_id_fkey'),
      ('content_items_created_by_fkey'),
      ('generation_jobs_pkey'),
      ('generation_jobs_model_id_fkey'),
      ('generation_jobs_count_check'),
      ('generation_jobs_status_check'),
      ('generation_jobs_created_by_fkey'),
      ('generation_jobs_kind_check'),
      ('generation_jobs_owner_id_fkey'),
      ('model_references_pkey'),
      ('model_references_model_id_fkey'),
      ('model_references_kind_check'),
      ('model_references_generation_job_id_fkey'),
      ('model_references_created_by_fkey'),
      ('model_references_owner_id_fkey'),
      ('workspaces_pkey'),
      ('workspaces_created_by_fkey'),
      ('workspaces_status_check'),
      ('workspace_members_pkey'),
      ('workspace_members_owner_id_fkey'),
      ('workspace_members_user_id_fkey'),
      ('workspace_members_role_check'),
      ('workspace_members_status_check'),
      ('content_items_owner_id_fkey')
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
        'model_references',
        'workspaces',
        'workspace_members'
      )
      and rel.relrowsecurity
  ),
  7,
  'RLS is enabled on all Atlas tables including tenant foundation'
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
      'model_references',
      'workspaces',
      'workspace_members'
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
      ('storage.objects:service uploads atlas assets'),
      ('public.workspaces:workspace members can view workspaces'),
      ('public.workspaces:workspace creators can view own workspaces'),
      ('public.workspaces:authenticated users can create own workspace'),
      ('public.workspaces:workspace owners can update workspaces'),
      ('public.workspace_members:workspace members can view memberships'),
      ('public.workspace_members:workspace creators can create owner membership'),
      ('public.workspace_members:workspace owners can manage memberships')
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
        'model_references',
        'workspaces',
        'workspace_members'
      )
      and column_name in (
        'asset_url',
        'review_comment',
        'workspace',
        'workspace_id'
      )
  ),
  0,
  'future non-owner bridge columns are absent'
);

select has_table('public', 'workspaces', 'workspaces exists');
select has_table('public', 'workspace_members', 'workspace_members exists');
select has_column('public', 'content_items', 'owner_id', 'content_items nullable owner_id bridge exists');
select has_column('public', 'ai_models', 'owner_id', 'ai_models nullable owner_id bridge exists');
select has_column('public', 'generation_jobs', 'owner_id', 'generation_jobs nullable owner_id bridge exists');
select has_column('public', 'model_references', 'owner_id', 'model_references nullable owner_id bridge exists');

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'content_items'
      and column_name = 'owner_id'
  ),
  'YES',
  'content_items.owner_id remains nullable before backfill and cutover'
);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_models'
      and column_name = 'owner_id'
  ),
  'YES',
  'ai_models.owner_id remains nullable before backfill and cutover'
);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'generation_jobs'
      and column_name = 'owner_id'
  ),
  'YES',
  'generation_jobs.owner_id remains nullable before backfill and cutover'
);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'model_references'
      and column_name = 'owner_id'
  ),
  'YES',
  'model_references.owner_id remains nullable before backfill and cutover'
);

select has_function('public', 'is_workspace_member', array['uuid'], 'membership helper exists');
select has_function('public', 'has_workspace_role', array['uuid', 'text[]'], 'role helper exists');

select is(
  (
    select prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'is_workspace_member'
      and p.proargtypes = '2950'::oidvector
  ),
  true,
  'is_workspace_member is security definer'
);

select is(
  (
    select prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'has_workspace_role'
      and p.proargtypes = '2950 1009'::oidvector
  ),
  true,
  'has_workspace_role is security definer'
);

select isnt_empty(
  $$
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_workspace_member', 'has_workspace_role')
      and pg_get_functiondef(p.oid) like '%auth.uid()%'
  $$,
  'membership helpers derive users from auth.uid()'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'content_items'
      and policyname in (
        'team can view content',
        'team can create content',
        'team can update content'
      )
  ),
  3,
  'legacy broad content_items policies are still present for pre-cutover compatibility'
);

select is(
  (
    select count(*)::integer
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and table_name like '%approval%'
  ),
  0,
  'approval tables remain absent in tenant foundation PR'
);

select is(
  (
    select count(*)::integer
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'workspaces_status_idx',
        'workspaces_created_by_idx',
        'workspace_members_user_id_idx',
        'workspace_members_active_owner_role_idx',
        'content_items_owner_id_idx',
        'ai_models_owner_id_idx',
        'generation_jobs_owner_id_idx',
        'model_references_owner_id_idx'
      )
  ),
  8,
  'tenant foundation and nullable owner bridge indexes exist'
);

select * from finish();

rollback;
