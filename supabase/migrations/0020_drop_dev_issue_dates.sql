-- 0020: 開発依頼から「完了希望日」と「対応完了予定日」を廃止
--
--   運用してみると、依頼側の希望日とエンジニアの予定日を突き合わせながら
--   進めるのが負担になっていたため、日付での連携そのものをやめる。
--   残すのは completed_date(実際に対応が完了した日)のみ。
--
--   ※ 既に入力済みの日付は失われる。必要なら適用前に控えを取ること。
--     例) create table dev_issues_dates_backup_0020 as
--           select id, desired_date, scheduled_date from dev_issues;

alter table dev_issues drop column if exists desired_date;
alter table dev_issues drop column if exists scheduled_date;
