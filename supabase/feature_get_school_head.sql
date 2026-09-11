-- Run after feature_school_head_designate.sql.
-- Lets an AOII account (RLS-scoped to only their own school_id) look up the
-- name of the School Head for a specific school — needed so an integrated
-- school's Elementary and Secondary campus, which share one School Head but
-- keep separate rosters, can both display that name. Exposes name/position
-- only, never leave balances or other personnel data.
begin;

create or replace function public.lcms_get_school_head(target_school_id text)
returns table(last_name text, first_name text, middle_name text, "position" text)
language sql stable security definer set search_path = '' as $$
  select e.last_name, e.first_name, e.middle_name, e.position
  from public.leave_employees e
  where e.school_id = target_school_id and e.is_active is distinct from false
    and (
      e.school_head_designate
      or (lower(e.position) like '%principal%' and lower(e.position) not like '%assistant%')
      or lower(e.position) like '%school head%'
    )
  order by e.school_head_designate desc, e.last_name
  limit 1;
$$;
revoke all on function public.lcms_get_school_head(text) from public, anon;
grant execute on function public.lcms_get_school_head(text) to authenticated;

commit;
