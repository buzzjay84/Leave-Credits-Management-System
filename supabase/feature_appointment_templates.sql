-- CS Form 33-B appointment generator (Admin Console). Position-specific
-- content (qualification standards, duties, functions, etc.) is reusable
-- per position title so HRMO fills it once and future appointments to the
-- same position title auto-load it. Admin-only, matching Vacant Items access.
begin;

create table if not exists public.leave_position_templates (
  position_title text primary key,
  fields jsonb not null default '{}',
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.leave_position_templates enable row level security;
revoke all on public.leave_position_templates from anon, authenticated;
grant select, insert, update on public.leave_position_templates to authenticated;

drop policy if exists "position_templates_select" on public.leave_position_templates;
create policy "position_templates_select" on public.leave_position_templates
  for select to authenticated using ((select public.lcms_is_admin()));

drop policy if exists "position_templates_write" on public.leave_position_templates;
create policy "position_templates_write" on public.leave_position_templates
  for all to authenticated
  using ((select public.lcms_is_admin()))
  with check ((select public.lcms_is_admin()));

commit;
