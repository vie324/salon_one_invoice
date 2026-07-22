-- =========================================================================
-- 営業代理店管理 + 個別料金(特別待遇価格)
--   - agencies:        営業代理店(手数料率に基づき毎月の支払額を算出)
--   - agency_members:  代理店所属の営業マン(個人単位の売上集計)
--   - customers:       獲得代理店/営業マンの紐付けカラムを追加
--   - subscriptions:   基本料金の個別価格(price_override)を追加
-- =========================================================================

-- 営業代理店 --------------------------------------------------------------
create table if not exists agencies (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null,
  contact_name    text not null default '',
  email           text not null default '',
  phone           text not null default '',
  address         text not null default '',
  commission_rate numeric not null default 0.20, -- 0.20 = 20%
  notes           text not null default '',
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- 営業マン ----------------------------------------------------------------
create table if not exists agency_members (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null references agencies(id) on delete cascade,
  name       text not null,
  email      text not null default '',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- 顧客への紐付け ----------------------------------------------------------
alter table customers add column if not exists agency_id uuid references agencies(id) on delete set null;
alter table customers add column if not exists agency_member_id uuid references agency_members(id) on delete set null;

-- 個別価格(特別待遇・紹介割引など。null = プラン定価) ----------------------
alter table subscriptions add column if not exists price_override numeric;

-- インデックス ------------------------------------------------------------
create index if not exists idx_agency_members_agency on agency_members(agency_id);
create index if not exists idx_customers_agency on customers(agency_id);

-- RLS ----------------------------------------------------------------------
alter table agencies       enable row level security;
alter table agency_members enable row level security;

drop policy if exists agencies_authenticated_all on agencies;
create policy agencies_authenticated_all on agencies
  for all to authenticated using (true) with check (true);

drop policy if exists agency_members_authenticated_all on agency_members;
create policy agency_members_authenticated_all on agency_members
  for all to authenticated using (true) with check (true);
