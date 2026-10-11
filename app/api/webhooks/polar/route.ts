import { webhooks } from "@polar-sh/sdk/2026-10";

import { serverEnv } from "@/lib/env";
import { handlePolarEvent } from "@/lib/server/webhooks/polar";

/**
 * Polar -> GameSmith payments. In the Polar dashboard add a webhook to
 * <app url>/api/webhooks/polar for order.paid, order.refunded and the
 * subscription.* events, then set POLAR_WEBHOOK_SECRET.
 *
 * Signature check first (Standard Webhooks, 5 minute tolerance), then the
 * event is applied in one transaction keyed by `webhook-id`. Errors return
 * 500 so Polar retries; Polar waits 10 seconds at most, and this does a few
 * small queries.
 */
export async function POST(request: Request) {
  const secret = serverEnv().POLAR_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[polar-webhook] POLAR_WEBHOOK_SECRET is not set");
    return Response.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const body = await request.text();
  const headers = {
    "webhook-id": request.headers.get("webhook-id") ?? "",
    "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
    "webhook-signature": request.headers.get("webhook-signature") ?? "",
  };

  let event: { type: string; data: unknown };
  try {
    event = await webhooks.validateEvent(body, headers, secret);
  } catch (error) {
    if (error instanceof webhooks.PolarWebhookVerificationError) {
      return Response.json({ error: "Invalid signature" }, { status: 403 });
    }
    if (error instanceof webhooks.PolarWebhookUnknownTypeError) {
      // Signed, but an event this SDK version doesn't know. Nothing to do.
      return Response.json({ ok: true, result: "ignored" }, { status: 202 });
    }
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const result = await handlePolarEvent(headers["webhook-id"], event);
    return Response.json({ ok: true, result }, { status: 202 });
  } catch (error) {
    console.error("[polar-webhook] failed to process", event.type, headers["webhook-id"], error);
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
