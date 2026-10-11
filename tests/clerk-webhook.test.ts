import { createHmac, randomBytes } from "node:crypto";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/webhooks/clerk/route";
import { getUserById } from "@/lib/server/users";

// A real Standard Webhooks secret and signature, so the route's actual
// `verifyWebhook` runs (no mocking of signature checks).
const SECRET = `whsec_${randomBytes(24).toString("base64")}`;

function signedRequest(event: object, opts: { id?: string; secret?: string; tamper?: boolean } = {}) {
  const id = opts.id ?? `msg_${randomBytes(8).toString("hex")}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify(event);
  const key = Buffer.from((opts.secret ?? SECRET).replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return new NextRequest("http://localhost/api/webhooks/clerk", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
    body: opts.tamper ? body.replace("Sanskar", "Mallory") : body,
  });
}

const created = {
  type: "user.created",
  object: "event",
  data: {
    id: "user_hook",
    first_name: "Sanskar",
    last_name: null,
    username: null,
    image_url: "",
    primary_email_address_id: "idn_1",
    email_addresses: [{ id: "idn_1", email_address: "hook@example.com" }],
  },
};

describe("POST /api/webhooks/clerk", () => {
  beforeEach(() => {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  });

  it("creates the user from a correctly signed event", async () => {
    const res = await POST(signedRequest(created));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: "processed" });
    expect(await getUserById("user_hook")).toMatchObject({ email: "hook@example.com", name: "Sanskar" });
  });

  it("processes a redelivered event only once", async () => {
    const first = await POST(signedRequest(created, { id: "msg_same" }));
    const again = await POST(signedRequest(created, { id: "msg_same" }));
    expect(await first.json()).toMatchObject({ result: "processed" });
    expect(await again.json()).toMatchObject({ result: "duplicate" });
  });

  it("rejects a tampered body, a wrong secret and missing headers", async () => {
    expect((await POST(signedRequest(created, { tamper: true }))).status).toBe(400);
    expect(
      (await POST(signedRequest(created, { secret: `whsec_${randomBytes(24).toString("base64")}` }))).status,
    ).toBe(400);
    const bare = new NextRequest("http://localhost/api/webhooks/clerk", {
      method: "POST",
      body: JSON.stringify(created),
    });
    expect((await POST(bare)).status).toBe(400);
    expect(await getUserById("user_hook")).toBeNull();
  });

  it("soft-deletes on user.deleted", async () => {
    await POST(signedRequest(created));
    const res = await POST(
      signedRequest({ type: "user.deleted", object: "event", data: { id: "user_hook", object: "user", deleted: true } }),
    );
    expect(res.status).toBe(200);
    expect(await getUserById("user_hook")).toMatchObject({ email: null, name: null });
    expect((await getUserById("user_hook"))?.deletedAt).toBeInstanceOf(Date);
  });

  it("ignores event types it does not handle", async () => {
    const res = await POST(signedRequest({ type: "session.created", object: "event", data: { id: "sess_1" } }));
    expect(await res.json()).toMatchObject({ result: "ignored" });
  });

  it("returns 503 when the signing secret is not configured", async () => {
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    expect((await POST(signedRequest(created))).status).toBe(503);
  });
});
