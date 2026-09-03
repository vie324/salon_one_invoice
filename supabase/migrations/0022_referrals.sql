-- =========================================================================
-- 紹介制度
--   - referral_links: 紹介フォームのURL(任意)。紹介者を指定したリンクも作れる
--   - referrals:      紹介フォームからの申込(誰に紹介されたか・連絡希望日時・連絡方法)
--   - customers.referred_by_customer_id: 紹介された側 → 紹介者(顧客)への紐付け
--
-- 特典の設計:
--   - 紹介した側: 紹介された方の初期費用の25%をお支払い
--   - 紹介された側: 初月の端数日数(日割り)＋2ヶ月ぶん無料
--   金額の計算はアプリ層(lib/domain/referral.ts)で行い、確定額をここへ記録する。
--
-- 常設の紹介フォーム(/refer)はトークン無しで開けるため、リンクが無くても
-- 受け付けられる(referral_links への参照は任意)。
-- =========================================================================

-- 紹介フォームのURL -----------------------------------------------------------
create table if not exists referral_links (
  id                   uuid primary key default gen_random_uuid(),
  token                text not null unique,                  -- URL に使うトークン(crypto乱数)
  name                 text not null default '',              -- 宛先メモ(例: ○○サロン様用)
  -- 紹介者を指定したリンク。指定すると、フォームの「誰に紹介されたか」が埋まった状態で開く
  referrer_customer_id uuid references customers(id) on delete set null,
  referrer_name        text not null default '',              -- 顧客削除後も残す紹介者名
  active               boolean not null default true,
  expires_at           timestamptz,                           -- 受付期限(null = 無期限)
  submission_count     int not null default 0,
  created_by           text not null default '',
  created_at           timestamptz not null default now()
);

-- 紹介の申込 ------------------------------------------------------------------
create table if not exists referrals (
  id                   uuid primary key default gen_random_uuid(),
  link_id              uuid references referral_links(id) on delete set null,
  -- 紹介した側 ---------------------------------------------------------------
  referrer_name        text not null,                         -- フォームに書かれた「誰に紹介されたか」
  referrer_customer_id uuid references customers(id) on delete set null, -- 突き合わせた顧客
  -- 紹介された側(フォームの入力者) --------------------------------------------
  company_name         text not null default '',              -- 店舗名・法人名
  contact_name         text not null,                         -- お名前・ご担当者名
  phone                text not null default '',
  email                text not null default '',
  -- 連絡の希望 ---------------------------------------------------------------
  contact_method       text not null default 'phone'
                       check (contact_method in ('phone','email','sms','line')),
  preferred_date       date,                                  -- 連絡希望日
  preferred_time_slot  text not null default 'anytime'
                       check (preferred_time_slot in
                         ('anytime','morning','early_afternoon','late_afternoon','evening')),
  note                 text not null default '',              -- ご相談内容・メモ
  -- 対応状況 -----------------------------------------------------------------
  status               text not null default 'submitted'
                       check (status in ('submitted','contacted','customer_created','archived')),
  customer_id          uuid references customers(id) on delete set null, -- 登録した顧客
  -- 紹介報酬(紹介した側へのお支払い) ------------------------------------------
  reward_base_amount   int not null default 0,                -- 対象の初期費用(税抜)
  reward_amount        int not null default 0,                -- お支払い額 = 初期費用 × 25%
  reward_status        text not null default 'pending'
                       check (reward_status in ('pending','payable','paid')),
  reward_paid_at       timestamptz,
  submitted_at         timestamptz not null default now(),
  submitted_ip         text not null default '',
  updated_at           timestamptz not null default now()
);

-- 紹介された側 → 紹介者(顧客)の紐付け ------------------------------------------
alter table customers
  add column if not exists referred_by_customer_id uuid references customers(id) on delete set null;

-- インデックス ----------------------------------------------------------------
create index if not exists idx_referrals_status on referrals(status, submitted_at desc);
create index if not exists idx_referrals_referrer on referrals(referrer_customer_id);
create index if not exists idx_referrals_customer on referrals(customer_id);
create index if not exists idx_referrals_preferred on referrals(preferred_date);
create index if not exists idx_referral_links_token on referral_links(token);
create index if not exists idx_customers_referred_by on customers(referred_by_customer_id);

-- updated_at 自動更新 ----------------------------------------------------------
create or replace function public.touch_referral_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists referrals_touch_updated on referrals;
create trigger referrals_touch_updated
  before update on referrals
  for each row execute function public.touch_referral_updated_at();

-- RLS --------------------------------------------------------------------------
-- 申込(applications)と同じ扱い。公開フォームからの受付はサービスロール経由で行い、
-- 管理画面の読み書きも getServiceRepository を使う。
alter table referral_links enable row level security;
alter table referrals      enable row level security;

drop policy if exists referral_links_authenticated_all on referral_links;
create policy referral_links_authenticated_all on referral_links
  for all to authenticated using (true) with check (true);

drop policy if exists referrals_authenticated_all on referrals;
create policy referrals_authenticated_all on referrals
  for all to authenticated using (true) with check (true);
