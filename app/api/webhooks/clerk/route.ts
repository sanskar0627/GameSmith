import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";

import { handleClerkEvent } from "@/lib/server/webhooks/clerk";

/**
 * Clerk -> GameSmith user sync.
 * Configure in Clerk Dashboard -> Webhooks with events user.created,
 * user.updated and user.deleted, then set CLERK_WEBHOOK_SIGNING_SECRET.
 */
export async function POST(request: NextRequest) {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) {
    console.error("[clerk-webhook] CLERK_WEBHOOK_SIGNING_SECRET is not set");
    return Response.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const deliveryId = request.headers.get("svix-id")?.trim();

  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }
  if (!deliveryId) {
    return Response.json({ error: "Missing delivery id" }, { status: 400 });
  }

  try {
    const result = await handleClerkEvent(deliveryId, event);
    return Response.json({ ok: true, result });
  } catch (error) {
    console.error("[clerk-webhook] failed to process", event.type, deliveryId, error);
    // 500 makes Clerk retry with backoff.
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
