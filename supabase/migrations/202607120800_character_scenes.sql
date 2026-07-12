alter table public.generation_jobs add column if not exists kind text not null default 'avatar' check(kind in('avatar','scene'));
create policy "team deletes own generation jobs" on public.generation_jobs for delete to authenticated using(auth.uid()=created_by);
create policy "team updates own model references" on public.model_references for update to authenticated using(auth.uid()=created_by) with check(auth.uid()=created_by);
