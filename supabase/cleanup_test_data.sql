-- =========================================================================
-- テストデータの全削除(業務データを空にする)
--
-- 対象: 顧客・口座振替(NSSの手続き)・定期契約・請求書・入金・NSS引き落としの一覧・
--       銀行明細・活動ログ・契約書・契約書の監査証跡・代理店報酬
-- 残す: 自社情報(organizations)・料金プラン(plans)・
--       契約書テンプレート(contract_templates)・ユーザー(profiles)
--
-- ※ この操作は取り消せません。実行前に必要ならバックアップを取得してください。
-- ※ 契約書の監査証跡は通常 UPDATE/DELETE がトリガーで禁止されているため、
--    テストデータ削除のためにトリガーを一時的に無効化して削除します。
--    (本番運用開始後の実データにはこのスクリプトを使わないこと)
-- =========================================================================

begin;

-- 監査証跡・契約書の保全トリガーを一時無効化(テストデータ削除のため)
alter table contract_events disable trigger contract_events_immutable;
alter table contracts       disable trigger contracts_prevent_delete;
alter table contracts       disable trigger contracts_freeze_content;

-- 代理店報酬(0023 適用後のみ存在する)
do $$
begin
  if to_regclass('public.agency_commissions') is not null then
    delete from agency_commissions;
  end if;
end $$;

delete from contract_events;
delete from contracts;
delete from direct_debit_batch_items;
delete from direct_debit_batches;
delete from bank_transactions;
delete from payments;
delete from invoice_items;
delete from invoices;
delete from subscriptions;
delete from direct_debit_mandates;
delete from customers;
delete from activities;

-- 保全トリガーを元に戻す
alter table contract_events enable trigger contract_events_immutable;
alter table contracts       enable trigger contracts_prevent_delete;
alter table contracts       enable trigger contracts_freeze_content;

commit;
