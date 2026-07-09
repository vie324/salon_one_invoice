-- =========================================================================
-- Row Level Security
-- 社内向けツールのため、認証済みユーザー(スタッフ/経営者/管理者)は
-- 業務データにフルアクセスできる。未認証は一切アクセス不可。
-- サービスロール(cron/webhook)は RLS をバイパスする。
-- =========================================================================

alter table organizations           enable row level security;
alter table profiles                enable row level security;
alter table customers               enable row level security;
alter table direct_debit_mandates   enable row level security;
alter table plans                   enable row level security;
alter table subscriptions           enable row level security;
alter table invoices                enable row level security;
alter table invoice_items           enable row level security;
alter table payments                enable row level security;
alter table direct_debit_batches    enable row level security;
alter table direct_debit_batch_items enable row level security;
alter table bank_transactions       enable row level security;
alter table activities              enable row level security;

-- 認証ユーザーは全業務テーブルを読み書き可能 ------------------------------
do $$
declare
  t text;
  business_tables text[] := array[
    'organizations','customers','direct_debit_mandates','plans','subscriptions',
    'invoices','invoice_items','payments','direct_debit_batches',
    'direct_debit_batch_items','bank_transactions','activities'
  ];
begin
  foreach t in array business_tables loop
    execute format('drop policy if exists %I on %I;', t || '_authenticated_all', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true);',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

-- プロフィール: 全員の氏名は参照可、更新は本人のみ ------------------------
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profiles_insert_self on profiles;
create policy profiles_insert_self on profiles
  for insert to authenticated with check (auth.uid() = id);
