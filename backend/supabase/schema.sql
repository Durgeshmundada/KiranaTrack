-- KiranaTrack schema for Supabase Postgres

create table if not exists public.vendors (
  id text primary key check (id ~ '^[0-9a-f]{24}$'),
  name text not null,
  phone text,
  gst_number text,
  default_collector_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

create table if not exists public.bills (
  id text primary key check (id ~ '^[0-9a-f]{24}$'),
  bill_number text not null,
  vendor_id text not null references public.vendors(id) on delete restrict,
  date timestamptz not null,
  total_amount_paise integer not null check (total_amount_paise >= 0),
  image_url text not null,
  image_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, bill_number)
);

create table if not exists public.bill_line_items (
  id text primary key check (id ~ '^[0-9a-f]{24}$'),
  bill_id text not null references public.bills(id) on delete cascade,
  name text not null,
  qty double precision not null check (qty > 0),
  rate_paise integer not null check (rate_paise >= 0),
  amount_paise integer not null check (amount_paise >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id text primary key check (id ~ '^[0-9a-f]{24}$'),
  bill_id text not null references public.bills(id) on delete cascade,
  amount_paise integer not null check (amount_paise > 0),
  date timestamptz not null default now(),
  collector_name text,
  mode text not null check (mode in ('cash', 'upi', 'cheque', 'other')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_edit_logs (
  id text primary key check (id ~ '^[0-9a-f]{24}$'),
  payment_id text not null references public.payments(id) on delete cascade,
  edited_at timestamptz not null,
  previous_amount_paise integer not null,
  previous_date timestamptz not null
);

create table if not exists public.out_of_stock_items (
  id text primary key check (id ~ '^[0-9a-f]{24}$'),
  item_name text not null,
  status text not null check (status in ('pending', 'ordered', 'restocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.udhaar_customers (
  id text primary key check (id ~ '^[0-9a-f]{24}$'),
  customer_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.udhaar_entries (
  id text primary key check (id ~ '^[0-9a-f]{24}$'),
  customer_id text not null references public.udhaar_customers(id) on delete cascade,
  type text not null check (type in ('credit', 'repayment')),
  amount_paise integer not null check (amount_paise > 0),
  description text,
  date timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_bills_vendor_date on public.bills (vendor_id, date desc);
create index if not exists idx_bills_date_desc on public.bills (date desc);
create unique index if not exists ux_vendors_name_ci on public.vendors (lower(name));
create unique index if not exists ux_bills_vendor_image_hash
  on public.bills (vendor_id, image_hash)
  where image_hash <> 'pending' and image_hash <> '';
create index if not exists idx_bill_line_items_bill on public.bill_line_items (bill_id);
create index if not exists idx_payments_bill_date on public.payments (bill_id, date desc);
create index if not exists idx_payments_date_desc on public.payments (date desc);
create index if not exists idx_payment_logs_payment on public.payment_edit_logs (payment_id, edited_at desc);
create index if not exists idx_oos_item_status on public.out_of_stock_items (item_name, status);
create index if not exists idx_udhaar_customers_name on public.udhaar_customers (customer_name);
create index if not exists idx_udhaar_entries_customer_date on public.udhaar_entries (customer_id, date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_vendors_set_updated_at on public.vendors;
create trigger trg_vendors_set_updated_at
before update on public.vendors
for each row
execute function public.set_updated_at();

drop trigger if exists trg_bills_set_updated_at on public.bills;
create trigger trg_bills_set_updated_at
before update on public.bills
for each row
execute function public.set_updated_at();

drop trigger if exists trg_payments_set_updated_at on public.payments;
create trigger trg_payments_set_updated_at
before update on public.payments
for each row
execute function public.set_updated_at();

drop trigger if exists trg_oos_set_updated_at on public.out_of_stock_items;
create trigger trg_oos_set_updated_at
before update on public.out_of_stock_items
for each row
execute function public.set_updated_at();

drop trigger if exists trg_udhaar_customers_set_updated_at on public.udhaar_customers;
create trigger trg_udhaar_customers_set_updated_at
before update on public.udhaar_customers
for each row
execute function public.set_updated_at();

-- Enable RLS on all existing public tables and allow only service role JWT access
-- for direct PostgREST calls. Backend server queries still run with DB credentials.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table %I.%I enable row level security', r.schemaname, r.tablename);

    if not exists (
      select 1
      from pg_policies
      where schemaname = r.schemaname
        and tablename = r.tablename
        and policyname = 'service_role_all'
    ) then
      execute format(
        'create policy service_role_all on %I.%I for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')',
        r.schemaname,
        r.tablename
      );
    end if;
  end loop;
end;
$$;

create or replace function public.enable_rls_on_new_public_tables()
returns event_trigger
language plpgsql
as $$
declare
  cmd record;
begin
  for cmd in
    select schema_name, object_identity, objid
    from pg_event_trigger_ddl_commands()
    where command_tag = 'CREATE TABLE'
      and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', cmd.object_identity);

    if not exists (
      select 1
      from pg_policies
      where schemaname = cmd.schema_name
        and tablename = (select relname from pg_class where oid = cmd.objid)
        and policyname = 'service_role_all'
    ) then
      execute format(
        'create policy service_role_all on %s for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')',
        cmd.object_identity
      );
    end if;
  end loop;
end;
$$;

drop event trigger if exists trg_enable_rls_on_new_public_tables;
create event trigger trg_enable_rls_on_new_public_tables
on ddl_command_end
when tag in ('CREATE TABLE')
execute function public.enable_rls_on_new_public_tables();
