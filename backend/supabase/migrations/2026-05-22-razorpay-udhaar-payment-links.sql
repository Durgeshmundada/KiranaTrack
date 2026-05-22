create table if not exists public.razorpay_udhaar_payment_links (
  id text primary key,
  reference_id text not null unique,
  owner_user_id text not null,
  customer_id text not null references public.udhaar_customers(id) on delete restrict,
  amount_paise integer not null check (amount_paise > 0),
  amount_paid_paise integer not null default 0 check (amount_paid_paise >= 0),
  short_url text not null,
  status text not null check (status in ('created', 'paid', 'cancelled', 'expired', 'failed')),
  razorpay_payment_id text,
  webhook_event_id text,
  repayment_entry_id text references public.udhaar_entries(id) on delete restrict,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_razorpay_udhaar_links_customer_status
  on public.razorpay_udhaar_payment_links (customer_id, status, created_at desc);

create index if not exists idx_razorpay_udhaar_links_owner_created
  on public.razorpay_udhaar_payment_links (owner_user_id, created_at desc);
