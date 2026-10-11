import { afterEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    userId: clerk.userId,
    orgId: null,
    redirectToSignIn: () => {
      throw new Error("REDIRECT_TO_SIGN_IN");
    },
  }),
  currentUser: async () => null,
}));
const polarCalls = vi.hoisted(() => ({ checkout: [] as unknown[], portal: [] as unknown[], options: [] as unknown[] }));
vi.mock("@polar-sh/sdk/2026-10", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createPolar: (options: unknown) => {
    polarCalls.options.push(options);
    return {
      checkouts: {
        create: async (body: unknown) => {
          polarCalls.checkout.push(body);
          return { url: "https://sandbox.polar.sh/checkout/abc" };
        },
      },
      customerSessions: {
        create: async (body: unknown) => {
          polarCalls.portal.push(body);
          return { customer_portal_url: "https://sandbox.polar.sh/portal/xyz" };
        },
      },
    };
  },
}));

import { createUser } from "./support/factories";

async function load() {
  vi.resetModules();
  return import("@/lib/server/billing/actions");
}

afterEach(() => {
  vi.unstubAllEnvs();
  polarCalls.checkout.length = 0;
  polarCalls.portal.length = 0;
});

describe("billing actions", () => {
  it("say payments aren't set up when Polar has no token", async () => {
    await createUser("user_a");
    clerk.userId = "user_a";
    const actions = await load();
    expect(await actions.startCheckoutAction("forge")).toEqual({
      ok: false,
      error: "Payments aren't set up on this server yet.",
    });
  });

  it("open a checkout tied to the signed-in user", async () => {
    vi.stubEnv("POLAR_ACCESS_TOKEN", "polar_oat_test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://gamesmith.example");
    await createUser("user_a", { email: "a@example.com" });
    clerk.userId = "user_a";
    const actions = await load();
    expect(await actions.startCheckoutAction("pack_25k")).toEqual({ ok: true, url: "https://sandbox.polar.sh/checkout/abc" });
    expect(polarCalls.checkout[0]).toEqual({
      products: ["prod_pack_25k"],
      external_customer_id: "user_a",
      customer_email: "a@example.com",
      metadata: { offer: "pack_25k" },
      success_url: "https://gamesmith.example/settings/billing?checkout=success",
      return_url: "https://gamesmith.example/settings/billing",
    });
    expect(polarCalls.options.at(-1)).toMatchObject({ environment: "sandbox" });
  });

  it("reject unknown offers and signed-out callers", async () => {
    vi.stubEnv("POLAR_ACCESS_TOKEN", "polar_oat_test");
    await createUser("user_a");
    clerk.userId = "user_a";
    const actions = await load();
    expect(await actions.startCheckoutAction("free")).toMatchObject({ ok: false, error: "Unknown offer" });
    clerk.userId = null;
    await expect(actions.startCheckoutAction("forge")).rejects.toThrow("REDIRECT_TO_SIGN_IN");
    expect(polarCalls.checkout).toHaveLength(0);
  });

  it("open the billing portal for the signed-in user only", async () => {
    vi.stubEnv("POLAR_ACCESS_TOKEN", "polar_oat_test");
    await createUser("user_b");
    clerk.userId = "user_b";
    const actions = await load();
    expect(await actions.openBillingPortalAction()).toEqual({ ok: true, url: "https://sandbox.polar.sh/portal/xyz" });
    expect(polarCalls.portal[0]).toMatchObject({ external_customer_id: "user_b" });
  });
});
