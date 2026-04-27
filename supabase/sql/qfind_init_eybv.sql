-- QFind: schema + RPC + seed for project eybvjylqsiyvycaqkcqb
-- Run in Supabase Dashboard → SQL Editor (project eybv... only).

-- Extensions
create extension if not exists postgis;
create extension if not exists pgcrypto;

-- Owners (local UUIDs stored on devices)
create table if not exists public.owners (
  id uuid primary key,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  cashback_balance numeric not null default 0
);

-- Beta access codes (quota for create_shop; insert rows via SQL / dashboard; store code as upper(trim(...)))
create table if not exists public.beta_access_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  uses_remaining integer not null check (uses_remaining >= 0),
  note text,
  created_at timestamptz not null default now(),
  constraint beta_access_codes_code_key unique (code)
);

insert into public.beta_access_codes (code, uses_remaining, note)
values ('QFIND2026', 1, 'seed')
on conflict (code) do nothing;

-- Shops
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_uuid uuid,
  name text not null,
  address text,
  category text,
  phone text,
  open_time text,
  close_time text,
  logo_url text,
  cover_url text,
  location geography(point, 4326) not null,
  created_at timestamptz not null default now()
);

create index if not exists shops_location_gix on public.shops using gist (location);
create index if not exists shops_owner_uuid_idx on public.shops(owner_uuid);

-- Ensure FK exists (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shops_owner_uuid_fkey'
  ) then
    alter table public.shops
      add constraint shops_owner_uuid_fkey
      foreign key (owner_uuid) references public.owners(id) on delete restrict;
  end if;
end $$;

-- Products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  description text,
  image_urls jsonb not null default '[]'::jsonb,
  price numeric,
  discount_price numeric,
  currency text default 'EUR',
  in_stock boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.products add column if not exists image_urls jsonb not null default '[]'::jsonb;

create index if not exists products_shop_id_idx on public.products(shop_id);

-- Sections par magasin (produits rattachés via products.section_id)
create table if not exists public.shop_sections (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  title text not null,
  sort_order int not null default 0
);

create index if not exists shop_sections_shop_id_idx on public.shop_sections(shop_id);

alter table public.products add column if not exists section_id uuid references public.shop_sections(id) on delete set null;

create index if not exists products_section_id_idx on public.products(section_id);

-- RLS
alter table public.shops enable row level security;
alter table public.products enable row level security;
alter table public.owners enable row level security;

drop policy if exists "public_read_shops" on public.shops;
create policy "public_read_shops" on public.shops
  for select
  to anon, authenticated
  using (true);

drop policy if exists "public_read_products" on public.products;
create policy "public_read_products" on public.products
  for select
  to anon, authenticated
  using (true);

alter table public.shop_sections enable row level security;

drop policy if exists "public_read_shop_sections" on public.shop_sections;
create policy "public_read_shop_sections" on public.shop_sections
  for select
  to anon, authenticated
  using (true);

alter table public.beta_access_codes enable row level security;

revoke all on table public.beta_access_codes from anon;
revoke all on table public.beta_access_codes from authenticated;
revoke all on table public.beta_access_codes from public;

-- Storage: product images (public bucket)
insert into storage.buckets (id, name, public)
values ('product_images', 'product_images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "public_read_product_images" on storage.objects;
create policy "public_read_product_images" on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'product_images');

drop policy if exists "public_insert_product_images" on storage.objects;
create policy "public_insert_product_images" on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'product_images');

-- Storage: shop images (public bucket)
insert into storage.buckets (id, name, public)
values ('shop_images', 'shop_images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "public_read_shop_images" on storage.objects;
create policy "public_read_shop_images" on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'shop_images');

drop policy if exists "public_insert_shop_images" on storage.objects;
create policy "public_insert_shop_images" on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'shop_images');

-- RPC: ensure a section exists for a shop (returns section_id)
create or replace function public.create_shop_section(
  p_shop_id uuid,
  p_title text,
  p_sort_order int default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sec_id uuid;
begin
  if p_title is null or btrim(p_title) = '' then
    return null;
  end if;

  insert into public.shop_sections (shop_id, title, sort_order)
  values (p_shop_id, btrim(p_title), coalesce(p_sort_order, 0))
  on conflict do nothing;

  select id into sec_id
  from public.shop_sections
  where shop_id = p_shop_id and lower(title) = lower(btrim(p_title))
  order by sort_order asc, id asc
  limit 1;

  return sec_id;
end;
$$;

revoke all on function public.create_shop_section(uuid, text, int) from public;
grant execute on function public.create_shop_section(uuid, text, int) to anon, authenticated;

-- RPC: create a product (optionally ensuring/assigning a section by title)
create or replace function public.create_product(
  p_shop_id uuid,
  p_name text,
  p_description text default null,
  p_price numeric default null,
  p_discount_price numeric default null,
  p_currency text default 'EUR',
  p_in_stock boolean default true,
  p_image_urls jsonb default '[]'::jsonb,
  p_section_title text default null
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  sec_id uuid;
  new_prod public.products;
begin
  if p_section_title is not null and btrim(p_section_title) <> '' then
    sec_id := public.create_shop_section(p_shop_id, p_section_title, 0);
  else
    sec_id := null;
  end if;

  insert into public.products (
    shop_id,
    section_id,
    name,
    description,
    image_urls,
    price,
    discount_price,
    currency,
    in_stock
  )
  values (
    p_shop_id,
    sec_id,
    p_name,
    p_description,
    coalesce(p_image_urls, '[]'::jsonb),
    p_price,
    p_discount_price,
    coalesce(p_currency, 'EUR'),
    coalesce(p_in_stock, true)
  )
  returning * into new_prod;

  return new_prod;
end;
$$;

revoke all on function public.create_product(uuid, text, text, numeric, numeric, text, boolean, jsonb, text) from public;
grant execute on function public.create_product(uuid, text, text, numeric, numeric, text, boolean, jsonb, text) to anon, authenticated;

-- RPC: update a product (optionally ensuring/assigning a section by title)
create or replace function public.update_product(
  p_product_id uuid,
  p_shop_id uuid,
  p_name text default null,
  p_description text default null,
  p_price numeric default null,
  p_discount_price numeric default null,
  p_currency text default null,
  p_in_stock boolean default null,
  p_image_urls jsonb default null,
  p_section_title text default null
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  sec_id uuid;
  updated public.products;
begin
  if p_section_title is not null and btrim(p_section_title) <> '' then
    sec_id := public.create_shop_section(p_shop_id, p_section_title, 0);
  else
    sec_id := null;
  end if;

  update public.products
  set
    name = coalesce(p_name, name),
    description = coalesce(p_description, description),
    price = coalesce(p_price, price),
    discount_price = p_discount_price,
    currency = coalesce(p_currency, currency),
    in_stock = coalesce(p_in_stock, in_stock),
    image_urls = coalesce(p_image_urls, image_urls),
    section_id = coalesce(sec_id, section_id)
  where id = p_product_id
    and shop_id = p_shop_id
  returning * into updated;

  return updated;
end;
$$;

revoke all on function public.update_product(uuid, uuid, text, text, numeric, numeric, text, boolean, jsonb, text) from public;
grant execute on function public.update_product(uuid, uuid, text, text, numeric, numeric, text, boolean, jsonb, text) to anon, authenticated;

-- RPC: register/refresh an owner UUID (device install)
create or replace function public.ensure_owner(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.owners (id, last_seen_at)
  values (p_owner, now())
  on conflict (id) do update
    set last_seen_at = excluded.last_seen_at;
end;
$$;

revoke all on function public.ensure_owner(uuid) from public;
grant execute on function public.ensure_owner(uuid) to anon, authenticated;

-- Persist cashback balance per owner (updated automatically from wallet_transactions)
create or replace function public.update_owner_cashback_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta numeric := 0;
  old_delta numeric := 0;
  new_delta numeric := 0;
  owner_id uuid;
begin
  if tg_op = 'INSERT' then
    owner_id := new.owner_uuid;
    if new.type in ('cashback','adjustment') then
      delta := coalesce(new.amount, 0);
    elsif new.type = 'purchase' then
      delta := -coalesce(nullif(new.meta->>'cashback_used_amount','')::numeric, 0);
    end if;

    update public.owners
    set cashback_balance = cashback_balance + delta,
        last_seen_at = now()
    where id = owner_id;

    return new;
  elsif tg_op = 'DELETE' then
    owner_id := old.owner_uuid;
    if old.type in ('cashback','adjustment') then
      delta := -coalesce(old.amount, 0);
    elsif old.type = 'purchase' then
      delta := coalesce(nullif(old.meta->>'cashback_used_amount','')::numeric, 0);
    end if;

    update public.owners
    set cashback_balance = cashback_balance + delta,
        last_seen_at = now()
    where id = owner_id;

    return old;
  elsif tg_op = 'UPDATE' then
    if old.owner_uuid is distinct from new.owner_uuid then
      if old.type in ('cashback','adjustment') then
        old_delta := -coalesce(old.amount, 0);
      elsif old.type = 'purchase' then
        old_delta := coalesce(nullif(old.meta->>'cashback_used_amount','')::numeric, 0);
      end if;
      update public.owners
      set cashback_balance = cashback_balance + old_delta,
          last_seen_at = now()
      where id = old.owner_uuid;

      if new.type in ('cashback','adjustment') then
        new_delta := coalesce(new.amount, 0);
      elsif new.type = 'purchase' then
        new_delta := -coalesce(nullif(new.meta->>'cashback_used_amount','')::numeric, 0);
      end if;
      update public.owners
      set cashback_balance = cashback_balance + new_delta,
          last_seen_at = now()
      where id = new.owner_uuid;

      return new;
    end if;

    owner_id := new.owner_uuid;

    if old.type in ('cashback','adjustment') then
      delta := delta - coalesce(old.amount, 0);
    elsif old.type = 'purchase' then
      delta := delta + coalesce(nullif(old.meta->>'cashback_used_amount','')::numeric, 0);
    end if;

    if new.type in ('cashback','adjustment') then
      delta := delta + coalesce(new.amount, 0);
    elsif new.type = 'purchase' then
      delta := delta - coalesce(nullif(new.meta->>'cashback_used_amount','')::numeric, 0);
    end if;

    if delta <> 0 then
      update public.owners
      set cashback_balance = cashback_balance + delta,
          last_seen_at = now()
      where id = owner_id;
    end if;

    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_update_owner_cashback_balance on public.wallet_transactions;
create trigger trg_update_owner_cashback_balance
after insert or update or delete on public.wallet_transactions
for each row execute function public.update_owner_cashback_balance();

-- RPC: check beta code (read-only; does not consume a use)
create or replace function public.verify_beta_access_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c text := upper(trim(coalesce(p_code, '')));
begin
  if length(c) = 0 then
    return false;
  end if;
  return exists (
    select 1
    from public.beta_access_codes b
    where b.code = c
      and b.uses_remaining > 0
  );
end;
$$;

revoke all on function public.verify_beta_access_code(text) from public;
grant execute on function public.verify_beta_access_code(text) to anon, authenticated;

-- RPC: create a shop owned by a device UUID (consumes one beta code use atomically)
drop function if exists public.create_shop(uuid, text, double precision, double precision, text, text, text, text, text, text, text);

create or replace function public.create_shop(
  p_owner uuid,
  p_name text,
  p_lat double precision,
  p_lng double precision,
  p_beta_code text,
  p_address text default null,
  p_category text default null,
  p_phone text default null,
  p_open_time text default null,
  p_close_time text default null,
  p_logo_url text default null,
  p_cover_url text default null
)
returns public.shops
language plpgsql
security definer
set search_path = public
as $$
declare
  new_shop public.shops;
  norm_code text := upper(trim(coalesce(p_beta_code, '')));
  consumed_id uuid;
begin
  if length(norm_code) = 0 then
    raise exception 'invalid_or_exhausted_beta_code' using errcode = 'P0001';
  end if;

  update public.beta_access_codes
  set uses_remaining = uses_remaining - 1
  where code = norm_code
    and uses_remaining > 0
  returning id into consumed_id;

  if consumed_id is null then
    raise exception 'invalid_or_exhausted_beta_code' using errcode = 'P0001';
  end if;

  perform public.ensure_owner(p_owner);

  insert into public.shops (
    owner_uuid,
    name,
    address,
    category,
    phone,
    open_time,
    close_time,
    logo_url,
    cover_url,
    location
  )
  values (
    p_owner,
    p_name,
    p_address,
    p_category,
    p_phone,
    p_open_time,
    p_close_time,
    p_logo_url,
    p_cover_url,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
  )
  returning * into new_shop;

  return new_shop;
end;
$$;

revoke all on function public.create_shop(uuid, text, double precision, double precision, text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_shop(uuid, text, double precision, double precision, text, text, text, text, text, text, text, text) to anon, authenticated;

-- RPC: update a shop (owned by a device UUID)
create or replace function public.update_shop(
  p_shop_id uuid,
  p_owner uuid,
  p_name text default null,
  p_address text default null,
  p_category text default null,
  p_phone text default null,
  p_open_time text default null,
  p_close_time text default null,
  p_logo_url text default null,
  p_cover_url text default null
)
returns public.shops
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.shops;
begin
  -- Basic ownership check (this app uses a per-device owner UUID)
  if not exists (
    select 1
    from public.shops s
    where s.id = p_shop_id
      and s.owner_uuid = p_owner
  ) then
    raise exception 'not_owner_or_not_found';
  end if;

  update public.shops
  set
    name = coalesce(p_name, name),
    address = coalesce(p_address, address),
    category = coalesce(p_category, category),
    phone = coalesce(p_phone, phone),
    open_time = coalesce(p_open_time, open_time),
    close_time = coalesce(p_close_time, close_time),
    logo_url = coalesce(p_logo_url, logo_url),
    cover_url = coalesce(p_cover_url, cover_url)
  where id = p_shop_id
    and owner_uuid = p_owner
  returning * into updated;

  return updated;
end;
$$;

revoke all on function public.update_shop(uuid, uuid, text, text, text, text, text, text, text, text) from public;
grant execute on function public.update_shop(uuid, uuid, text, text, text, text, text, text, text, text) to anon, authenticated;

-- RPC: delete a shop (owned by a device UUID; cascades products/sections)
create or replace function public.delete_shop(
  p_shop_id uuid,
  p_owner uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.shops s
    where s.id = p_shop_id
      and s.owner_uuid = p_owner
  ) then
    raise exception 'not_owner_or_not_found';
  end if;

  delete from public.shops
  where id = p_shop_id
    and owner_uuid = p_owner;
end;
$$;

revoke all on function public.delete_shop(uuid, uuid) from public;
grant execute on function public.delete_shop(uuid, uuid) to anon, authenticated;

-- RPC: nearest shops + random product per shop (capped by products_limit)
create or replace function public.get_nearby(
  lat double precision,
  lng double precision,
  shops_limit integer default 5,
  products_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  user_point geography;
  nearby_shops jsonb;
  nearby_products jsonb;
begin
  user_point := st_setsrid(st_makepoint(lng, lat), 4326)::geography;

  with nearest_shops as (
    select
      s.id,
      s.name,
      s.address,
      s.category,
      s.phone,
      s.open_time,
      s.close_time,
      s.logo_url,
      s.cover_url,
      st_y(s.location::geometry) as latitude,
      st_x(s.location::geometry) as longitude,
      st_distance(s.location, user_point) as distance_m
    from public.shops s
    order by s.location <-> user_point
    limit shops_limit
  )
  select coalesce(jsonb_agg(to_jsonb(ns) order by ns.distance_m asc), '[]'::jsonb)
  into nearby_shops
  from nearest_shops ns;

  with nearest_shops as (
    select
      s.id,
      st_distance(s.location, user_point) as distance_m
    from public.shops s
    order by s.location <-> user_point
    limit shops_limit
  ),
  one_product_per_shop as (
    select
      ns.id as shop_id,
      p.id,
      p.name,
      p.description,
      p.price,
      p.discount_price,
      p.currency,
      p.in_stock,
      p.image_urls,
      ns.distance_m
    from nearest_shops ns
    join lateral (
      select *
      from public.products p
      where p.shop_id = ns.id
      order by random()
      limit 1
    ) p on true
  ),
  limited_products as (
    select *
    from one_product_per_shop
    order by distance_m asc
    limit products_limit
  )
  select coalesce(jsonb_agg(to_jsonb(lp) order by lp.distance_m asc), '[]'::jsonb)
  into nearby_products
  from limited_products lp;

  return jsonb_build_object(
    'nearbyShops', nearby_shops,
    'nearbyProducts', nearby_products
  );
end;
$$;

revoke all on function public.get_nearby(double precision, double precision, integer, integer) from public;
grant execute on function public.get_nearby(double precision, double precision, integer, integer) to anon, authenticated;

-- RPC: paginated nearby products (max N per shop, prefer different sections when possible)
create or replace function public.get_nearby_products(
  lat double precision,
  lng double precision,
  "limit" integer default 8,
  "offset" integer default 0,
  per_shop_max integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  user_point geography;
  products_json jsonb;
  total_count integer;
  has_more boolean;
begin
  user_point := st_setsrid(st_makepoint(lng, lat), 4326)::geography;

  with nearest_shops as (
    select
      s.id as shop_id,
      s.name as shop_name,
      s.address as shop_address,
      st_distance(s.location, user_point) as distance_m
    from public.shops s
    order by s.location <-> user_point
  ),
  products_ranked as (
    select
      p.id,
      p.shop_id,
      p.section_id,
      p.name,
      p.description,
      p.price,
      p.discount_price,
      p.currency,
      p.in_stock,
      p.image_urls,
      p.created_at,
      ns.shop_name,
      ns.shop_address,
      ns.distance_m,
      row_number() over (
        partition by p.shop_id, coalesce(p.section_id, '00000000-0000-0000-0000-000000000000'::uuid)
        order by p.created_at desc, p.id asc
      ) as rn_in_section
    from nearest_shops ns
    join public.products p on p.shop_id = ns.shop_id
  ),
  candidates as (
    select
      pr.*,
      row_number() over (
        partition by pr.shop_id
        order by
          case when pr.rn_in_section = 1 then 0 else 1 end,
          pr.created_at desc,
          pr.id asc
      ) as rn_in_shop
    from products_ranked pr
  ),
  eligible as (
    select *
    from candidates
    where rn_in_shop <= greatest(per_shop_max, 0)
  ),
  eligible_ordered as (
    select *
    from eligible
    order by distance_m asc, shop_id asc, rn_in_shop asc, id asc
  ),
  total as (
    select count(*)::int as total_count
    from eligible
  ),
  page as (
    select *
    from eligible_ordered
    offset greatest("offset", 0)
    limit greatest("limit", 0)
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'shop_id', p.shop_id,
          'section_id', p.section_id,
          'name', p.name,
          'description', p.description,
          'price', p.price,
          'discount_price', p.discount_price,
          'currency', p.currency,
          'in_stock', p.in_stock,
          'image_urls', p.image_urls,
          'created_at', p.created_at,
          'distance_m', p.distance_m,
          'shop_name', p.shop_name,
          'shop_address', p.shop_address
        )
        order by p.distance_m asc, p.shop_id asc, p.rn_in_shop asc, p.id asc
      ),
      '[]'::jsonb
    ) as products_json,
    (select t.total_count from total t) as total_count
  into products_json, total_count
  from page p;

  has_more := (greatest("offset", 0) + greatest("limit", 0)) < coalesce(total_count, 0);

  return jsonb_build_object(
    'products', products_json,
    'has_more', has_more,
    'total', coalesce(total_count, 0)
  );
end;
$$;

revoke all on function public.get_nearby_products(double precision, double precision, integer, integer, integer) from public;
grant execute on function public.get_nearby_products(double precision, double precision, integer, integer, integer) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────
-- Profile data: visits + wallet (e-wallet) + unified history
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.shop_visits (
  id uuid primary key default gen_random_uuid(),
  owner_uuid uuid not null references public.owners(id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete cascade,
  entered_at timestamptz not null default now()
);

create index if not exists shop_visits_owner_uuid_idx on public.shop_visits(owner_uuid);
create index if not exists shop_visits_shop_id_idx on public.shop_visits(shop_id);
create index if not exists shop_visits_entered_at_idx on public.shop_visits(entered_at desc);

-- Wallet ledger: positive = cashback, negative = purchase/spend
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_uuid uuid not null references public.owners(id) on delete restrict,
  shop_id uuid references public.shops(id) on delete set null,
  type text not null check (type in ('cashback','purchase','adjustment')),
  -- amount is used only for cashback/adjustment. Purchases are computed from meta.items.
  amount numeric,
  currency text not null default 'EUR',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wallet_transactions_owner_uuid_idx on public.wallet_transactions(owner_uuid);
create index if not exists wallet_transactions_created_at_idx on public.wallet_transactions(created_at desc);
create index if not exists wallet_transactions_shop_id_idx on public.wallet_transactions(shop_id);
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'wallet_transactions_related_transaction_id_fkey'
  ) then
    alter table public.wallet_transactions
      add constraint wallet_transactions_related_transaction_id_fkey
      foreign key (related_transaction_id) references public.wallet_transactions(id) on delete set null;
  end if;
end $$;

alter table public.shop_visits enable row level security;
alter table public.wallet_transactions enable row level security;

-- WARNING: this app currently uses a per-device UUID (not Supabase Auth).
-- These SELECT policies are permissive to keep the app functional with anon keys.
drop policy if exists "public_read_shop_visits" on public.shop_visits;
create policy "public_read_shop_visits" on public.shop_visits
  for select
  to anon, authenticated
  using (true);

drop policy if exists "public_read_wallet_transactions" on public.wallet_transactions;
create policy "public_read_wallet_transactions" on public.wallet_transactions
  for select
  to anon, authenticated
  using (true);

-- RPC: log a shop visit for an owner UUID
create or replace function public.log_shop_visit(
  p_owner uuid,
  p_shop_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_owner is null or p_shop_id is null then
    return;
  end if;

  perform public.ensure_owner(p_owner);

  insert into public.shop_visits (owner_uuid, shop_id, entered_at)
  values (p_owner, p_shop_id, now());
end;
$$;

revoke all on function public.log_shop_visit(uuid, uuid) from public;
grant execute on function public.log_shop_visit(uuid, uuid) to anon, authenticated;

-- RPC: profile summary (wallet balance + last history + my shops)
create or replace function public.get_owner_profile(
  p_owner uuid,
  p_history_limit int default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_history jsonb;
  v_my_shops jsonb;
begin
  if p_owner is null then
    return jsonb_build_object('wallet_balance', 0, 'history', '[]'::jsonb, 'my_shops', '[]'::jsonb);
  end if;

  perform public.ensure_owner(p_owner);

  -- Wallet balance = cashback/adjustment amounts minus cashback used in purchases.
  select coalesce(o.cashback_balance, 0)
  into v_balance
  from public.owners o
  where o.id = p_owner;

  with history_union as (
    select
      'visit'::text as type,
      sv.entered_at as occurred_at,
      s.id as shop_id,
      s.name as shop_name,
      s.address as shop_address,
      s.category as shop_category,
      null::numeric as amount,
      null::text as currency,
      null::jsonb as meta,
      null::uuid as related_transaction_id,
      null::uuid as transaction_id
    from public.shop_visits sv
    join public.shops s on s.id = sv.shop_id
    where sv.owner_uuid = p_owner

    union all

    select
      wt.type as type,
      wt.created_at as occurred_at,
      s.id as shop_id,
      s.name as shop_name,
      s.address as shop_address,
      s.category as shop_category,
      wt.amount as amount,
      wt.currency as currency,
      wt.meta as meta,
      wt.related_transaction_id as related_transaction_id,
      wt.id as transaction_id
    from public.wallet_transactions wt
    left join public.shops s on s.id = wt.shop_id
    where wt.owner_uuid = p_owner
  )
  select coalesce(jsonb_agg(to_jsonb(h) order by h.occurred_at desc), '[]'::jsonb)
  into v_history
  from (
    select *
    from history_union
    order by occurred_at desc
    limit greatest(coalesce(p_history_limit, 20), 0)
  ) h;

  select coalesce(jsonb_agg(to_jsonb(ms) order by ms.created_at desc), '[]'::jsonb)
  into v_my_shops
  from (
    select id, name, address, category, phone, open_time, close_time, logo_url, cover_url, created_at
    from public.shops
    where owner_uuid = p_owner
    order by created_at desc
  ) ms;

  return jsonb_build_object(
    'wallet_balance', coalesce(v_balance, 0),
    'history', v_history,
    'my_shops', v_my_shops
  );
end;
$$;

revoke all on function public.get_owner_profile(uuid, int) from public;
grant execute on function public.get_owner_profile(uuid, int) to anon, authenticated;

-- RPC: receipt / purchase details (uses snapshot stored in wallet_transactions.meta->'items')
create or replace function public.get_wallet_transaction_receipt(
  p_owner uuid,
  p_transaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx record;
  v_items jsonb;
begin
  if p_owner is null or p_transaction_id is null then
    return jsonb_build_object('transaction', null, 'items', '[]'::jsonb);
  end if;

  perform public.ensure_owner(p_owner);

  select
    wt.id as id,
    wt.type as type,
    wt.amount as amount,
    wt.currency as currency,
    wt.meta as meta,
    wt.related_transaction_id as related_transaction_id,
    wt.created_at as created_at,
    s.id as shop_id,
    s.name as shop_name,
    s.address as shop_address,
    s.category as shop_category
  into v_tx
  from public.wallet_transactions wt
  left join public.shops s on s.id = wt.shop_id
  where wt.owner_uuid = p_owner
    and wt.id = p_transaction_id
  limit 1;

  if v_tx.id is null then
    return jsonb_build_object('transaction', null, 'items', '[]'::jsonb);
  end if;

  v_items := coalesce(v_tx.meta->'items', '[]'::jsonb);

  return jsonb_build_object(
    'transaction',
    jsonb_build_object(
      'id', v_tx.id,
      'type', v_tx.type,
      'amount', v_tx.amount,
      'currency', v_tx.currency,
      'created_at', v_tx.created_at,
      'related_transaction_id', v_tx.related_transaction_id,
      'shop_id', v_tx.shop_id,
      'shop_name', v_tx.shop_name,
      'shop_address', v_tx.shop_address,
      'shop_category', v_tx.shop_category,
      'meta', v_tx.meta
    ),
    'items', v_items
  );
end;
$$;

revoke all on function public.get_wallet_transaction_receipt(uuid, uuid) from public;
grant execute on function public.get_wallet_transaction_receipt(uuid, uuid) to anon, authenticated;

-- RPC: clean receipt (items + computed totals; external only)
create or replace function public.get_wallet_transaction_receipt_clean(
  p_owner uuid,
  p_transaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx record;
  v_items jsonb;
  v_total_items numeric;
  v_cashback_used numeric;
  v_total_external numeric;
  v_payments jsonb;
  v_payment_method text;
begin
  if p_owner is null or p_transaction_id is null then
    return jsonb_build_object('transaction', null, 'items', '[]'::jsonb, 'computed_totals', '{}'::jsonb);
  end if;

  perform public.ensure_owner(p_owner);

  select
    wt.id as id,
    wt.type as type,
    wt.amount as amount,
    wt.currency as currency,
    wt.meta as meta,
    wt.related_transaction_id as related_transaction_id,
    wt.created_at as created_at,
    s.id as shop_id,
    s.name as shop_name,
    s.address as shop_address,
    s.category as shop_category
  into v_tx
  from public.wallet_transactions wt
  left join public.shops s on s.id = wt.shop_id
  where wt.owner_uuid = p_owner
    and wt.id = p_transaction_id
  limit 1;

  if v_tx.id is null then
    return jsonb_build_object('transaction', null, 'items', '[]'::jsonb, 'computed_totals', '{}'::jsonb);
  end if;

  v_items := coalesce(v_tx.meta->'items', '[]'::jsonb);
  v_payments := coalesce(v_tx.meta->'payments', '[]'::jsonb);
  v_payment_method := v_tx.meta->>'payment_method';
  v_cashback_used := coalesce(nullif(v_tx.meta->>'cashback_used_amount','')::numeric, 0);

  select coalesce(sum(
    coalesce(nullif(it->>'quantity','')::numeric, 1) *
    coalesce(
      nullif(it->>'unit_discount_price','')::numeric,
      nullif(it->>'unit_price','')::numeric,
      0
    )
  ), 0)
  into v_total_items
  from jsonb_array_elements(v_items) it;

  if jsonb_typeof(v_payments) = 'array' and jsonb_array_length(v_payments) > 0 then
    select coalesce(sum(coalesce(nullif(p->>'external_paid_amount','')::numeric, 0)), 0)
    into v_total_external
    from jsonb_array_elements(v_payments) p;
  else
    if coalesce(v_payment_method,'none') = 'none' then
      v_total_external := 0;
    else
      v_total_external := greatest(v_total_items - v_cashback_used, 0);
    end if;
  end if;

  return jsonb_build_object(
    'transaction',
    jsonb_build_object(
      'id', v_tx.id,
      'type', v_tx.type,
      'amount', v_tx.amount,
      'currency', v_tx.currency,
      'created_at', v_tx.created_at,
      'related_transaction_id', v_tx.related_transaction_id,
      'shop_id', v_tx.shop_id,
      'shop_name', v_tx.shop_name,
      'shop_address', v_tx.shop_address,
      'shop_category', v_tx.shop_category,
      'meta', v_tx.meta
    ),
    'items', v_items,
    'computed_totals', jsonb_build_object(
      'total_items', v_total_items,
      'cashback_used_amount', v_cashback_used,
      'total_external', v_total_external
    )
  );
end;
$$;

revoke all on function public.get_wallet_transaction_receipt_clean(uuid, uuid) from public;
grant execute on function public.get_wallet_transaction_receipt_clean(uuid, uuid) to anon, authenticated;

-- Seed (Ashkelon): idempotent for these shop names
delete from public.products p
using public.shops s
where p.shop_id = s.id
  and s.name in (
    'Mega Sport',
    'Central Café',
    'Fox Fashion',
    'Corner Bakery',
    'TechStore Pro'
  );

delete from public.shops
where name in (
  'Mega Sport',
  'Central Café',
  'Fox Fashion',
  'Corner Bakery',
  'TechStore Pro'
);

with inserted_shops as (
  insert into public.shops (name, address, category, phone, open_time, close_time, logo_url, cover_url, location)
  values
    (
      'Mega Sport',
      'HaNassi Blvd 1, Ashkelon',
      'Shopping',
      '+972-8-000-1001',
      '09:00',
      '21:00',
      null,
      null,
      st_setsrid(st_makepoint(34.5719, 31.6689), 4326)::geography
    ),
    (
      'Central Café',
      'Rogozin St 12, Ashkelon',
      'Cafes',
      '+972-8-000-1002',
      '07:30',
      '22:00',
      null,
      null,
      st_setsrid(st_makepoint(34.5712, 31.6681), 4326)::geography
    ),
    (
      'Fox Fashion',
      'Afridar Center, Ashkelon',
      'Shopping',
      '+972-8-000-1003',
      '09:30',
      '22:00',
      null,
      null,
      st_setsrid(st_makepoint(34.5696, 31.6674), 4326)::geography
    ),
    (
      'Corner Bakery',
      'Bar Kochva St 5, Ashkelon',
      'Restaurants',
      '+972-8-000-1004',
      '08:00',
      '20:00',
      null,
      null,
      st_setsrid(st_makepoint(34.5730, 31.6669), 4326)::geography
    ),
    (
      'TechStore Pro',
      'Marina Mall, Ashkelon',
      'Shopping',
      '+972-8-000-1005',
      '10:00',
      '21:30',
      null,
      null,
      st_setsrid(st_makepoint(34.5724, 31.6702), 4326)::geography
    )
  returning id, name
),
shop_ids as (
  select
    (select id from inserted_shops where name = 'Mega Sport' limit 1) as mega_sport_id,
    (select id from inserted_shops where name = 'Central Café' limit 1) as central_cafe_id,
    (select id from inserted_shops where name = 'Fox Fashion' limit 1) as fox_fashion_id,
    (select id from inserted_shops where name = 'Corner Bakery' limit 1) as corner_bakery_id,
    (select id from inserted_shops where name = 'TechStore Pro' limit 1) as techstore_pro_id
)
insert into public.products (shop_id, name, description, price, discount_price, currency, in_stock)
select mega_sport_id, 'Running Shoes', 'Lightweight running shoes', 299, 249, 'ILS', true from shop_ids
union all
select mega_sport_id, 'Yoga Mat', 'Non-slip mat', 89, null, 'ILS', true from shop_ids
union all
select central_cafe_id, 'Iced Latte', 'Fresh espresso with milk', 22, null, 'ILS', true from shop_ids
union all
select central_cafe_id, 'Cheesecake Slice', 'Classic baked cheesecake', 28, 24, 'ILS', true from shop_ids
union all
select fox_fashion_id, 'Hoodie', 'Cotton hoodie', 179, 149, 'ILS', true from shop_ids
union all
select fox_fashion_id, 'Jeans', 'Slim fit denim', 219, null, 'ILS', true from shop_ids
union all
select corner_bakery_id, 'Croissant', 'Butter croissant', 12, null, 'ILS', true from shop_ids
union all
select corner_bakery_id, 'Sourdough Bread', 'Daily baked loaf', 24, null, 'ILS', true from shop_ids
union all
select techstore_pro_id, 'iPhone Case', 'Shockproof case', 79, 59, 'ILS', true from shop_ids
union all
select techstore_pro_id, 'USB-C Charger', 'Fast charger 30W', 99, null, 'ILS', true from shop_ids;

-- Nike Store (Ashkelon) + sections + 4 produits
delete from public.products p
using public.shops s
where p.shop_id = s.id and s.name = 'Nike Store';

delete from public.shop_sections ss
using public.shops s
where ss.shop_id = s.id and s.name = 'Nike Store';

delete from public.shops where name = 'Nike Store';

with ins_shop as (
  insert into public.shops (name, address, category, phone, open_time, close_time, logo_url, cover_url, location)
  values (
    'Nike Store',
    'Afridar Mall, Ashkelon',
    'Shopping',
    '+972-8-000-2001',
    '09:00',
    '21:30',
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200&h=200&fit=crop',
    'https://images.unsplash.com/photo-1556906781-9a412961c28c?w=1200&h=600&fit=crop',
    st_setsrid(st_makepoint(34.5700, 31.6680), 4326)::geography
  )
  returning id
),
sec as (
  insert into public.shop_sections (shop_id, title, sort_order)
  select id, x.title, x.ord
  from ins_shop,
  (values
    ('Running', 0),
    ('Lifestyle', 1),
    ('Basketball', 2)
  ) as x(title, ord)
  returning id, title
),
run_id as (select id from sec where title = 'Running' limit 1),
life_id as (select id from sec where title = 'Lifestyle' limit 1),
ball_id as (select id from sec where title = 'Basketball' limit 1)
insert into public.products (shop_id, section_id, name, description, image_urls, price, discount_price, currency, in_stock)
select
  (select id from ins_shop),
  (select id from run_id),
  'Nike Air Zoom Pegasus',
  'Chaussure de running amortie, mesh respirant.',
  '["https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800"]'::jsonb,
  129.99,
  99.99,
  'EUR',
  true
union all
select
  (select id from ins_shop),
  (select id from run_id),
  'Nike Dri-FIT Miler',
  'T-shirt technique running, évacuation de la transpiration.',
  '["https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=800"]'::jsonb,
  39.99,
  null,
  'EUR',
  true
union all
select
  (select id from ins_shop),
  (select id from life_id),
  'Nike Air Force 1 ''07',
  'Basket iconique cuir, semelle Air.',
  '["https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800"]'::jsonb,
  119.99,
  99.99,
  'EUR',
  true
union all
select
  (select id from ins_shop),
  (select id from ball_id),
  'Jordan 1 Mid',
  'Montante basketball, empeigne cuir et synthétique.',
  '["https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800"]'::jsonb,
  139.99,
  null,
  'EUR',
  true;
