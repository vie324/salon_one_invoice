-- =========================================================================
-- 開発スケジュール(中長期ロードマップのシステム化)
--   - dev_schedule_items: スプレッドシートの1行 = 「機能」1件
--                         カテゴリ / 機能 / 優先度(★1〜5) / 対応する月・週
--   - dev_schedule_links: 機能 ↔ 開発進捗(dev_issues) の連動
--                         1つの機能に複数の依頼(#143/#156/...)をぶら下げる
--   - profiles.schedule_visible: スケジュール表を閲覧できるメンバーのチェック
--
-- 週次の開発MTGで「今週進めるもの」を共有するための表。
-- 依頼(dev_issues)は機能単位に束ねて表示するため、
-- 依頼の件数ではなく「機能いくつ」で会話できる。
-- =========================================================================

-- スケジュール項目(機能) ---------------------------------------------------
create table if not exists dev_schedule_items (
  id           uuid primary key default gen_random_uuid(),
  category     text not null default '',                     -- 基盤 / 分析 / 人事 など
  title        text not null,                                -- 機能名
  priority     int  not null default 3
               check (priority between 1 and 5),             -- 優先度(★の数)
  status       text not null default 'planned'
               check (status in ('planned','in_progress','done','dropped')),
  target_month date,                                         -- 表の列(その月の1日で保持)
  target_date  date,                                         -- 着手・完了の目安日(★9/7 の 9/7)
  confirmed    boolean not null default false,               -- ★=日程確定 / ☆=未確定
  note         text not null default '',                     -- 補足(「酒井モック」など)
  sort_order   int  not null default 0,                      -- 表示順(小さいほど上)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 開発進捗との連動 -----------------------------------------------------------
-- 1機能に複数の依頼を紐付ける(同じ依頼を二重に紐付けない)
create table if not exists dev_schedule_links (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references dev_schedule_items(id) on delete cascade,
  issue_id   uuid not null references dev_issues(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (item_id, issue_id)
);

-- 閲覧できるメンバー ---------------------------------------------------------
-- 既定は非表示。管理者がチェックしたメンバーだけがスケジュール表を見られる
-- (管理者自身はアプリ層で常に閲覧可能として扱う)。
alter table profiles add column if not exists schedule_visible boolean not null default false;

-- ひとまず「酒井」「若林」の2名に表示する
update profiles
   set schedule_visible = true
 where coalesce(full_name, '') like '%酒井%'
    or coalesce(full_name, '') like '%若林%';

-- インデックス --------------------------------------------------------------
create index if not exists idx_dev_schedule_items_month
  on dev_schedule_items(target_month, sort_order);
create index if not exists idx_dev_schedule_items_date
  on dev_schedule_items(target_date);
create index if not exists idx_dev_schedule_links_item
  on dev_schedule_links(item_id);
create index if not exists idx_dev_schedule_links_issue
  on dev_schedule_links(issue_id);

-- updated_at 自動更新 --------------------------------------------------------
-- 開発依頼と同じトリガー関数(touch_dev_issue_updated_at)を使い回す
drop trigger if exists dev_schedule_items_touch_updated on dev_schedule_items;
create trigger dev_schedule_items_touch_updated
  before update on dev_schedule_items
  for each row execute function public.touch_dev_issue_updated_at();

-- RLS ------------------------------------------------------------------------
-- 開発依頼本体と同じ扱い(閲覧できるメンバーの判定はアプリ層で行い、
-- 書き込みはサービスロール経由 = getServiceRepository を使用)
alter table dev_schedule_items enable row level security;
alter table dev_schedule_links enable row level security;

drop policy if exists dev_schedule_items_authenticated_all on dev_schedule_items;
create policy dev_schedule_items_authenticated_all on dev_schedule_items
  for all to authenticated using (true) with check (true);

drop policy if exists dev_schedule_links_authenticated_all on dev_schedule_links;
create policy dev_schedule_links_authenticated_all on dev_schedule_links
  for all to authenticated using (true) with check (true);
