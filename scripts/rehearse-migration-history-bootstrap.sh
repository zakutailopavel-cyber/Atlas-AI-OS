#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${RUNNER_TEMP:-/tmp}/atlas-migration-history-rehearsal-$$"
SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
EXPECTED_HISTORY=$'202607120600\n202607120700\n202607120800'

cleanup() {
  set +e
  if [[ -d "${WORK_DIR}" ]]; then
    (cd "${WORK_DIR}" && supabase stop --no-backup >/dev/null 2>&1)
    rm -rf "${WORK_DIR}"
  fi
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command supabase
require_command psql
require_command sha256sum
if [[ -f "${ROOT_DIR}/supabase/.temp/project-ref" ]]; then
  echo "Refusing to run with a local linked Supabase project in the repository checkout." >&2
  exit 1
fi

mkdir -p "${WORK_DIR}/supabase/migrations"
cp "${ROOT_DIR}/supabase/config.toml" "${WORK_DIR}/supabase/config.toml"
cp "${ROOT_DIR}/supabase/migrations/202607120600_core_schema_baseline.sql" "${WORK_DIR}/supabase/migrations/"
cp "${ROOT_DIR}/supabase/migrations/202607120700_avatar_generation.sql" "${WORK_DIR}/supabase/migrations/"
cp "${ROOT_DIR}/supabase/migrations/202607120800_character_scenes.sql" "${WORK_DIR}/supabase/migrations/"

cd "${WORK_DIR}"

echo "Supabase CLI: $(supabase --version)"
echo "Starting isolated local Supabase with migrations 0600 -> 0700 -> 0800 only."
supabase db start

psql -X "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -c "drop schema if exists supabase_migrations cascade;" >/dev/null

if [[ "$(psql -XAt "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -c "select to_regclass('supabase_migrations.schema_migrations') is null;")" != "t" ]]; then
  echo "Expected pre-state without supabase_migrations.schema_migrations." >&2
  exit 1
fi

echo "Confirmed rehearsal pre-state has no migration history table."

manifest_sql=$(cat <<'SQL'
with manifest(line) as (
  select 'column|' || table_schema || '.' || table_name || '.' || column_name || '|' || data_type || '|' || coalesce(column_default, '') || '|' || is_nullable
  from information_schema.columns
  where table_schema in ('public', 'storage')
    and table_name in ('profiles','ai_models','content_items','generation_jobs','model_references','buckets','objects')
  union all
  select 'constraint|' || n.nspname || '.' || c.relname || '|' || con.conname || '|' || pg_get_constraintdef(con.oid)
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'storage')
    and c.relname in ('profiles','ai_models','content_items','generation_jobs','model_references','buckets','objects')
  union all
  select 'index|' || schemaname || '.' || tablename || '|' || indexname || '|' || indexdef
  from pg_indexes
  where schemaname in ('public', 'storage')
    and tablename in ('profiles','ai_models','content_items','generation_jobs','model_references','buckets','objects')
  union all
  select 'rls|' || n.nspname || '.' || c.relname || '|' || c.relrowsecurity::text || '|' || c.relforcerowsecurity::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'storage')
    and c.relname in ('profiles','ai_models','content_items','generation_jobs','model_references','buckets','objects')
  union all
  select 'policy|' || schemaname || '.' || tablename || '|' || policyname || '|' || cmd || '|' || roles::text || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
  from pg_policies
  where schemaname in ('public', 'storage')
    and tablename in ('profiles','ai_models','content_items','generation_jobs','model_references','buckets','objects')
  union all
  select 'bucket|' || id || '|' || name || '|' || public::text || '|' || coalesce(file_size_limit::text, '') || '|' || coalesce(allowed_mime_types::text, '')
  from storage.buckets
  where id = 'atlas-assets'
  union all
  select 'forbidden|' || forbidden_name || '|' || to_regclass(forbidden_name)::text
  from (values ('public.workspaces'), ('public.workspace_members')) as forbidden(forbidden_name)
)
select line from manifest order by line;
SQL
)

hash_manifest() {
  psql -XAt "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -c "$manifest_sql" | sha256sum | awk '{print $1}'
}

before_hash="$(hash_manifest)"
echo "Atlas schema hash before repair: ${before_hash}"

supabase migration repair 202607120600 --status applied --local
supabase migration repair 202607120700 --status applied --local
supabase migration repair 202607120800 --status applied --local

after_hash="$(hash_manifest)"
echo "Atlas schema hash after repair:  ${after_hash}"

if [[ "${before_hash}" != "${after_hash}" ]]; then
  echo "Atlas schema changed during migration history repair." >&2
  exit 1
fi

actual_history="$(psql -XAt "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -c "select version::text from supabase_migrations.schema_migrations order by version;")"
if [[ "${actual_history}" != "${EXPECTED_HISTORY}" ]]; then
  echo "Unexpected migration history:" >&2
  printf '%s\n' "${actual_history}" >&2
  exit 1
fi

echo "Confirmed repaired history contains exactly 0600, 0700, and 0800."

cp "${ROOT_DIR}/supabase/migrations/202607170900_tenant_foundation.sql" "${WORK_DIR}/supabase/migrations/"

dry_run_output="$(supabase db push --local --dry-run 2>&1)"
printf '%s\n' "${dry_run_output}"
if ! grep -q '202607170900' <<<"${dry_run_output}"; then
  echo "Expected 202607170900 to remain pending in dry-run output." >&2
  exit 1
fi
if psql -XAt "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -c "select to_regclass('public.workspaces') is null and to_regclass('public.workspace_members') is null;" | grep -qx 't'; then
  echo "Confirmed 0900 remains pending and tenant tables were not created."
else
  echo "0900 appears to have been applied; tenant tables exist." >&2
  exit 1
fi

echo "Isolated migration-history bootstrap rehearsal passed."
