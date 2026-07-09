-- =========================================================================
-- 料金体系: 基本料金＋オプション / 月額・年間区分
-- =========================================================================
alter table plans add column if not exists initial_fee numeric not null default 0;
alter table plans add column if not exists term text not null default 'monthly'
  check (term in ('monthly', 'annual'));
-- オプション: [{ key, name, monthly }] の JSON 配列
alter table plans add column if not exists options jsonb not null default '[]'::jsonb;

-- 契約が選択したオプション(plan.options の key の配列)
alter table subscriptions add column if not exists option_keys jsonb not null default '[]'::jsonb;
