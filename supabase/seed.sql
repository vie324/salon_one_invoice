-- =========================================================================
-- 初期データ(本番/検証用の最小サンプル)
-- 冪等: 既にデータがある場合は組織のみ確認し、重複挿入を避ける。
-- より賑やかなデモは Supabase 未設定時の「デモモード」で確認できます。
-- =========================================================================

-- 組織(1件のみ) ---------------------------------------------------------
insert into organizations (id, name, postal_code, address, tel, email,
  registration_number, bank_name, bank_branch, bank_account_type,
  bank_account_number, bank_account_holder, invoice_prefix, default_tax_rate, logo_text)
select
  'a0000000-0000-0000-0000-000000000001', 'サロン・ワン株式会社', '150-0001',
  '東京都渋谷区神宮前1-2-3 サロンワンビル 4F', '03-1234-5678', 'billing@salon-one.example.jp',
  'T1234567890123', 'みずほ銀行', '渋谷支店', '普通', '1234567', 'サロンワン(カ',
  'INV', 0.10, 'S1'
where not exists (select 1 from organizations);

-- 以降はサンプルが未投入のときだけ実行 ------------------------------------
do $$
declare
  this_month_27 date := (date_trunc('month', current_date) + interval '26 days')::date;
  next_month_27 date := (date_trunc('month', current_date) + interval '1 month 26 days')::date;
  last_period text := to_char(current_date - interval '1 month', 'YYYY-MM');
  this_period text := to_char(current_date, 'YYYY-MM');
  ym_last text := to_char(current_date - interval '1 month', 'YYYYMM');
  ym_this text := to_char(current_date, 'YYYYMM');
  inv1 uuid := 'b0000000-0000-0000-0000-000000000001';
  inv2 uuid := 'b0000000-0000-0000-0000-000000000002';
begin
  if exists (select 1 from customers) then
    return;
  end if;

  -- 料金プラン(基本料金＋オプション / 月額・年間) — 添付の料金表に準拠
  insert into plans (id, name, description, amount, tax_rate, billing_day, initial_fee, term, options) values
    ('c0000000-0000-0000-0000-000000000001','定価','標準プラン（月額）',30000,0.1,27,200000,'monthly',
      '[{"key":"hpb","name":"HPB・ミニモ連携","monthly":10000},{"key":"line","name":"LINE連携","monthly":10000}]'::jsonb),
    ('c0000000-0000-0000-0000-000000000002','まとめパック','オプションまとめ割（月額）',30000,0.1,27,200000,'monthly',
      '[{"key":"hpb","name":"HPB・ミニモ連携","monthly":7500},{"key":"line","name":"LINE連携","monthly":7500}]'::jsonb),
    ('c0000000-0000-0000-0000-000000000003','特別期間限定','期間限定キャンペーン（月額）',5000,0.1,27,50000,'monthly',
      '[{"key":"hpb","name":"HPB・ミニモ連携","monthly":5000},{"key":"line","name":"LINE連携","monthly":5000}]'::jsonb),
    ('c0000000-0000-0000-0000-000000000004','代理店版 特別','代理店向け特別（月額）',20000,0.1,27,100000,'monthly',
      '[{"key":"hpb","name":"HPB・ミニモ連携","monthly":5000},{"key":"line","name":"LINE連携","monthly":5000}]'::jsonb),
    ('c0000000-0000-0000-0000-000000000005','定価','標準プラン（年間）',20000,0.1,27,100000,'annual',
      '[{"key":"hpb","name":"HPB・ミニモ連携","monthly":5000},{"key":"line","name":"LINE連携","monthly":5000}]'::jsonb),
    ('c0000000-0000-0000-0000-000000000006','まとめパック','オプションまとめ割（年間）',20000,0.1,27,100000,'annual',
      '[{"key":"hpb","name":"HPB・ミニモ連携","monthly":2500},{"key":"line","name":"LINE連携","monthly":2500}]'::jsonb),
    ('c0000000-0000-0000-0000-000000000007','特別期間限定','期間限定キャンペーン（年間）',5000,0.1,27,50000,'annual',
      '[{"key":"hpb","name":"HPB・ミニモ連携","monthly":2500},{"key":"line","name":"LINE連携","monthly":2500}]'::jsonb),
    ('c0000000-0000-0000-0000-000000000008','代理店版','代理店向け（年間）',15000,0.1,27,50000,'annual',
      '[{"key":"hpb","name":"HPB・ミニモ連携","monthly":2500},{"key":"line","name":"LINE連携","monthly":2500}]'::jsonb);

  -- 顧客(=導入サロン)
  insert into customers (id, code, name, kana, contact_name, email, phone, postal_code, address, payment_method, assignee) values
    ('d0000000-0000-0000-0000-000000000001','S-0001','Hair & Spa LUCE','ヘアアンドスパルーチェ','山田 花子','luce@example.com','03-1111-0001','150-0002','東京都渋谷区渋谷2-1-1','direct_debit','佐々木 涼'),
    ('d0000000-0000-0000-0000-000000000002','S-0002','beauty room clover','ビューティルームクローバー','佐藤 美咲','clover@example.com','03-1111-0002','153-0051','東京都目黒区上目黒3-4-5','direct_debit','田村 彩'),
    ('d0000000-0000-0000-0000-000000000003','S-0008','men''s grooming AXIS','メンズグルーミングアクシス','中村 大輔','axis@example.com','03-1111-0008','160-0022','東京都新宿区新宿5-6-7','credit_card','田村 彩'),
    ('d0000000-0000-0000-0000-000000000004','S-0005','salon de Fleur','サロンドフルール','高橋 由美','fleur@example.com','03-1111-0005','158-0094','東京都世田谷区玉川3-5-6','bank_transfer','佐々木 涼'),
    ('d0000000-0000-0000-0000-000000000005','A-0001','株式会社ビューティ・パートナーズ','カブシキガイシャビューティパートナーズ','経理部 三浦','keiri@beautypartners.example.co.jp','03-9876-5432','104-0061','東京都中央区銀座4-5-6','bank_transfer','佐々木 涼');

  -- 口座振替マンデート
  insert into direct_debit_mandates (customer_id, bank_name, branch_name, branch_code, account_type, account_number, account_holder_kana, status, registered_at) values
    ('d0000000-0000-0000-0000-000000000001','三菱UFJ銀行','渋谷支店','135','普通','1234567','ヘアアンドスパルーチェ','active', current_date - interval '150 days'),
    ('d0000000-0000-0000-0000-000000000002','三井住友銀行','目黒支店','241','普通','7654321','ビューティルームクローバー','active', current_date - interval '150 days');

  -- 定期契約(基本料金＋オプション)
  insert into subscriptions (customer_id, plan_id, started_on, next_billing_date, billing_day, option_keys) values
    ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001', current_date - interval '180 days', next_month_27, 27, '["hpb","line"]'::jsonb),
    ('d0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002', current_date - interval '180 days', next_month_27, 27, '["hpb","line"]'::jsonb),
    ('d0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000008', current_date - interval '120 days', next_month_27, 27, '["hpb","line"]'::jsonb),
    ('d0000000-0000-0000-0000-000000000004','c0000000-0000-0000-0000-000000000005', current_date - interval '120 days', next_month_27, 27, '["hpb","line"]'::jsonb);

  -- 請求書(定価・月額＋オプション = 月額合計 50,000)。先月=入金済 / 当月=入金待ち。
  insert into invoices (id, invoice_number, customer_id, subscription_id, type, status, issue_date, due_date, billing_period, payment_method, subtotal, tax_total, total, amount_paid, sent_at, paid_at)
  values
    (inv1, 'INV-'||ym_last||'-0001','d0000000-0000-0000-0000-000000000001',
      (select id from subscriptions where customer_id='d0000000-0000-0000-0000-000000000001'),
      'recurring','paid', date_trunc('month', current_date - interval '1 month')::date, this_month_27 - interval '1 month', last_period,'direct_debit',50000,5000,55000,55000, current_date - interval '35 days', (this_month_27 - interval '1 month')::date),
    (inv2, 'INV-'||ym_this||'-0001','d0000000-0000-0000-0000-000000000001',
      (select id from subscriptions where customer_id='d0000000-0000-0000-0000-000000000001'),
      'recurring','awaiting_payment', date_trunc('month', current_date)::date, this_month_27, this_period,'direct_debit',50000,5000,55000,0, current_date - interval '5 days', null);

  insert into invoice_items (invoice_id, description, quantity, unit_price, tax_rate, amount, position) values
    (inv1, '定価（'||last_period||'）',1,30000,0.1,30000,0),
    (inv1, 'オプション: HPB・ミニモ連携',1,10000,0.1,10000,1),
    (inv1, 'オプション: LINE連携',1,10000,0.1,10000,2),
    (inv2, '定価（'||this_period||'）',1,30000,0.1,30000,0),
    (inv2, 'オプション: HPB・ミニモ連携',1,10000,0.1,10000,1),
    (inv2, 'オプション: LINE連携',1,10000,0.1,10000,2);

  -- 入金(先月分)
  insert into payments (invoice_id, customer_id, amount, method, paid_at, reference, matched_by) values
    (inv1,'d0000000-0000-0000-0000-000000000001',55000,'direct_debit',(this_month_27 - interval '1 month')::date,'口座振替','auto');

  -- 活動
  insert into activities (kind, message, actor, amount, link_invoice_id) values
    ('payment_confirmed','Hair & Spa LUCE の口座振替を確認','システム',55000,inv1),
    ('invoice_sent','Hair & Spa LUCE へ請求書を送付','佐々木 涼',55000,inv2);
end $$;
