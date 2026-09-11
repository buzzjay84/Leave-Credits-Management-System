-- CTI (Co-Terminus with the Incumbent) items are never refilled once the
-- current holder leaves — e.g. Watchman I items under OSDS. HRMO flags the
-- employee record as cti_item; a trigger mirrors that into leave_cti_items so
-- the item number stays permanently excluded from Vacant Items even after the
-- employee row itself is later removed (retirement, resignation, etc.).
begin;

alter table public.leave_employees
  add column if not exists cti_item boolean not null default false;

create table if not exists public.leave_cti_items (
  item_number text primary key,
  marked_by text,
  marked_at timestamptz not null default now()
);
alter table public.leave_cti_items enable row level security;

drop policy if exists "cti_items_select" on public.leave_cti_items;
create policy "cti_items_select" on public.leave_cti_items
  for select to authenticated using ((select public.lcms_is_hrmo()));

drop policy if exists "cti_items_write" on public.leave_cti_items;
create policy "cti_items_write" on public.leave_cti_items
  for all to authenticated
  using ((select public.lcms_is_hrmo()))
  with check ((select public.lcms_is_hrmo()));

create or replace function public.lcms_sync_cti_item()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor text;
begin
  select username into actor from public."LCMS-profiles" where id = (select auth.uid()) and is_active;
  if tg_op = 'DELETE' then
    if old.cti_item and old.item_number is not null then
      insert into public.leave_cti_items (item_number, marked_by)
      values (old.item_number, actor)
      on conflict (item_number) do nothing;
    end if;
    return old;
  end if;
  if new.cti_item and new.item_number is not null then
    insert into public.leave_cti_items (item_number, marked_by)
    values (new.item_number, actor)
    on conflict (item_number) do nothing;
  elsif not new.cti_item and new.item_number is not null then
    delete from public.leave_cti_items where item_number = new.item_number;
  end if;
  return new;
end $$;

drop trigger if exists lcms_cti_item_sync on public.leave_employees;
create trigger lcms_cti_item_sync
  after insert or update of cti_item, item_number or delete on public.leave_employees
  for each row execute function public.lcms_sync_cti_item();

commit;
