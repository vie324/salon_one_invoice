-- 0021: 開発依頼の desired_date / scheduled_date を残す(念のための復旧)
--
--   一時期、この2カラムを削除する 0020_drop_dev_issue_dates.sql がリポジトリに
--   入っていた。方針を変えて「機能を復活させる可能性があるのでカラムは残す」
--   ことにしたため、そのファイルは削除済み。
--
--   ただし削除版をすでに適用してしまった環境があり得るので、
--   カラムが無ければ戻す(あれば何もしない)。
--
--   ※ 削除時に失われた日付の中身までは戻らない。
--
--   アプリはこの2カラムを読み書きしない。完了希望日・対応完了予定日の機能を
--   復活させたくなったときのために、器だけ残しておくもの。

alter table dev_issues add column if not exists desired_date date;
alter table dev_issues add column if not exists scheduled_date date;
