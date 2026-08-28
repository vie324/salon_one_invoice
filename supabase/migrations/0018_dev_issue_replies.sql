-- =========================================================================
-- 追加ヒアリングのやり取り(返信)
--   - dev_issue_replies: 依頼者⇔エンジニアの返信スレッド(追記のみ)
--   - notifications:     'issue_hearing_reply'(返信の共有)を追加
--
-- エンジニアがステータスを「追加ヒアリング」にして確認事項を書いたあと、
-- 依頼者がここへ返信を追記する。返信は相手側(エンジニア/依頼者)へ通知され、
-- 誰へ通知したかを notified_names に残して画面でバッジ表示する。
-- =========================================================================

create table if not exists dev_issue_replies (
  id             uuid primary key default gen_random_uuid(),
  issue_id       uuid not null references dev_issues(id) on delete cascade,
  author_id      uuid,                                       -- 投稿者(デモIDは NULL)
  author_name    text not null default '',                   -- 投稿者名(退職後も表示)
  author_role    text not null default 'requester'
                 check (author_role in ('requester','engineer')), -- どちら側の返信か
  body           text not null,                              -- 返信本文
  notified_names text[] not null default '{}',               -- 通知した相手の氏名
  created_at     timestamptz not null default now()
);

create index if not exists idx_dev_issue_replies_issue
  on dev_issue_replies(issue_id, created_at);

-- 通知種別に「ヒアリング返信」を追加 ----------------------------------------
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('issue_created','issue_done','issue_hearing','issue_execution','issue_hearing_reply'));

-- RLS ------------------------------------------------------------------------
-- 開発依頼本体と同じ扱い(細かい権限はアプリ層で制御。書き込みはサービスロール経由)
alter table dev_issue_replies enable row level security;

drop policy if exists dev_issue_replies_authenticated_all on dev_issue_replies;
create policy dev_issue_replies_authenticated_all on dev_issue_replies
  for all to authenticated using (true) with check (true);
