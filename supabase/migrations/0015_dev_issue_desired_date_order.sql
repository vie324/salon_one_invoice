-- 0015: 開発依頼の「完了してほしい日(依頼者の希望)」と、手動の並び順
--
--   1) desired_date: 依頼側が入力する希望完了日。エンジニアが入れる
--      scheduled_date(対応完了予定日)とは別物で、両方を見比べられるようにする。
--   2) sort_order:   ドラッグで入れ替えた並び順(小さいほど上)。
--      既存データは記載が新しいものほど上に来るよう、issue_number の降順で初期化する。

alter table dev_issues add column if not exists desired_date date;
alter table dev_issues add column if not exists sort_order int not null default 0;

-- 既存の並びを維持する初期値(新しい依頼ほど小さい値 = 上)
update dev_issues set sort_order = -issue_number where sort_order = 0;

create index if not exists dev_issues_sort_order_idx on dev_issues (sort_order);
