-- =========================================================================
-- 実行有無の「管理者による直接変更」
--   通常は プロダクト管理者2名の承諾から自動判定するが、全体管理者が
--   直接 実行/実行なし/未定 を設定できるようにする(誰がいつ設定したかを記録)。
--   直接設定されている間は、承諾状況から再判定されない(戻す操作で解除)。
-- =========================================================================

alter table dev_issues
  add column if not exists execution_set_by_name text,
  add column if not exists execution_set_at timestamptz;

comment on column dev_issues.execution_set_by_name is
  '実行有無を直接設定した全体管理者の氏名。null = 承諾状況からの自動判定';
comment on column dev_issues.execution_set_at is
  '実行有無を直接設定した日時。null = 承諾状況からの自動判定';
