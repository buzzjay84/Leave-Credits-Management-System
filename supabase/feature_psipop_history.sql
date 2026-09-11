-- Run once in the Supabase SQL editor before using Update PSIPOP online.
-- Stored with the employee so roster changes and their history save atomically,
-- including the existing SQLite offline queue and backup workflow.
alter table public.leave_employees
  add column if not exists psipop_history jsonb not null default '[]'::jsonb;
comment on column public.leave_employees.psipop_history is
  'PSIPOP source snapshots and before/after changes for service record preparation; effective_date is the source as-of date, not a certified appointment date.';

create table if not exists public.leave_psipop_items (
  item_number text primary key,
  position text not null,
  salary_grade text,
  office text,
  vacant boolean not null,
  source_file text not null,
  effective_date date not null,
  updated_at timestamptz not null default now()
);
alter table public.leave_psipop_items enable row level security;
drop policy if exists psipop_items_read on public.leave_psipop_items;
create policy psipop_items_read on public.leave_psipop_items for select to authenticated
  using ((select public.lcms_is_hrmo()));
drop policy if exists psipop_items_write on public.leave_psipop_items;
create policy psipop_items_write on public.leave_psipop_items for all to authenticated
  using ((select public.lcms_is_hrmo())) with check ((select public.lcms_is_hrmo()));
