-- Lets HRMO/Admin designate a Head Teacher as acting School Head for their
-- assigned school without overwriting their actual position/rank (which
-- drives their salary grade) — they keep being e.g. "Head Teacher III" but
-- sort and prioritize like a Principal.
begin;

alter table public.leave_employees add column if not exists school_head_designate boolean not null default false;

commit;
