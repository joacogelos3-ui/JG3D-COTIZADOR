-- JG3D: additive receipt storage. Does not alter workspaces or existing data.
create schema if not exists jg3d_private;
revoke all on schema jg3d_private from public, anon, authenticated;

create table jg3d_private.receipt_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  year integer not null,
  last_number integer not null check (last_number > 0),
  primary key (user_id, year)
);
alter table jg3d_private.receipt_counters enable row level security;
create policy receipt_counters_read_own on jg3d_private.receipt_counters for select to authenticated
  using ((select auth.uid()) = user_id);

create table public.receipts (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  number text not null,
  issued_at timestamptz not null default now(),
  paid_date date not null,
  client_id text not null,
  source_quote_id text,
  client jsonb not null,
  language text not null check (language in ('es','en','pt')),
  items jsonb not null,
  currency text not null check (currency in ('USD','ARS','BRL')),
  exchange_rate numeric(22,10) not null check (exchange_rate > 0),
  exchange_info jsonb not null default '{}'::jsonb,
  gross_usd numeric(14,2) not null check (gross_usd > 0),
  paid_amount numeric(16,2) not null check (paid_amount > 0),
  fee_amount numeric(16,2) not null default 0 check (fee_amount >= 0 and fee_amount <= paid_amount),
  payment_method text not null check (payment_method in ('paypal','transfer','mercadopago','wise','cash','other')),
  transaction_ref text not null default '',
  notes text not null default '',
  status text not null default 'paid' check (status in ('paid','sent','void')),
  sent_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  unique(user_id, number),
  check (jsonb_typeof(client) = 'object'),
  check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30)
);
create index receipts_owner_date on public.receipts(user_id, paid_date desc, id);
create index receipts_owner_client on public.receipts(user_id, client_id);
create unique index receipts_transaction_unique on public.receipts(user_id, payment_method, transaction_ref)
  where transaction_ref <> '' and status <> 'void';
alter table public.receipts enable row level security;
create policy receipts_read_own on public.receipts for select to authenticated using ((select auth.uid()) = user_id);
create policy receipts_insert_own on public.receipts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy receipts_update_own on public.receipts for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.receipts from public, anon, authenticated;
grant select on public.receipts to authenticated;
grant insert (id,paid_date,client_id,source_quote_id,client,language,items,currency,exchange_rate,exchange_info,paid_amount,fee_amount,payment_method,transaction_ref,notes) on public.receipts to authenticated;
grant update (status,void_reason) on public.receipts to authenticated;

-- The trigger alone can access the private counter. It verifies auth.uid() explicitly.
create function jg3d_private.prepare_receipt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  item jsonb; amount numeric := 0; qty numeric; price numeric; seq integer; y integer;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Receipt owner mismatch' using errcode='42501';
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'void' then raise exception 'Voided receipts are immutable'; end if;
    if new.status = 'void' then
      if length(trim(coalesce(new.void_reason,''))) < 3 then raise exception 'Enter a void reason'; end if;
      new.voided_at := now();
    elsif new.status = 'sent' then
      new.sent_at := coalesce(old.sent_at, now());
    elsif new.status <> old.status then raise exception 'Invalid receipt transition';
    end if;
    return new;
  end if;
  if new.paid_date > (now() at time zone 'America/Argentina/Cordoba')::date then
    raise exception 'Payment date cannot be in the future';
  end if;
  if length(trim(coalesce(new.client->>'name',''))) = 0 or length(trim(new.client_id)) = 0 then
    raise exception 'Client is required';
  end if;
  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) not between 1 and 30 then
    raise exception 'Between 1 and 30 items are required';
  end if;
  for item in select value from jsonb_array_elements(new.items) loop
    qty := (item->>'quantity')::numeric; price := (item->>'unitUsd')::numeric;
    if qty is null or qty < 1 or qty > 10000 or qty <> trunc(qty) or price is null
      or price < 0 or price > 1000000 or price <> round(price,2)
      or length(trim(coalesce(item->>'name',''))) = 0 then
      raise exception 'Invalid receipt item';
    end if;
    if coalesce(item->>'url','') <> '' and (item->>'url') !~* '^https?://' then
      raise exception 'Delivery links must use https or http';
    end if;
    amount := amount + qty * price;
  end loop;
  new.gross_usd := round(amount,2);
  if abs(new.paid_amount - round(new.gross_usd * new.exchange_rate,2)) > .01 then
    raise exception 'Amount and exchange rate do not agree';
  end if;
  if new.currency = 'USD' and new.exchange_rate <> 1 then raise exception 'USD exchange rate must be 1'; end if;
  new.status := 'paid'; new.sent_at := null; new.voided_at := null; new.void_reason := null;
  new.issued_at := now();
  y := extract(year from now() at time zone 'America/Argentina/Cordoba');
  insert into jg3d_private.receipt_counters(user_id,year,last_number) values(new.user_id,y,1)
    on conflict(user_id,year) do update set last_number=receipt_counters.last_number+1
    returning last_number into seq;
  new.number := 'JG3D-R-' || y || '-' || lpad(seq::text,greatest(3,length(seq::text)),'0');
  return new;
end;
$$;
revoke all on function jg3d_private.prepare_receipt() from public, anon, authenticated;
create trigger prepare_receipt before insert or update on public.receipts
  for each row execute function jg3d_private.prepare_receipt();
