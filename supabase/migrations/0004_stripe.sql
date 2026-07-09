-- =========================================================================
-- Stripe 連携用カラム
-- =========================================================================
alter table customers     add column if not exists stripe_customer_id text;
alter table subscriptions add column if not exists stripe_subscription_id text;
alter table invoices      add column if not exists external_id text;

-- 外部請求書(Stripe)の冪等化: external_id は一意
create unique index if not exists idx_invoices_external
  on invoices(external_id) where external_id is not null;

create index if not exists idx_customers_stripe on customers(stripe_customer_id);
create index if not exists idx_subscriptions_stripe on subscriptions(stripe_subscription_id);
