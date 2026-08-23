-- 0016: 顧客ステータス管理(カンバン) と 督促メールの記録
--
--   1) customer_onboardings: 顧客ごとのオンボーディングカード(顧客1件につき1枚)。
--      申込 → 契約 → 初回請求(初期費用＋初月日割り・振込) → 振替手続き(依頼書の
--      送付→受領→登録) → 入金チェック → 運用中(毎月の引き落とし) の
--      ステージをカンバンで管理する。チェックリスト・履歴は JSONB で保持。
--   2) invoices.reminder_count / last_reminder_at: 督促メールの送付回数と最終送付日時。

-- ---------------------------------------------------------------------------
-- 1) 顧客ステータス管理(カンバン)
-- ---------------------------------------------------------------------------

create table if not exists customer_onboardings (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null unique references customers(id) on delete cascade,
  stage            text not null default 'application'
                   check (stage in (
                     'application','contract','initial_billing',
                     'debit_setup','initial_payment','operating','closed'
                   )),
  -- 列内の並び順(小さいほど上)。ドラッグで入れ替える。
  sort_order       int not null default 0,
  -- フォロー期日(超過で要対応として強調)
  due_date         date,
  -- 次にやること(担当者メモ)
  next_action      text not null default '',
  -- チェックリスト [{key,label,done,doneAt,doneBy}]
  checklist        jsonb not null default '[]',
  -- ステージ移動の履歴 [{stage,at,by}]
  history          jsonb not null default '[]',
  -- 現在のステージに入った日時(滞留日数の表示用)
  stage_changed_at timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists customer_onboardings_stage_idx
  on customer_onboardings (stage, sort_order);

alter table customer_onboardings enable row level security;

drop policy if exists customer_onboardings_authenticated_all on customer_onboardings;
create policy customer_onboardings_authenticated_all on customer_onboardings
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 2) 督促メールの記録
-- ---------------------------------------------------------------------------

alter table invoices add column if not exists reminder_count   int not null default 0;
alter table invoices add column if not exists last_reminder_at timestamptz;
