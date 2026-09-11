-- ============================================================
-- Leave Credits Management System (LCMS) — Supabase Schema
-- ============================================================

-- -----------------------------------------------
-- EMPLOYEES TABLE
-- -----------------------------------------------
create table if not exists leave_employees (
  id           uuid primary key default gen_random_uuid(),
  school_id    text not null default 'DEFAULT',

  -- Personal info
  last_name    text not null,
  first_name   text not null,
  middle_name  text,
  employee_no  text unique,                   -- government employee number
  tin_number   text,                          -- normalized 9-digit TIN (PSIPOP branch code removed)
  position     text not null,
  emp_type     text not null check (emp_type in ('Teaching', 'Non-Teaching')),
  emp_status   text not null default 'Permanent'
               check (emp_status in ('Permanent','Temporary','Casual','Substitute','Co-terminus')),
  hired_date   date not null,                 -- date of original appointment
  salary_grade text,
  salary_step integer not null default 1 check (salary_step between 1 and 8),
  salary_step_mode text not null default 'manual' check (salary_step_mode in ('manual','automatic')),
  salary_step_basis_date date,
  monthly_salary numeric(10,2),
  retirement_date date,
  retirement_notes text,

  -- Non-Teaching leave fields
  -- VL and SL auto-accrue at 1.25 days/month each (CSC MC 41 s.1998)
  vl_used      numeric(6,2) default 0,
  sl_used      numeric(6,2) default 0,
  vl_override  numeric(6,2),                 -- HRMO manual correction; null = use auto-computed
  sl_override  numeric(6,2),                 -- null = use auto-computed
  protected_vl_balance numeric(6,2) not null default 0 check (protected_vl_balance >= 0),

  -- Teaching leave fields (VSC per DepEd Order 013, s. 2024)
  -- Teaching staff are NOT entitled to VL/SL
  vsc_balance  numeric(6,2) default 0,       -- current VSC balance (HRMO-encoded)
  vsc_used     numeric(6,2) default 0,       -- VSC used/offset total
  vsc_earned_this_sy numeric(6,2) default 0, -- earned in current school year
  vsc_max      integer default 15            -- 15 / 30 / 45 based on years of service

    check (vsc_max in (15, 30, 45)),

  -- Metadata
  is_active    boolean default true,
  notes        text,
  created_by   text,
  updated_by   text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists idx_leave_employees_school on leave_employees (school_id);
create index if not exists idx_leave_employees_type   on leave_employees (emp_type);
create index if not exists idx_leave_employees_active on leave_employees (is_active);

-- -----------------------------------------------
-- LEAVE TRANSACTIONS TABLE
-- (Tracks each leave application / deduction / credit)
-- -----------------------------------------------
create table if not exists leave_transactions (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references leave_employees(id) on delete cascade,
  school_id      text not null,

  txn_type       text not null check (txn_type in (
                   'VL_DEBIT',      -- VL used
                   'SL_DEBIT',      -- SL used
                   'VSC_CREDIT',    -- VSC earned (HRMO input)
                   'VSC_DEBIT',     -- VSC used/offset
                   'VL_ADJUST',     -- HRMO manual VL adjustment
                   'SL_ADJUST',     -- HRMO manual SL adjustment
                   'MONETIZE',      -- Leave monetization
                   'CTO_CREDIT',    -- CTO grant with a one-year expiry
                   'CTO_DEBIT',     -- CTO usage
                   'VL_PROTECTED_CREDIT', -- legacy protected VL restoration
                   'VL_CANCELLATION_CREDIT', -- authority cancellation; ordinary VL restored
                   'MANDATORY_FORFEIT', -- untaken annual mandatory VL forfeiture
                   'MANDATORY_EXEMPT',  -- retirement/separation year exemption audit
                   'SPECIAL'        -- Special leave (maternity, VAWC, emergency, etc.)
                 )),

  leave_type     text not null,               -- 'VL','SL','VSC','Maternity','VAWC', etc.
  days           numeric(5,2) not null,        -- positive = credit, negative = debit
  date_from      date,
  date_to        date,
  reason         text,                         -- illness / personal / official, etc.
  remarks        text,                         -- e.g. "VSC applied", "with pay"
  with_pay       boolean default true,

  -- For special leaves
  approved_by    text,
  order_no       text,                         -- Special Order number for VSC

  recorded_by    text not null,               -- username of HRMO who encoded
  created_at     timestamptz default now()
);

create index if not exists idx_leave_txn_employee on leave_transactions (employee_id);
create index if not exists idx_leave_txn_date     on leave_transactions (date_from);
create index if not exists idx_leave_txn_school   on leave_transactions (school_id);

-- -----------------------------------------------
-- LEAVE REQUESTS (AOII submission -> HRMO review)
-- No employee balance changes occur while a request is pending.
-- -----------------------------------------------
create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references leave_employees(id) on delete cascade,
  school_id text not null,
  requested_by_user uuid not null references auth.users(id) on delete restrict,
  requested_by text not null,
  txn_type text not null check (txn_type in ('VL_DEBIT', 'SL_DEBIT', 'VSC_DEBIT', 'SPECIAL', 'MONETIZE', 'CTO_DEBIT')),
  leave_category text not null,
  leave_type text not null,
  days numeric(5,2) not null check (days > 0),
  date_from date not null,
  date_to date not null,
  reason text,
  remarks text,
  with_pay boolean not null default true,
  monetization_option text check (monetization_option is null or monetization_option ~ '^VL(1[0-9]|2[0-9]|30)$' or monetization_option = 'VL25_SL5'),
  vl_regular_deducted numeric(5,2) not null default 0,
  vl_protected_deducted numeric(5,2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  form6_confirmed boolean not null default false,
  form6_confirmed_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  rejection_reason text,
  cancellation_reason text,
  cancellation_by_authority boolean not null default false,
  cancelled_by text,
  cancelled_at timestamptz,
  transaction_id uuid unique references leave_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_to >= date_from)
);

create index if not exists idx_leave_requests_status on leave_requests (status, created_at);
create index if not exists idx_leave_requests_school on leave_requests (school_id, created_at);
create index if not exists idx_leave_requests_employee on leave_requests (employee_id, created_at);

-- CTO grants are stored as separate dated batches. Queries exclude expires_on <= current_date,
-- which makes forfeiture automatic even when the app was closed on the expiration date.
create table if not exists leave_cto_credits (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references leave_employees(id) on delete cascade,
  school_id text not null,
  granted_days numeric(5,2) not null check (granted_days > 0),
  remaining_days numeric(5,2) not null check (remaining_days >= 0 and remaining_days <= granted_days),
  granted_on date not null,
  expires_on date not null,
  remarks text,
  granted_by text not null,
  created_at timestamptz not null default now(),
  check (expires_on = (granted_on + interval '1 year')::date)
);
create index if not exists idx_cto_employee_expiry on leave_cto_credits(employee_id, expires_on) where remaining_days > 0;

-- -----------------------------------------------
-- ACCRUAL LOG TABLE
-- (Monthly auto-accrual log for Non-Teaching)
-- -----------------------------------------------
create table if not exists leave_accrual_log (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references leave_employees(id) on delete cascade,
  accrual_month  text not null,               -- e.g. '2026-08'
  vl_credited    numeric(4,2) default 1.25,
  sl_credited    numeric(4,2) default 1.25,
  run_by         text,
  run_at         timestamptz default now(),
  unique(employee_id, accrual_month)          -- prevent double accrual
);

-- -----------------------------------------------
-- SCHOOL YEAR CONFIG
-- -----------------------------------------------
create table if not exists leave_sy_config (
  id           uuid primary key default gen_random_uuid(),
  school_year  text not null unique,          -- e.g. '2026-2027'
  date_start   date not null,
  date_end     date not null,
  is_current   boolean default false,
  created_at   timestamptz default now()
);

insert into leave_sy_config (school_year, date_start, date_end, is_current)
values ('2026-2027', '2026-06-01', '2027-03-31', true)
on conflict do nothing;

-- -----------------------------------------------
-- ROW LEVEL SECURITY
-- -----------------------------------------------
alter table leave_employees      enable row level security;
alter table leave_transactions   enable row level security;
alter table leave_requests       enable row level security;
alter table leave_cto_credits    enable row level security;
alter table leave_accrual_log    enable row level security;
alter table leave_sy_config      enable row level security;

-- -----------------------------------------------
-- HELPER FUNCTIONS
-- -----------------------------------------------

-- Months of service (for auto-computed balances in views)
create or replace function months_of_service(hired date, ref_date date default current_date)
returns integer language sql immutable as $$
  select greatest(0,
    (extract(year from age(ref_date, hired)) * 12 +
     extract(month from age(ref_date, hired)))::integer
  );
$$;

-- -----------------------------------------------
-- COMPUTED BALANCE VIEW (convenience for queries)
-- -----------------------------------------------
create or replace view leave_balances as
select
  e.id,
  e.school_id,
  e.last_name,
  e.first_name,
  e.middle_name,
  e.employee_no,
  e.position,
  e.emp_type,
  e.emp_status,
  e.hired_date,
  e.salary_grade,
  e.salary_step,
  e.salary_step_mode,
  e.salary_step_basis_date,
  e.monthly_salary,
  e.is_active,

  -- Non-Teaching computed balances
  case when e.emp_type = 'Non-Teaching' then
    coalesce(e.vl_override,
      greatest(0, round((months_of_service(e.hired_date) * 1.25 - e.vl_used)::numeric, 2)))
  end as vl_balance,

  case when e.emp_type = 'Non-Teaching' then
    coalesce(e.sl_override,
      greatest(0, round((months_of_service(e.hired_date) * 1.25 - e.sl_used)::numeric, 2)))
  end as sl_balance,

  case when e.emp_type = 'Non-Teaching' then
    round((months_of_service(e.hired_date) * 1.25)::numeric, 2)
  end as vl_total_earned,

  e.vl_used,
  e.sl_used,

  -- Teaching VSC
  case when e.emp_type = 'Teaching' then e.vsc_balance end as vsc_balance,
  case when e.emp_type = 'Teaching' then e.vsc_used    end as vsc_used,
  case when e.emp_type = 'Teaching' then e.vsc_earned_this_sy end as vsc_earned_this_sy,
  case when e.emp_type = 'Teaching' then e.vsc_max     end as vsc_max,

  months_of_service(e.hired_date) as months_served,
  e.notes
from leave_employees e
where e.is_active = true;
