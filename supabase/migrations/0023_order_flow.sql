-- =========================================================================
-- 0023: 受注フローの整理 / NSS 口座振替 / 代理店報酬
--
-- 1) 申込・契約URL(application_links)
--    申込と契約を1本のURLで完結させるための設定を追加する。
--    with_contract = true のURLは、お客様が申込内容を入力 → 契約内容を確認 → 電子署名
--    まで進み、送信と同時に顧客・契約(締結済)・受注管理の案件が作られる。
--    既存のURLは with_contract = false(申込のみ・従来どおり)のまま動く。
-- 2) 申込(applications) … 同時に締結した契約書・代理店・紹介の紐付け
-- 3) 紹介・問い合わせ(referrals) … 代理店URLの「まずは相談したい」から届いたもの
-- 4) 代理店区分 … 取次型(初期費用の50%) / 営業・初期設定型(初期費用の100%)
-- 5) 代理店報酬(agency_commissions) … 受注確定時に1件ずつ記録。初期費用の入金後に支払対象
-- 6) 口座振替(NSS)の手続き … 依頼書の郵送 → 回収 → NSSへ登録 → 登録完了 の日付
--    口座番号などの口座情報は NSS で管理するため、このツールでは新たに保持しない
-- 7) 定期契約の店舗数 … 月額は1店舗あたりのため、店舗数を掛けて請求する
-- 8) 受注管理のステージ … 申込・契約 / 受注確認 / 導入準備 / 運用中 / 休止・解約・見送り
--    旧ステージ(contract / initial_billing / debit_setup / initial_payment)を読み替え、
--    旧チェックリストの進み具合を引き継ぐ
--
-- 冪等: 何度実行しても同じ結果になるように書いている。
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1) 申込・契約URL
-- ---------------------------------------------------------------------------
alter table application_links add column if not exists with_contract boolean not null default false;
alter table application_links add column if not exists plan_id uuid references plans(id) on delete set null;
alter table application_links add column if not exists option_keys jsonb not null default '[]'::jsonb;
-- null = お客様がフォームで店舗数を入力する
alter table application_links add column if not exists store_count int;
-- 個別価格(税抜)。null = プラン通り
alter table application_links add column if not exists initial_fee_override numeric;
alter table application_links add column if not exists monthly_price_override numeric;
alter table application_links add column if not exists agency_id uuid references agencies(id) on delete set null;
alter table application_links add column if not exists agency_member_id uuid references agency_members(id) on delete set null;
alter table application_links add column if not exists agency_deal_type text;
alter table application_links add column if not exists referral_id uuid references referrals(id) on delete set null;
-- 「まずは相談したい」(問い合わせ)の入口を出すか(代理店URL向け)
alter table application_links add column if not exists allow_inquiry boolean not null default false;

create index if not exists idx_application_links_agency on application_links(agency_id);
create index if not exists idx_application_links_referral on application_links(referral_id);

-- ---------------------------------------------------------------------------
-- 2) 申込
-- ---------------------------------------------------------------------------
alter table applications add column if not exists contract_id uuid references contracts(id) on delete set null;
alter table applications add column if not exists agency_id uuid references agencies(id) on delete set null;
alter table applications add column if not exists agency_member_id uuid references agency_members(id) on delete set null;
alter table applications add column if not exists referral_id uuid references referrals(id) on delete set null;

create index if not exists idx_applications_customer on applications(customer_id);
create index if not exists idx_applications_agency on applications(agency_id);

-- ---------------------------------------------------------------------------
-- 3) 紹介・問い合わせ(代理店経由)
-- ---------------------------------------------------------------------------
alter table referrals add column if not exists agency_id uuid references agencies(id) on delete set null;
alter table referrals add column if not exists agency_member_id uuid references agency_members(id) on delete set null;
alter table referrals add column if not exists application_link_id uuid references application_links(id) on delete set null;

create index if not exists idx_referrals_agency on referrals(agency_id);

-- ---------------------------------------------------------------------------
-- 4) 代理店区分
--    伴走型を追加するときは、下の check 制約を張り直す
--    (アプリ側は lib/domain/constants.ts の AGENCY_DEAL_TYPES に1件足す)。
-- ---------------------------------------------------------------------------
alter table agencies add column if not exists default_deal_type text not null default 'referral';
alter table customers add column if not exists agency_deal_type text;

alter table agencies drop constraint if exists agencies_default_deal_type_check;
alter table agencies add constraint agencies_default_deal_type_check
  check (default_deal_type in ('referral', 'sales_setup'));

alter table customers drop constraint if exists customers_agency_deal_type_check;
alter table customers add constraint customers_agency_deal_type_check
  check (agency_deal_type is null or agency_deal_type in ('referral', 'sales_setup'));

alter table application_links drop constraint if exists application_links_agency_deal_type_check;
alter table application_links add constraint application_links_agency_deal_type_check
  check (agency_deal_type is null or agency_deal_type in ('referral', 'sales_setup'));

-- ---------------------------------------------------------------------------
-- 5) 代理店報酬
--    金額(初期費用 × 率)は受注確定の時点で確定して記録する。
--    支払対象かどうか(初期費用の入金済みか)は、初回請求書の状態から都度判定する。
-- ---------------------------------------------------------------------------
create table if not exists agency_commissions (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null references agencies(id) on delete restrict,
  agency_member_id uuid references agency_members(id) on delete set null,
  customer_id      uuid not null references customers(id) on delete cascade,
  -- 報酬の対象になった初回請求書(初期費用)
  invoice_id       uuid references invoices(id) on delete set null,
  deal_type        text not null,
  base_amount      numeric not null default 0,  -- 対象の初期費用(税抜)
  rate             numeric not null default 0,  -- 0.5 = 50%
  amount           numeric not null default 0,  -- 報酬額
  paid_at          date,                         -- 代理店へ支払った日(null = 未払い)
  note             text not null default '',
  created_at       timestamptz not null default now()
);

alter table agency_commissions drop constraint if exists agency_commissions_deal_type_check;
alter table agency_commissions add constraint agency_commissions_deal_type_check
  check (deal_type in ('referral', 'sales_setup'));

-- 同じ初回請求に対する報酬は1件だけ(受注確定のやり直しで二重に作らない)
create unique index if not exists agency_commissions_invoice_unique
  on agency_commissions(invoice_id) where invoice_id is not null;
create index if not exists idx_agency_commissions_agency on agency_commissions(agency_id, created_at desc);
create index if not exists idx_agency_commissions_customer on agency_commissions(customer_id);

alter table agency_commissions enable row level security;

drop policy if exists agency_commissions_authenticated_all on agency_commissions;
create policy agency_commissions_authenticated_all on agency_commissions
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 6) 口座振替(NSS)の手続き
-- ---------------------------------------------------------------------------
alter table direct_debit_mandates add column if not exists form_sent_on date;
alter table direct_debit_mandates add column if not exists form_received_on date;
alter table direct_debit_mandates add column if not exists nss_submitted_on date;
-- 引き落としが始まる月(YYYY-MM)
alter table direct_debit_mandates add column if not exists debit_start_month text;
alter table direct_debit_mandates add column if not exists nss_customer_number text not null default '';
alter table direct_debit_mandates add column if not exists note text not null default '';

-- ---------------------------------------------------------------------------
-- 7) 定期契約の店舗数
-- ---------------------------------------------------------------------------
alter table subscriptions add column if not exists store_count int not null default 1;

alter table subscriptions drop constraint if exists subscriptions_store_count_check;
alter table subscriptions add constraint subscriptions_store_count_check check (store_count >= 1);

-- ---------------------------------------------------------------------------
-- 8) 受注管理のステージ
-- ---------------------------------------------------------------------------
alter table customer_onboardings drop constraint if exists customer_onboardings_stage_check;

-- 8-1) 旧チェックリストの「口座振替依頼書」の進み具合を、NSS の手続き日付へ移す
--      (旧: dd_send 依頼書を送付 / dd_receive 依頼書を受領 / dd_register 収納代行へ登録)
insert into direct_debit_mandates (customer_id, status)
select o.customer_id, 'pending'
from customer_onboardings o
where exists (
    select 1 from jsonb_array_elements(coalesce(o.checklist, '[]'::jsonb)) e
    where e->>'key' in ('dd_send', 'dd_receive', 'dd_register')
      and coalesce((e->>'done')::boolean, false)
  )
  and not exists (select 1 from direct_debit_mandates m where m.customer_id = o.customer_id);

update direct_debit_mandates m set
  form_sent_on = coalesce(m.form_sent_on, legacy.sent_on),
  form_received_on = coalesce(m.form_received_on, legacy.received_on),
  nss_submitted_on = coalesce(m.nss_submitted_on, legacy.registered_on)
from (
  select
    o.customer_id,
    max(case when e->>'key' = 'dd_send' then coalesce((e->>'doneAt')::timestamptz::date, o.updated_at::date) end) as sent_on,
    max(case when e->>'key' = 'dd_receive' then coalesce((e->>'doneAt')::timestamptz::date, o.updated_at::date) end) as received_on,
    max(case when e->>'key' = 'dd_register' then coalesce((e->>'doneAt')::timestamptz::date, o.updated_at::date) end) as registered_on
  from customer_onboardings o
  cross join lateral jsonb_array_elements(coalesce(o.checklist, '[]'::jsonb)) e
  where e->>'key' in ('dd_send', 'dd_receive', 'dd_register')
    and coalesce((e->>'done')::boolean, false)
  group by o.customer_id
) legacy
where legacy.customer_id = m.customer_id;

-- 8-2) 旧「運用中」の案件は、初回請求書の送付・初期設定・納品が済んでいるものとして引き継ぐ
--      (新しいチェック項目が未完了のせいで「導入準備」に戻ってしまわないように)
update customer_onboardings o
set checklist = coalesce(o.checklist, '[]'::jsonb) || coalesce((
    select jsonb_agg(jsonb_build_object(
      'key', k, 'label', '', 'done', true,
      'doneAt', to_jsonb(o.updated_at), 'doneBy', '移行（運用中の案件）'))
    from unnest(array['initial_invoice_sent', 'setup_info', 'setup_done', 'setup_delivered']) as k
    where not exists (
      select 1 from jsonb_array_elements(coalesce(o.checklist, '[]'::jsonb)) e
      where e->>'key' = k and coalesce((e->>'done')::boolean, false)
    )
  ), '[]'::jsonb)
where o.stage = 'operating';

-- 8-3) 旧ステージを読み替える
update customer_onboardings set stage = case stage
    when 'contract' then 'application'
    when 'initial_billing' then 'setup'
    when 'debit_setup' then 'setup'
    when 'initial_payment' then 'setup'
    else stage
  end
where stage in ('contract', 'initial_billing', 'debit_setup', 'initial_payment');

alter table customer_onboardings add constraint customer_onboardings_stage_check
  check (stage in ('application', 'review', 'setup', 'operating', 'closed'));
