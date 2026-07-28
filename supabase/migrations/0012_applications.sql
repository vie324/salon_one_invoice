-- =========================================================================
-- 申込用URL(お客様が自分で入力する申込フォーム)
--   - application_links: 発行した申込URL(トークン単位。停止・期限設定が可能)
--   - applications:      お客様が送信した申込内容。ツール上で確認し顧客登録する
--
-- 認証情報の取り扱い:
--   HPB / minimo / EPARK の ID・パスワードは平文で保存しない。
--   アプリ側 (src/lib/crypto/secrets.ts) で AES-256-GCM により暗号化した
--   文字列 ("v1:iv:tag:data") をそのまま text カラムへ格納する。
--   復号鍵は環境変数 (APP_ENCRYPTION_KEY) にのみ存在し DB には保存しない。
-- =========================================================================

-- 申込URL ------------------------------------------------------------------
create table if not exists application_links (
  id         uuid primary key default gen_random_uuid(),
  token      text not null unique,                    -- URL に含む推測困難な文字列
  name       text not null default '',                -- 用途がわかる名前(例: 2026年7月 新規案内)
  active     boolean not null default true,           -- 停止するとフォームを開けない
  expires_at timestamptz,                             -- null = 無期限
  created_by text not null default '',                -- 発行者名
  created_at timestamptz not null default now()
);

-- 申込内容 ------------------------------------------------------------------
create table if not exists applications (
  id                   uuid primary key default gen_random_uuid(),
  link_id              uuid references application_links(id) on delete set null,
  link_name            text not null default '',      -- 発行元URL名のスナップショット
  company_name         text not null,                 -- 法人名(個人の場合は個人名)
  address              text not null default '',      -- 住所(法人は登記住所)
  representative_title text not null default '',      -- 代表者役職
  representative_name  text not null default '',      -- 代表者名
  -- 外部サービス連携情報(任意・暗号化して保存) --------------------------
  hotpepper_login_id   text,
  hotpepper_password   text,
  minimo_login_id      text,
  minimo_password      text,
  epark_login_id       text,
  epark_password       text,
  -- LINE連携申込(チェックの有無) ----------------------------------------
  line_requested       boolean not null default false,
  status               text not null default 'submitted'
                       check (status in ('submitted','customer_created','archived')),
  customer_id          uuid references customers(id) on delete set null,
  submitted_at         timestamptz not null default now(),
  submitted_ip         text not null default ''
);

-- インデックス --------------------------------------------------------------
create index if not exists idx_applications_submitted on applications(submitted_at desc);
create index if not exists idx_applications_status on applications(status);
create index if not exists idx_applications_link on applications(link_id);

-- RLS ------------------------------------------------------------------------
alter table application_links enable row level security;
alter table applications      enable row level security;

-- 認証済みユーザーは参照・操作可能(細かい権限はアプリ層で制御)。
-- 公開フォームからの参照・登録はサービスロール経由 (getJobRepository) で行うため、
-- 匿名ユーザー向けのポリシーは作らない = トークンを知っていても直接 DB は読めない。
drop policy if exists application_links_authenticated_all on application_links;
create policy application_links_authenticated_all on application_links
  for all to authenticated using (true) with check (true);

drop policy if exists applications_authenticated_all on applications;
create policy applications_authenticated_all on applications
  for all to authenticated using (true) with check (true);
