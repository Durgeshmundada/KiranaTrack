-- KiranaTrack hardening migration (2026-02-24)
-- Safe to run multiple times.

create unique index if not exists ux_vendors_name_ci on public.vendors (lower(name));

create unique index if not exists ux_bills_vendor_image_hash
  on public.bills (vendor_id, image_hash)
  where image_hash <> 'pending' and image_hash <> '';

create index if not exists idx_bills_date_desc on public.bills (date desc);
create index if not exists idx_payments_date_desc on public.payments (date desc);
