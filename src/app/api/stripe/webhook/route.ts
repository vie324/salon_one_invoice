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
  if (secret) {
    // 署名シークレットが設定済みなら必ず検証する（fail-open を防ぐ）
    if (!sig) {
      return new NextResponse("Missing stripe-signature header", { status: 400 });
    }
    try {
      event = getStripe().webhooks.constructEvent(body, sig, secret);
    } catch (e) {
      return new NextResponse(`Signature verification failed: ${(e as Error).message}`, {
        status: 400,
      });
    }
  } else {
    // 開発用フォールバック（本番では必ず STRIPE_WEBHOOK_SECRET を設定すること）
    console.warn(
      "[stripe webhook] STRIPE_WEBHOOK_SECRET 未設定のため署名検証をスキップします（本番では設定必須）",
    );
    try {
      event = JSON.parse(body);
    } catch (e) {
      return new NextResponse(`Invalid body: ${(e as Error).message}`, { status: 400 });
    }
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
      case "invoice.payment_succeeded": {
        const outcome = await recordFromStripeInvoice(repo, event.data.object, "paid");
        // 顧客リンク前に届いた場合は 503 で再送させ、入金の取りこぼしを防ぐ
        if (outcome === "unresolved") {
          return new NextResponse("customer not yet linked; retry", { status: 503 });
        }
        break;
      }
      case "invoice.payment_failed": {
        const outcome = await recordFromStripeInvoice(repo, event.data.object, "failed");
        if (outcome === "unresolved") {
          return new NextResponse("customer not yet linked; retry", { status: 503 });
        }
        break;
      }
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

type InvoiceOutcome = "ok" | "unresolved";

async function recordFromStripeInvoice(
  repo: Repository,
  inv: any,
  status: "paid" | "failed",
): Promise<InvoiceOutcome> {
  const stripeCustomerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
  if (!stripeCustomerId) return "ok"; // 顧客不明の請求は対象外(スキップ)

  // 顧客がまだ紐付いていない場合は再送させる（順序逆転での取りこぼし防止）
  const linked = await repo.findCustomerByStripeCustomerId(stripeCustomerId);
  if (!linked) return "unresolved";

  const lineData: any[] = inv.lines?.data ?? [];
  const lines = lineData.map((l) => ({
    description: l.description || (l.price?.recurring ? "月額" : "項目"),
    amount: Number(l.amount ?? 0),
  }));
  const linesSum = lines.reduce((s, l) => s + l.amount, 0);
  // 入金済は amount_paid、失敗は amount_due（amount_paid は 0 のため使わない）
  const total =
    status === "paid"
      ? Number(inv.amount_paid ?? inv.total ?? linesSum)
      : Number(inv.amount_due ?? inv.total ?? linesSum);
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
  return "ok";
}

function unixToISODate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}
