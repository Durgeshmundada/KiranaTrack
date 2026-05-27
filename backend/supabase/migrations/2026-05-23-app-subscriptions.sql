create table if not exists public.app_billing_config (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_subscriptions (
  owner_user_id text primary key,
  razorpay_subscription_id text not null unique,
  plan_id text not null,
  status text not null check (
    status in (
      'created',
      'authenticated',
      'active',
      'pending',
      'halted',
      'cancelled',
      'completed',
      'expired',
      'paused',
      'resumed',
      'unknown'
    )
  ),
  short_url text,
  current_start timestamptz,
  current_end timestamptz,
  charge_at timestamptz,
  start_at timestamptz,
  end_at timestamptz,
  ended_at timestamptz,
  paid_count integer not null default 0 check (paid_count >= 0),
  total_count integer not null default 0 check (total_count >= 0),
  autopay_enabled boolean not null default false,
  last_payment_id text,
  last_event_id text,
  last_event_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_subscription_payments (
  payment_id text primary key,
  owner_user_id text not null,
  razorpay_subscription_id text not null references public.app_subscriptions(razorpay_subscription_id) on delete restrict,
  amount_paise integer not null check (amount_paise >= 0),
  currency text not null default 'INR',
  status text,
  method text,
  captured_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.razorpay_webhook_events (
  id text primary key,
  event_name text not null,
  processed_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_app_subscriptions_status_end
  on public.app_subscriptions (status, current_end desc);

create index if not exists idx_app_subscription_payments_owner_created
  on public.app_subscription_payments (owner_user_id, created_at desc);

create index if not exists idx_razorpay_webhook_events_processed
  on public.razorpay_webhook_events (processed_at desc);

drop trigger if exists trg_app_billing_config_set_updated_at on public.app_billing_config;
create trigger trg_app_billing_config_set_updated_at
before update on public.app_billing_config
for each row
execute function public.set_updated_at();

drop trigger if exists trg_app_subscriptions_set_updated_at on public.app_subscriptions;
create trigger trg_app_subscriptions_set_updated_at
before update on public.app_subscriptions
for each row
execute function public.set_updated_at();
