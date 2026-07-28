-- =========================================================================
-- 申込フォームに連絡先(ご担当者名・電話番号・メールアドレス)を追加
--   顧客として登録する際にそのまま引き継ぐため、customers と同じ粒度で保持する。
-- =========================================================================

alter table applications add column if not exists contact_name text not null default '';
alter table applications add column if not exists phone        text not null default '';
alter table applications add column if not exists email        text not null default '';

-- 申込メールから顧客を探せるように(重複申込の確認にも使う)
create index if not exists idx_applications_email on applications(email);
