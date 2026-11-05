-- =========================================================================
-- 店舗数による割引(ボリューム割引)と、請求書の修正履歴
--
-- 1) 料金プランに「N店舗目以降は1店舗あたり○円」の段を持たせる(plans.store_tiers)
--      [{"fromStore": 2, "initialFee": 100000, "monthly": 25000}, ...]
--      initialFee / monthly が null の段は、その項目を前の段(無ければ通常の金額)のままにする。
-- 2) 定期契約に、契約した時点の段を写して残す(subscriptions.store_tiers)
--      null = 割引なし。あとでプランの割引を変えても、締結済み・登録済みの契約の金額は変わらない。
--      (契約書の申込条件 contracts.terms にも、締結した時点の段と初期費用の内訳を写している)
-- 3) 請求書の明細を修正したとき、修正前の明細・金額を消さずに残す(invoice_revisions)
--      追記専用(変更・削除はトリガーで禁止)。
--      明細の入れ替え・合計の更新・履歴の追記は、関数 revise_invoice_items で
--      1つのトランザクションとして行う(途中で失敗しても、履歴の無い修正や明細の欠けが残らない)。
--
-- 何度実行しても同じ結果になる。
-- =========================================================================

-- 1) 料金プランの店舗数による割引 ------------------------------------------
alter table plans add column if not exists store_tiers jsonb not null default '[]'::jsonb;

-- 2) 定期契約に写した割引(契約した時点のもの) -------------------------------
alter table subscriptions add column if not exists store_tiers jsonb;

-- 3) 請求書の修正履歴 --------------------------------------------------------
create table if not exists invoice_revisions (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references invoices(id) on delete cascade,
  revised_at        timestamptz not null default now(),
  actor             text not null default '',          -- 修正した人
  reason            text not null default '',          -- 修正の理由
  -- 修正前(明細は [{description, quantity, unit_price, tax_rate, amount}] の順番どおり)
  before_items      jsonb not null default '[]'::jsonb,
  before_subtotal   numeric not null default 0,
  before_tax_total  numeric not null default 0,
  before_total      numeric not null default 0,
  before_notes      text not null default '',
  -- 修正後
  after_items       jsonb not null default '[]'::jsonb,
  after_total       numeric not null default 0
);

create index if not exists invoice_revisions_invoice_idx
  on invoice_revisions (invoice_id, revised_at);

-- 追記専用(UPDATE/DELETE を全経路で禁止)
create or replace function public.prevent_invoice_revision_change()
returns trigger language plpgsql as $$
begin
  raise exception '請求書の修正履歴は変更・削除できません (invoice_revisions)';
end;
$$;

drop trigger if exists invoice_revisions_immutable on invoice_revisions;
create trigger invoice_revisions_immutable
  before update or delete on invoice_revisions
  for each row execute function public.prevent_invoice_revision_change();

-- RLS: 参照と追記のみ(UPDATE/DELETE ポリシーは定義しない = 拒否)
alter table invoice_revisions enable row level security;

drop policy if exists invoice_revisions_select on invoice_revisions;
create policy invoice_revisions_select on invoice_revisions
  for select to authenticated using (true);

drop policy if exists invoice_revisions_insert on invoice_revisions;
create policy invoice_revisions_insert on invoice_revisions
  for insert to authenticated with check (true);

-- 明細の修正(履歴の追記 → 明細の入れ替え → 合計の更新)を1つのトランザクションで行う。
-- 入金前・NSS引き落としの一覧に入っていない請求書だけ修正できる(画面と同じ条件をここでも確かめる)。
-- p_items: [{description, quantity, unit_price, tax_rate, amount}](画面で計算・確認済みの値)
-- p_notes: null なら備考は変えない
create or replace function public.revise_invoice_items(
  p_invoice_id uuid,
  p_items      jsonb,
  p_subtotal   numeric,
  p_tax_total  numeric,
  p_total      numeric,
  p_notes      text,
  p_actor      text,
  p_reason     text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  inv     invoices%rowtype;
  before  jsonb;
  rev_id  uuid;
begin
  select * into inv from invoices where id = p_invoice_id for update;
  if not found or inv.deleted_at is not null then
    raise exception '請求書が見つかりません';
  end if;
  if inv.status = 'canceled' then
    raise exception '取り消した請求書は修正できません';
  end if;
  if inv.status in ('paid', 'partially_paid') or coalesce(inv.amount_paid, 0) > 0 then
    raise exception '入金済み（一部入金を含む）の請求書は修正できません';
  end if;
  if exists (
    select 1
      from direct_debit_batch_items bi
      join direct_debit_batches b on b.id = bi.batch_id
     where bi.invoice_id = p_invoice_id
       and b.deleted_at is null
  ) then
    raise exception 'NSS引き落としの一覧に入っている請求書は修正できません（一覧をゴミ箱へ移してから修正してください）';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception '明細を1行以上入れてください';
  end if;

  -- 修正前の明細(表示の順番どおり)
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'description', description,
               'quantity',    quantity,
               'unit_price',  unit_price,
               'tax_rate',    tax_rate,
               'amount',      amount
             ) order by position
           ),
           '[]'::jsonb
         )
    into before
    from invoice_items
   where invoice_id = p_invoice_id;

  insert into invoice_revisions (
    invoice_id, actor, reason,
    before_items, before_subtotal, before_tax_total, before_total, before_notes,
    after_items, after_total
  ) values (
    p_invoice_id, coalesce(p_actor, ''), coalesce(p_reason, ''),
    before, coalesce(inv.subtotal, 0), coalesce(inv.tax_total, 0), coalesce(inv.total, 0), coalesce(inv.notes, ''),
    p_items, p_total
  )
  returning id into rev_id;

  delete from invoice_items where invoice_id = p_invoice_id;

  insert into invoice_items (invoice_id, description, quantity, unit_price, tax_rate, amount, position)
  select p_invoice_id,
         coalesce(t.elem->>'description', ''),
         coalesce((t.elem->>'quantity')::numeric, 0),
         coalesce((t.elem->>'unit_price')::numeric, 0),
         coalesce((t.elem->>'tax_rate')::numeric, 0),
         coalesce((t.elem->>'amount')::numeric, 0),
         (t.ord - 1)::int
    from jsonb_array_elements(p_items) with ordinality as t(elem, ord);

  update invoices
     set subtotal  = p_subtotal,
         tax_total = p_tax_total,
         total     = p_total,
         notes     = coalesce(p_notes, notes)
   where id = p_invoice_id;

  return rev_id;
end;
$$;

-- アプリのサーバー(サービスロール)からだけ呼べるようにする
revoke all on function public.revise_invoice_items(uuid, jsonb, numeric, numeric, numeric, text, text, text)
  from public, anon, authenticated;
grant execute on function public.revise_invoice_items(uuid, jsonb, numeric, numeric, numeric, text, text, text)
  to service_role;

-- PostgREST(Supabase の API)に新しい関数・表をすぐ認識させる
notify pgrst, 'reload schema';
