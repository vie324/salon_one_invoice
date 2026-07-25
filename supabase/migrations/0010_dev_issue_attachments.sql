-- =========================================================================
-- 開発依頼の添付画像(スクリーンショット・注釈入り画像・AIモック)
--   - dev_issue_attachments: メタデータ(実体は Supabase Storage)
--   - storage バケット 'dev-issue-attachments' (非公開・署名付きURLで表示)
-- =========================================================================

create table if not exists dev_issue_attachments (
  id               uuid primary key default gen_random_uuid(),
  issue_id         uuid not null references dev_issues(id) on delete cascade,
  file_name        text not null default '',
  content_type     text not null default 'image/png',
  storage_path     text not null,
  kind             text not null default 'screenshot' check (kind in ('screenshot','mock')),
  uploaded_by_id   uuid,
  uploaded_by_name text not null default '',
  created_at       timestamptz not null default now()
);

create index if not exists idx_dev_issue_attachments_issue on dev_issue_attachments(issue_id);

alter table dev_issue_attachments enable row level security;

drop policy if exists dev_issue_attachments_authenticated_all on dev_issue_attachments;
create policy dev_issue_attachments_authenticated_all on dev_issue_attachments
  for all to authenticated using (true) with check (true);

-- 非公開バケット(読み書きはサービスロール経由・表示は署名付きURL)。
-- SQL Editor で権限が足りない場合も、アプリ側が初回アップロード時に自動作成する。
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('dev-issue-attachments', 'dev-issue-attachments', false)
  on conflict (id) do nothing;
exception when others then
  raise notice 'storage bucket の作成をスキップしました(アプリ側で自動作成されます): %', sqlerrm;
end $$;
