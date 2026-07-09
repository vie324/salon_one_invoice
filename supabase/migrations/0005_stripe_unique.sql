-- =========================================================================
-- Stripe サブスクリプションIDの一意制約
-- 並行 Webhook 再送によるサブスクリプション重複行を防止する。
-- =========================================================================

-- 既存の重複行があれば、最古の1行を残して重複を解消(安全に一意化するため)
delete from subscriptions s
using subscriptions d
where s.stripe_subscription_id is not null
  and s.stripe_subscription_id = d.stripe_subscription_id
  and s.ctid > d.ctid;

-- 非ユニークな索引を一意(部分)索引に置き換え
drop index if exists idx_subscriptions_stripe;
create unique index if not exists idx_subscriptions_stripe
  on subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;
