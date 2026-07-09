-- =========================================================================
-- salon_one_invoice スキーマ
-- 請求書 作成・送付・管理 / 口座振替(引き落とし) / 入金確認
-- =========================================================================
create extension if not exists pgcrypto;

-- 自社(発行元)情報 --------------------------------------------------------
create table if not exists organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  postal_code         text,
  address             text,
  tel                 text,
  email               text,
  registration_number text,
  bank_name           text,
  bank_branch         text,
  bank_account_type   text not null default '普通',
  bank_account_number text,
  bank_account_holder text,
  invoice_prefix      text not null default 'INV',
  default_tax_rate    numeric not null default 0.10,
  logo_text           text not null default 'S1',
  created_at          timestamptz not null default now()
);

-- ユーザープロフィール(認証ユーザーに 1:1) --------------------------------
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       text not null default 'staff' check (role in ('owner','staff','admin')),
  created_at timestamptz not null default now()
);

-- 顧客 / 会員 --------------------------------------------------------------
create table if not exists customers (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  kana           text default '',
  contact_name   text default '',
  email          text default '',
  phone          text default '',
  postal_code    text default '',
  address        text default '',
  payment_method text not null default 'direct_debit'
                 check (payment_method in ('direct_debit','bank_transfer','credit_card','cash')),
  status         text not null default 'active' check (status in ('active','inactive')),
  assignee       text default '',
  notes          text default '',
  created_at     timestamptz not null default now()
);

-- 口座振替マンデート(引き落とし口座) -------------------------------------
create table if not exists direct_debit_mandates (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null unique references customers(id) on delete cascade,
  bank_name           text default '',
  branch_name         text default '',
  branch_code         text default '',
  account_type        text not null default '普通',
  account_number      text default '',
  account_holder_kana text default '',
  status              text not null default 'pending'
                      check (status in ('pending','active','failed','revoked')),
  registered_at       date
);

-- 定期プラン --------------------------------------------------------------
create table if not exists plans (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text default '',
  amount        numeric not null,
  tax_rate      numeric not null default 0.10,
  billing_cycle text not null default 'monthly',
  billing_day   int not null default 27 check (billing_day between 1 and 28),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- 定期契約 ----------------------------------------------------------------
create table if not exists subscriptions (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references customers(id) on delete cascade,
  plan_id           uuid not null references plans(id),
  status            text not null default 'active' check (status in ('active','paused','canceled')),
  started_on        date not null,
  next_billing_date date not null,
  billing_day       int not null default 27,
  canceled_on       date,
  created_at        timestamptz not null default now()
);

-- 請求書 ------------------------------------------------------------------
create table if not exists invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text not null unique,
  customer_id     uuid not null references customers(id) on delete restrict,
  subscription_id uuid references subscriptions(id) on delete set null,
  type            text not null default 'one_time' check (type in ('one_time','recurring','initial')),
  status          text not null default 'draft'
                  check (status in ('draft','sent','awaiting_payment','partially_paid','paid','overdue','failed','canceled')),
  issue_date      date not null,
  due_date        date not null,
  billing_period  text,
  payment_method  text not null,
  subtotal        numeric not null default 0,
  tax_total       numeric not null default 0,
  total           numeric not null default 0,
  amount_paid     numeric not null default 0,
  notes           text default '',
  sent_at         timestamptz,
  paid_at         date,
  created_at      timestamptz not null default now()
);

create table if not exists invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  description text not null,
  quantity    numeric not null default 1,
  unit_price  numeric not null default 0,
  tax_rate    numeric not null default 0.10,
  amount      numeric not null default 0,
  position    int not null default 0
);

-- 入金 --------------------------------------------------------------------
create table if not exists payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid references invoices(id) on delete set null,
  customer_id uuid not null references customers(id) on delete cascade,
  amount      numeric not null,
  method      text not null,
  status      text not null default 'confirmed' check (status in ('confirmed','pending','failed')),
  paid_at     date not null,
  reference   text default '',
  matched_by  text not null default 'manual' check (matched_by in ('manual','csv','auto')),
  memo        text default '',
  created_at  timestamptz not null default now()
);

-- 口座振替バッチ ----------------------------------------------------------
create table if not exists direct_debit_batches (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  scheduled_date date not null,
  status         text not null default 'draft' check (status in ('draft','submitted','processing','completed')),
  created_at     timestamptz not null default now()
);

create table if not exists direct_debit_batch_items (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references direct_debit_batches(id) on delete cascade,
  invoice_id    uuid not null references invoices(id) on delete cascade,
  customer_id   uuid not null references customers(id) on delete cascade,
  mandate_id    uuid references direct_debit_mandates(id) on delete set null,
  amount        numeric not null,
  result        text not null default 'pending' check (result in ('pending','success','failed')),
  result_reason text default ''
);

-- 銀行明細(入金消込) -----------------------------------------------------
create table if not exists bank_transactions (
  id                 uuid primary key default gen_random_uuid(),
  transaction_date   date not null,
  amount             numeric not null,
  payer_name         text default '',
  description        text default '',
  matched_invoice_id uuid references invoices(id) on delete set null,
  matched_payment_id uuid references payments(id) on delete set null,
  imported_at        timestamptz not null default now()
);

-- 活動ログ ----------------------------------------------------------------
create table if not exists activities (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null,
  message         text not null,
  actor           text default '',
  amount          numeric,
  link_invoice_id uuid references invoices(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- インデックス ------------------------------------------------------------
create index if not exists idx_invoices_customer on invoices(customer_id);
create index if not exists idx_invoices_status on invoices(status);
create index if not exists idx_invoices_sub_period on invoices(subscription_id, billing_period);
create index if not exists idx_invoice_items_invoice on invoice_items(invoice_id);
create index if not exists idx_payments_customer on payments(customer_id);
create index if not exists idx_payments_invoice on payments(invoice_id);
create index if not exists idx_subscriptions_customer on subscriptions(customer_id);
create index if not exists idx_dd_items_batch on direct_debit_batch_items(batch_id);
create index if not exists idx_activities_created on activities(created_at desc);
