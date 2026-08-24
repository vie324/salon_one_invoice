-- =========================================================================
-- 初期データ(最小構成)
-- テスト用のサンプルデータ(顧客・請求・入金・契約など)は投入しない。
-- 自社情報(organizations)と料金プラン(plans)のみを初期投入する。
-- 冪等: 既にデータがある場合は重複挿入しない。
-- =========================================================================

-- 組織(1件のみ)。空欄の項目(TEL/メール/振込先)は
-- 設定画面「自社情報（請求書の発行元）」から入力してください(管理者のみ)。
-- 登録番号は適格請求書(インボイス)に必要なため、初期値として投入する。
insert into organizations (id, name, postal_code, address, tel, email,
  registration_number, bank_name, bank_branch, bank_branch_code, bank_account_type,
  bank_account_number, bank_account_holder, invoice_prefix, default_tax_rate, logo_text)
select
  'a0000000-0000-0000-0000-000000000001', '株式会社サロンワン', '',
  '東京都大田区蒲田５丁目７−４　エンゼルハイム蒲田第5　1101号室', '', '',
  'T2010801037576', '', '', '', '普通', '', '',
  'INV', 0.10, 'S1'
where not exists (select 1 from organizations);

-- 料金プラン(基本料金＋オプション / 月額・年間) — 料金表に準拠
insert into plans (id, name, description, amount, tax_rate, billing_day, initial_fee, term, options)
select * from (values
  ('c0000000-0000-0000-0000-000000000001'::uuid,'定価','標準プラン（月額）',30000::numeric,0.1::numeric,27,200000::numeric,'monthly',
    '[{"key":"hpb","name":"HPB・ミニモ連携","monthly":10000},{"key":"line","name":"LINE連携","monthly":10000}]'::jsonb),
  ('c0000000-0000-0000-0000-000000000002'::uuid,'まとめパック','オプションまとめ割（月額）',30000,0.1,27,200000,'monthly',
    '[{"key":"hpb","name":"HPB・ミニモ連携","monthly":7500},{"key":"line","name":"LINE連携","monthly":7500}]'::jsonb),
  ('c0000000-0000-0000-0000-000000000003'::uuid,'特別期間限定','期間限定キャンペーン（月額）',5000,0.1,27,50000,'monthly',
    '[{"key":"hpb","name":"HPB・ミニモ連携","monthly":5000},{"key":"line","name":"LINE連携","monthly":5000}]'::jsonb),
  ('c0000000-0000-0000-0000-000000000004'::uuid,'代理店版 特別','代理店向け特別（月額）',20000,0.1,27,100000,'monthly',
    '[{"key":"hpb","name":"HPB・ミニモ連携","monthly":5000},{"key":"line","name":"LINE連携","monthly":5000}]'::jsonb),
  ('c0000000-0000-0000-0000-000000000005'::uuid,'定価','標準プラン（年間）',20000,0.1,27,100000,'annual',
    '[{"key":"hpb","name":"HPB・ミニモ連携","monthly":5000},{"key":"line","name":"LINE連携","monthly":5000}]'::jsonb),
  ('c0000000-0000-0000-0000-000000000006'::uuid,'まとめパック','オプションまとめ割（年間）',20000,0.1,27,100000,'annual',
    '[{"key":"hpb","name":"HPB・ミニモ連携","monthly":2500},{"key":"line","name":"LINE連携","monthly":2500}]'::jsonb),
  ('c0000000-0000-0000-0000-000000000007'::uuid,'特別期間限定','期間限定キャンペーン（年間）',5000,0.1,27,50000,'annual',
    '[{"key":"hpb","name":"HPB・ミニモ連携","monthly":2500},{"key":"line","name":"LINE連携","monthly":2500}]'::jsonb),
  ('c0000000-0000-0000-0000-000000000008'::uuid,'代理店版','代理店向け（年間）',15000,0.1,27,50000,'annual',
    '[{"key":"hpb","name":"HPB・ミニモ連携","monthly":2500},{"key":"line","name":"LINE連携","monthly":2500}]'::jsonb)
) as v(id, name, description, amount, tax_rate, billing_day, initial_fee, term, options)
where not exists (select 1 from plans);
