-- =========================================================================
-- 契約書(申込書)・電子契約
--   - contract_templates: 契約書テンプレート(顧客ごとに内容をコピーして利用)
--   - contracts:          契約書本体(送付後は内容凍結・ハッシュ固定)
--   - contract_events:    監査証跡(追記専用。UPDATE/DELETE をトリガーで禁止)
--
-- 法的リスク低減のための設計:
--   1. 送付時に契約内容の SHA-256 ハッシュを保存し、署名時に照合(改ざん検知)
--   2. 送付後の内容変更を DB トリガーで物理的に拒否(電帳法の訂正削除防止措置)
--   3. 証跡(閲覧・コード検証・署名の IP/UA/時刻)を追記専用テーブルに保全
-- =========================================================================

-- 契約書テンプレート ------------------------------------------------------
create table if not exists contract_templates (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  description      text not null default '',
  doc_title        text not null,
  preamble         text not null default '',
  sections         jsonb not null default '[]'::jsonb,
  fee_tables       jsonb not null default '[]'::jsonb,
  provider_default jsonb not null default '{}'::jsonb,
  version          int not null default 1,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 契約書 ------------------------------------------------------------------
create table if not exists contracts (
  id                     uuid primary key default gen_random_uuid(),
  contract_number        text not null unique,
  customer_id            uuid not null references customers(id) on delete restrict,
  template_id            uuid references contract_templates(id) on delete set null,
  template_version       int,
  title                  text not null,
  preamble               text not null default '',
  status                 text not null default 'draft'
                         check (status in ('draft','sent','viewed','signed','declined','canceled')),
  provider               jsonb not null default '{}'::jsonb, -- 甲スナップショット
  customer_party         jsonb not null default '{}'::jsonb, -- 乙スナップショット
  sections               jsonb not null default '[]'::jsonb,
  fee_tables             jsonb not null default '[]'::jsonb,
  terms                  jsonb not null default '{}'::jsonb,
  sign_token             text unique,
  access_code            text,
  access_code_attempts   int not null default 0,
  expires_at             timestamptz,
  content_hash           text,
  sent_at                timestamptz,
  first_viewed_at        timestamptz,
  signed_at              timestamptz,
  signer_name            text not null default '',
  signer_email           text not null default '',
  signer_ip              text not null default '',
  signer_user_agent      text not null default '',
  declined_at            timestamptz,
  decline_reason         text not null default '',
  canceled_at            timestamptz,
  cancel_reason          text not null default '',
  linked_subscription_id uuid references subscriptions(id) on delete set null,
  linked_invoice_id      uuid references invoices(id) on delete set null,
  created_by             text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- 監査証跡(追記専用) ------------------------------------------------------
create table if not exists contract_events (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references contracts(id) on delete restrict,
  type         text not null check (type in (
    'created','updated','sent','reminded','viewed','code_failed','code_verified',
    'signed','manual_signed','declined','canceled','billing_linked'
  )),
  actor        text not null default '',
  ip           text not null default '',
  user_agent   text not null default '',
  detail       text not null default '',
  content_hash text not null default '',
  created_at   timestamptz not null default now()
);

-- インデックス ------------------------------------------------------------
create index if not exists idx_contracts_customer on contracts(customer_id);
create index if not exists idx_contracts_status on contracts(status);
create index if not exists idx_contracts_created on contracts(created_at desc);
create index if not exists idx_contract_events_contract
  on contract_events(contract_id, created_at);

-- updated_at 自動更新 ------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contracts_touch_updated on contracts;
create trigger contracts_touch_updated
  before update on contracts
  for each row execute function public.touch_updated_at();

drop trigger if exists contract_templates_touch_updated on contract_templates;
create trigger contract_templates_touch_updated
  before update on contract_templates
  for each row execute function public.touch_updated_at();

-- 送付後の内容凍結 ---------------------------------------------------------
-- 下書き(draft)以外の契約は、署名対象の内容(条文・料金・当事者・ハッシュ等)を
-- 変更できない。サービスロールを含む全経路で拒否される。
create or replace function public.prevent_contract_content_change()
returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' then
    if new.title            is distinct from old.title
      or new.preamble        is distinct from old.preamble
      or new.provider        is distinct from old.provider
      or new.customer_party  is distinct from old.customer_party
      or new.sections        is distinct from old.sections
      or new.fee_tables      is distinct from old.fee_tables
      or new.terms           is distinct from old.terms
      or new.contract_number is distinct from old.contract_number
      or new.customer_id     is distinct from old.customer_id
      or new.content_hash    is distinct from old.content_hash
    then
      raise exception '送付済みの契約書の内容は変更できません (contract %)', old.contract_number;
    end if;
    -- 締結済み以降は署名記録も不変
    if old.status in ('signed','declined','canceled')
      and (new.signed_at   is distinct from old.signed_at
        or new.signer_name is distinct from old.signer_name
        or new.signer_ip   is distinct from old.signer_ip
        or new.status      is distinct from old.status
        or new.signer_user_agent is distinct from old.signer_user_agent)
      -- 取消のみ、締結前ステータスからの遷移として別途許可される
    then
      raise exception '締結済み・終了済みの契約書は変更できません (contract %)', old.contract_number;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists contracts_freeze_content on contracts;
create trigger contracts_freeze_content
  before update on contracts
  for each row execute function public.prevent_contract_content_change();

-- 削除も禁止(証跡保全。取消は status='canceled' で表現する) ----------------
create or replace function public.prevent_contract_delete()
returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' then
    raise exception '送付済みの契約書は削除できません。取消(canceled)を使用してください (contract %)', old.contract_number;
  end if;
  return old;
end;
$$;

drop trigger if exists contracts_prevent_delete on contracts;
create trigger contracts_prevent_delete
  before delete on contracts
  for each row execute function public.prevent_contract_delete();

-- 監査証跡は追記専用(UPDATE/DELETE を全経路で禁止) --------------------------
create or replace function public.prevent_contract_event_change()
returns trigger language plpgsql as $$
begin
  raise exception '監査証跡は変更・削除できません (contract_events)';
end;
$$;

drop trigger if exists contract_events_immutable on contract_events;
create trigger contract_events_immutable
  before update or delete on contract_events
  for each row execute function public.prevent_contract_event_change();

-- アクセスコード試行回数の原子的インクリメント ------------------------------
-- read-modify-write では並行リクエストでロックアウト(試行上限)を回避できるため、
-- DB側で加算して加算後の値を返す。
create or replace function public.bump_contract_code_attempts(cid uuid)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  n int;
begin
  update contracts
    set access_code_attempts = access_code_attempts + 1
    where id = cid
    returning access_code_attempts into n;
  return coalesce(n, 0);
end;
$$;

-- RLS ----------------------------------------------------------------------
alter table contract_templates enable row level security;
alter table contracts          enable row level security;
alter table contract_events    enable row level security;

drop policy if exists contract_templates_authenticated_all on contract_templates;
create policy contract_templates_authenticated_all on contract_templates
  for all to authenticated using (true) with check (true);

drop policy if exists contracts_authenticated_all on contracts;
create policy contracts_authenticated_all on contracts
  for all to authenticated using (true) with check (true);

-- 証跡: 参照と追記のみ(UPDATE/DELETE ポリシーは定義しない = 拒否)
drop policy if exists contract_events_select on contract_events;
create policy contract_events_select on contract_events
  for select to authenticated using (true);

drop policy if exists contract_events_insert on contract_events;
create policy contract_events_insert on contract_events
  for insert to authenticated with check (true);

-- 公開署名ページ(未認証)はサービスロール経由でのみアクセスする。
-- anon 向けポリシーは一切定義しない。
