-- =========================================================================
-- 関数・トリガー
-- =========================================================================

-- 新規サインアップ時に profiles を自動作成 --------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'staff')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- billing_day を指定月に適用して次回請求日を返す(末日補正あり) --------------
create or replace function public.next_billing_from(from_date date, billing_day int)
returns date
language plpgsql
immutable
as $$
declare
  next_first date := (date_trunc('month', from_date) + interval '1 month')::date;
  days_in int := extract(day from (next_first + interval '1 month - 1 day'))::int;
begin
  return next_first + (least(billing_day, days_in) - 1);
end;
$$;

-- 定期請求の自動生成(参考: DB側で直接実行したい場合)---------------------
-- アプリの Cron(/api/cron/generate-invoices)は同等処理を JS で行うため、
-- 通常はそちらで十分。ここは billing_period 単位で二重生成を防止する。
create or replace function public.run_recurring_billing(as_of date default current_date)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  sub record;
  plan_row record;
  cust record;
  period text;
  ym text;
  new_number text;
  seq int;
  new_invoice_id uuid;
  base numeric;
  tax numeric;
  prefix text;
  generated int := 0;
begin
  select coalesce(invoice_prefix, 'INV') into prefix from organizations limit 1;
  prefix := coalesce(prefix, 'INV');

  for sub in
    select * from subscriptions
    where status = 'active' and next_billing_date <= as_of
  loop
    select * into plan_row from plans where id = sub.plan_id;
    if plan_row is null then continue; end if;

    period := to_char(sub.next_billing_date, 'YYYY-MM');
    ym := to_char(sub.next_billing_date, 'YYYYMM');

    if exists (
      select 1 from invoices
      where subscription_id = sub.id and billing_period = period
    ) then
      update subscriptions
        set next_billing_date = public.next_billing_from(next_billing_date, billing_day)
      where id = sub.id;
      continue;
    end if;

    select * into cust from customers where id = sub.customer_id;
    base := plan_row.amount;
    tax := round(base * plan_row.tax_rate);

    seq := coalesce((
      select max((split_part(invoice_number, '-', 3))::int)
      from invoices
      where invoice_number like prefix || '-' || ym || '-%'
    ), 0) + 1;
    new_number := prefix || '-' || ym || '-' || lpad(seq::text, 4, '0');

    insert into invoices (
      invoice_number, customer_id, subscription_id, type, status,
      issue_date, due_date, billing_period, payment_method,
      subtotal, tax_total, total, sent_at
    ) values (
      new_number, sub.customer_id, sub.id, 'recurring',
      case when cust.payment_method = 'direct_debit' then 'awaiting_payment' else 'sent' end,
      date_trunc('month', sub.next_billing_date)::date, sub.next_billing_date, period, cust.payment_method,
      base, tax, base + tax, now()
    ) returning id into new_invoice_id;

    insert into invoice_items (invoice_id, description, quantity, unit_price, tax_rate, amount, position)
    values (new_invoice_id, plan_row.name || '（' || period || '）', 1, base, plan_row.tax_rate, base, 0);

    update subscriptions
      set next_billing_date = public.next_billing_from(next_billing_date, billing_day)
    where id = sub.id;

    generated := generated + 1;
  end loop;

  return generated;
end;
$$;
