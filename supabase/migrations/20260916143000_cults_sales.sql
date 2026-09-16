-- JG3D: private Cults sales imported by the authenticated sync Edge Function.
create table public.cults_sales (
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text not null,
  sold_at timestamptz not null,
  paid_out_at timestamptz,
  buyer_nick text not null default '',
  product_name text not null default '',
  product_url text not null default '',
  country_code text not null default '',
  country_name text not null default '',
  country_flag text not null default '',
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  gross_excluding_tax numeric(16,2) not null,
  commission numeric(16,2) not null,
  net_income numeric(16,2) not null,
  total_taxed numeric(16,2) not null,
  vat numeric(16,2) not null,
  commission_percent numeric(8,3) not null default 0,
  vat_percent numeric(8,3) not null default 0,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  primary key (user_id, external_id)
);

create index cults_sales_owner_date on public.cults_sales(user_id, sold_at desc, external_id);
create index cults_sales_owner_product on public.cults_sales(user_id, product_name);
alter table public.cults_sales enable row level security;

create policy cults_sales_read_own on public.cults_sales
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.cults_sales from public, anon, authenticated;
grant select on public.cults_sales to authenticated;

create table public.cults_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  remote_total integer not null default 0 check (remote_total >= 0),
  active_total integer not null default 0 check (active_total >= 0),
  last_error text not null default ''
);

alter table public.cults_sync_state enable row level security;
create policy cults_sync_state_read_own on public.cults_sync_state
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.cults_sync_state from public, anon, authenticated;
grant select on public.cults_sync_state to authenticated;
