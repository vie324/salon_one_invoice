import { NextResponse } from "next/server";
import type { Repository } from "@/lib/data";
import { getJobRepository } from "@/lib/data";
import { getStripe } from "@/lib/payments/stripe-client";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Stripe Webhook。checkout / invoice / subscription イベントをアプリへ同期。 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: any;
  try {
    const stripe = getStripe();
    if (secret && sig) {
      event = stripe.webhooks.constructEvent(body, sig, secret);
    } else {
      // 署名シークレット未設定時は検証をスキップ（ローカルの簡易確認用）
      event = JSON.parse(body);
    }
  } catch (e) {
    return new NextResponse(`Webhook error: ${(e as Error).message}`, { status: 400 });
  }

  const repo = await getJobRepository();
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        const appCustomerId = s.client_reference_id || s.metadata?.appCustomerId;
        const stripeCustomerId = typeof s.customer === "string" ? s.customer : s.customer?.id;
        if (appCustomerId && stripeCustomerId) {
          await repo.linkStripeCustomer(appCustomerId, stripeCustomerId);
        }
        const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
        if (appCustomerId && subId) {
          await repo.upsertStripeSubscription({
            customerId: appCustomerId,
            stripeSubscriptionId: subId,
            planName: s.metadata?.planName || "月額プラン",
            amount: Number(s.metadata?.monthly || 0),
            status: "active",
          });
        }
        break;
      }
      case "invoice.paid":
      case "invoice.payment_succeeded":
        await recordFromStripeInvoice(repo, event.data.object, "paid");
        break;
      case "invoice.payment_failed":
        await recordFromStripeInvoice(repo, event.data.object, "failed");
        break;
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        if (sub?.id) await repo.markStripeSubscriptionCanceled(sub.id);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[stripe webhook] handler error:", (e as Error).message);
    return new NextResponse("handler error", { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function recordFromStripeInvoice(
  repo: Repository,
  inv: any,
  status: "paid" | "failed",
) {
  const stripeCustomerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
  if (!stripeCustomerId) return;

  const lineData: any[] = inv.lines?.data ?? [];
  const lines = lineData.map((l) => ({
    description: l.description || (l.price?.recurring ? "月額" : "項目"),
    amount: Number(l.amount ?? 0),
  }));
  const total = Number(
    inv.amount_paid ?? inv.total ?? lines.reduce((s, l) => s + l.amount, 0),
  );
  const isFirst = inv.billing_reason === "subscription_create";

  const paidAtUnix = inv.status_transitions?.paid_at ?? inv.created;
  const issueDate = unixToISODate(inv.created);
  const paidAt = paidAtUnix ? unixToISODate(paidAtUnix) : issueDate;

  // 請求対象月: recurring 行の period.end から算出
  const periodEnd = lineData.find((l) => l.period?.end)?.period?.end;
  const billingPeriod = periodEnd ? unixToISODate(periodEnd).slice(0, 7) : issueDate.slice(0, 7);

  await repo.recordStripeInvoice({
    externalId: inv.id,
    stripeCustomerId,
    status,
    type: isFirst ? "initial" : "recurring",
    billingPeriod,
    issueDate,
    lines: lines.length ? lines : [{ description: "Stripe請求", amount: total }],
    total,
    paidAt: status === "paid" ? paidAt : null,
  });
}

function unixToISODate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}
