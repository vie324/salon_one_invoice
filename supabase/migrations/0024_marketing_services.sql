-- =========================================================================
-- マーケティング代行(お客様ごとに1件)
--
-- 契約書の料金表【マーケティング代行費用】のとおり、システム利用料とは別建てで
--   初期構築費用 … 通常料金 100,000円(特別プラン料金 50,000円)
--   月額運用費   … 30,000円、または運用費(広告費等)の20%相当額のいずれか高い方
-- がかかる。月額は広告費で毎月変わるため、ここでは契約条件(最低額・料率)と
-- 申込日・開始日・状況を記録する(請求書は広告費が確定してから作成する)。
-- 申込一覧(/signups)と顧客の画面で表示する。
--
-- 何度実行しても同じ結果になる。
-- =========================================================================

create table if not exists marketing_services (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references customers(id) on delete cascade,
  -- planned(開始前) / active(運用中) / stopped(停止)
  status           text not null default 'planned',
  applied_on       date,                              -- 申し込んだ日
  started_on       date,                              -- 運用を始めた日
  ended_on         date,                              -- 停止した日
  initial_fee      numeric not null default 100000,   -- 初期構築費用(税抜)
  monthly_minimum  numeric not null default 30000,    -- 月額運用費の最低額(税抜)
  fee_rate         numeric not null default 0.2,      -- 広告費等に対する料率(0.2 = 20%)
  note             text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table marketing_services drop constraint if exists marketing_services_status_check;
alter table marketing_services add constraint marketing_services_status_check
  check (status in ('planned', 'active', 'stopped'));

alter table marketing_services drop constraint if exists marketing_services_fee_rate_check;
alter table marketing_services add constraint marketing_services_fee_rate_check
  check (fee_rate >= 0 and fee_rate <= 1);

-- お客様ごとに1件(停止・再開は同じ記録の状態を変える)
create unique index if not exists marketing_services_customer_unique
  on marketing_services(customer_id);

-- RLS: 他の請求データと同じ扱い(管理画面の読み書きは getServiceRepository を使う)
alter table marketing_services enable row level security;

drop policy if exists marketing_services_authenticated_all on marketing_services;
create policy marketing_services_authenticated_all on marketing_services
  for all to authenticated using (true) with check (true);
