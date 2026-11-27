-- =========================================================================
-- 売上台帳（税理士さん向け）
--
-- 1) 請求書の明細ごとの計上月(invoice_items.service_month, 'YYYY-MM')
--      売上は「サービスを提供した月」に計上する(初期費用は利用を始めた月、月額はその月の分)。
--      請求書をあとから出しても計上月は動かさないため、明細に計上月を持たせる。
--      空の明細は、定期請求なら対象月(invoices.billing_period)、それ以外は発行月として扱う。
-- 2) 決算月(organizations.fiscal_year_end_month, 1〜12)。売上台帳の1期の区切りに使う
-- 3) 役割「税理士（閲覧のみ）」(accountant) を追加
-- 4) 閲覧専用のアカウント(税理士の役割だけを持つアカウント)は、Supabase の API から
--    テーブルを直接読み書きできないようにする(アプリの画面はサーバー側のサービスロールで読むので影響しない)
-- 5) 明細の修正(revise_invoice_items)で計上月を引き継ぐ
--
-- 何度実行しても同じ結果になる。
-- =========================================================================

-- 1) 明細の計上月 ------------------------------------------------------------
alter table invoice_items add column if not exists service_month text;

alter table invoice_items drop constraint if exists invoice_items_service_month_check;
alter table invoice_items add constraint invoice_items_service_month_check
  check (service_month is null or service_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- 2) 決算月(既定は3月。設定画面の「自社情報」で変えられる) ----------------
alter table organizations add column if not exists fiscal_year_end_month smallint not null default 3;

alter table organizations drop constraint if exists organizations_fiscal_year_end_month_check;
alter table organizations add constraint organizations_fiscal_year_end_month_check
  check (fiscal_year_end_month between 1 and 12);

-- 3) 役割「税理士（閲覧のみ）」 -------------------------------------------
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('owner','staff','admin','billing','dev','engineer','dev_manager','accountant'));

alter table profiles drop constraint if exists profiles_roles_check;
alter table profiles add constraint profiles_roles_check
  check (
    array_length(roles, 1) is null
    or roles <@ array['owner','staff','admin','billing','dev','engineer','dev_manager','accountant']::text[]
  );

-- 4) 閲覧専用アカウントの直接アクセスを止める --------------------------------
-- 税理士の役割だけを持つ(社内の役割を持たない)ログイン中のアカウントか
create or replace function public.is_read_only_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from profiles p
     where p.id = auth.uid()
       and (p.role = 'accountant' or 'accountant' = any(p.roles))
       -- 社内の役割を1つでも持っていれば閲覧専用ではない(兼務)
       and not (
         (p.roles && array['owner','staff','admin','billing','dev','engineer','dev_manager']::text[])
         or (
           coalesce(array_length(p.roles, 1), 0) = 0
           and p.role in ('owner','staff','admin','billing','dev','engineer','dev_manager')
         )
       )
  );
$$;

revoke all on function public.is_read_only_user() from public;
grant execute on function public.is_read_only_user() to authenticated, service_role;

-- RLS を有効にしている public の全テーブルに「閲覧専用アカウントは使えない」制限を足す。
-- restrictive なので、既存の許可(社内アカウントは全件読み書き)はそのまま。
-- サービスロール(アプリのサーバー・cron)は RLS をバイパスするため影響しない。
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public' and rowsecurity
  loop
    execute format('drop policy if exists %I on %I', t || '_read_only_guard', t);
    execute format(
      'create policy %I on %I as restrictive for all to authenticated '
      'using (not public.is_read_only_user()) with check (not public.is_read_only_user())',
      t || '_read_only_guard', t
    );
  end loop;
end $$;

-- 5) 明細の修正で計上月を引き継ぐ(0025 の関数を置き換え) --------------------
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

  -- 修正前の明細(表示の順番どおり・計上月つき)
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'description',   description,
               'quantity',      quantity,
               'unit_price',    unit_price,
               'tax_rate',      tax_rate,
               'amount',        amount,
               'service_month', service_month
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

  insert into invoice_items (invoice_id, description, quantity, unit_price, tax_rate, amount, position, service_month)
  select p_invoice_id,
         coalesce(t.elem->>'description', ''),
         coalesce((t.elem->>'quantity')::numeric, 0),
         coalesce((t.elem->>'unit_price')::numeric, 0),
         coalesce((t.elem->>'tax_rate')::numeric, 0),
         coalesce((t.elem->>'amount')::numeric, 0),
         (t.ord - 1)::int,
         nullif(t.elem->>'service_month', '')
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

revoke all on function public.revise_invoice_items(uuid, jsonb, numeric, numeric, numeric, text, text, text)
  from public, anon, authenticated;
grant execute on function public.revise_invoice_items(uuid, jsonb, numeric, numeric, numeric, text, text, text)
  to service_role;

-- PostgREST(Supabase の API)に新しい列・関数をすぐ認識させる
notify pgrst, 'reload schema';
