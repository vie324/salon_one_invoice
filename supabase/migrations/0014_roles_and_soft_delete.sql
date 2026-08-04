-- 0014: 役割の複数割当(兼務) と 請求データの削除・復元(ゴミ箱)
--
--   1) profiles.roles: 1アカウントに複数の役割を割り当てられるようにする
--      (エンジニア / 管理者 / 請求管理者 / 開発・修正管理者。請求管理者と
--       開発・修正管理者は同じ人が兼務することがある)
--   2) 請求まわりのデータに deleted_at を追加し、消さずに非表示にできるようにする
--      (テスト投入データの片付け用。いつでも復元できる)
--   3) data_deletions: 削除・復元の操作ログ(追記のみ)

-- ---------------------------------------------------------------------------
-- 1) 役割(複数割当)
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists roles text[] not null default '{}';

-- 旧種別を新しい役割へ読み替えて初期値を入れる
update profiles
   set roles = case role
                 when 'owner' then array['admin']
                 when 'staff' then array['billing']
                 when 'dev'   then array['engineer']
                 else array[role]
               end
 where roles = '{}';

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('owner','staff','admin','billing','dev','engineer','dev_manager'));

-- roles の中身も同じ集合に限定する
alter table profiles drop constraint if exists profiles_roles_check;
alter table profiles add constraint profiles_roles_check
  check (
    array_length(roles, 1) is null
    or roles <@ array['owner','staff','admin','billing','dev','engineer','dev_manager']::text[]
  );

-- ---------------------------------------------------------------------------
-- 2) 削除(ゴミ箱) — 実データは消さず deleted_at を立てる
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'invoices','customers','payments','subscriptions','bank_transactions','direct_debit_batches'
  ] loop
    execute format('alter table %I add column if not exists deleted_at timestamptz', t);
    execute format('alter table %I add column if not exists deleted_by text', t);
    execute format('alter table %I add column if not exists delete_reason text', t);
    -- 有効なデータの絞り込みが多いため部分インデックスを張る
    execute format(
      'create index if not exists %I on %I (deleted_at) where deleted_at is null',
      t || '_alive_idx', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3) 削除・復元の操作ログ(追記のみ)
-- ---------------------------------------------------------------------------

create table if not exists data_deletions (
  id           uuid primary key default gen_random_uuid(),
  entity       text not null
               check (entity in ('invoice','customer','payment','subscription','bank_transaction','batch')),
  entity_id    uuid not null,
  entity_label text not null default '',
  action       text not null check (action in ('delete','restore')),
  actor        text not null default '',
  reason       text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists data_deletions_created_idx on data_deletions (created_at desc);
create index if not exists data_deletions_entity_idx on data_deletions (entity, entity_id);

alter table data_deletions enable row level security;

drop policy if exists "data_deletions read" on data_deletions;
create policy "data_deletions read" on data_deletions
  for select to authenticated using (true);

drop policy if exists "data_deletions insert" on data_deletions;
create policy "data_deletions insert" on data_deletions
  for insert to authenticated with check (true);

-- 証跡なので更新・削除は許可しない(サービスロールを含め、ポリシーを作らない)

-- 追記専用をDBレベルでも担保する
create or replace function data_deletions_append_only() returns trigger
language plpgsql as $$
begin
  raise exception '削除・復元の操作ログは変更・削除できません';
end $$;

drop trigger if exists data_deletions_no_update on data_deletions;
create trigger data_deletions_no_update
  before update or delete on data_deletions
  for each row execute function data_deletions_append_only();
