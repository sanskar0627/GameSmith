import type { UserJSON } from "@clerk/nextjs/server";
import { describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  userId: null as string | null,
  currentUser: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    userId: clerk.userId,
    orgId: null,
    redirectToSignIn: () => {
      throw new Error("REDIRECT_TO_SIGN_IN");
    },
  }),
  currentUser: clerk.currentUser,
}));

import {
  ensureUser,
  getUserById,
  profileFromUserJSON,
  softDeleteUser,
  upsertUser,
} from "@/lib/server/users";

import { createUser } from "./support/factories";

function userJSON(overrides: Partial<UserJSON> = {}): UserJSON {
  return {
    id: "user_1",
    first_name: "Sanskar",
    last_name: "Shukla",
    username: null,
    image_url: "https://img.clerk.com/a.png",
    primary_email_address_id: "idn_2",
    email_addresses: [
      { id: "idn_1", email_address: "old@example.com" },
      { id: "idn_2", email_address: "primary@example.com" },
    ],
    ...overrides,
  } as unknown as UserJSON;
}

describe("profileFromUserJSON", () => {
  it("uses the primary email and joins the name", () => {
    expect(profileFromUserJSON(userJSON())).toEqual({
      id: "user_1",
      email: "primary@example.com",
      name: "Sanskar Shukla",
      imageUrl: "https://img.clerk.com/a.png",
    });
  });

  it("falls back to username, and to null when nothing is set", () => {
    const p = profileFromUserJSON(
      userJSON({ first_name: null, last_name: null, username: "forge", email_addresses: [], image_url: "" }),
    );
    expect(p).toMatchObject({ name: "forge", email: null, imageUrl: null });
  });
});

describe("upsertUser / softDeleteUser", () => {
  it("creates then updates the same row", async () => {
    await upsertUser({ id: "user_1", email: "a@example.com", name: "A", imageUrl: null });
    await upsertUser({ id: "user_1", email: "b@example.com", name: "B", imageUrl: null });
    expect(await getUserById("user_1")).toMatchObject({ email: "b@example.com", name: "B", plan: "free" });
  });

  it("clears personal fields on delete and never revives the user", async () => {
    await upsertUser({ id: "user_1", email: "a@example.com", name: "A", imageUrl: "x" });
    await softDeleteUser("user_1");
    // A late `user.updated` delivered after `user.deleted`:
    await upsertUser({ id: "user_1", email: "late@example.com", name: "Late", imageUrl: "y" });
    const row = await getUserById("user_1");
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(row).toMatchObject({ email: null, name: null, imageUrl: null });
  });
});

describe("ensureUser", () => {
  it("redirects signed-out visitors", async () => {
    clerk.userId = null;
    await expect(ensureUser()).rejects.toThrow("REDIRECT_TO_SIGN_IN");
  });

  it("returns the existing row without calling Clerk", async () => {
    await createUser("user_1");
    clerk.userId = "user_1";
    clerk.currentUser.mockReset();
    const row = await ensureUser();
    expect(row.id).toBe("user_1");
    expect(clerk.currentUser).not.toHaveBeenCalled();
  });

  it("creates the row from Clerk on first visit", async () => {
    clerk.userId = "user_new";
    clerk.currentUser.mockResolvedValue({
      id: "user_new",
      firstName: "New",
      lastName: null,
      username: null,
      imageUrl: "https://img.clerk.com/n.png",
      primaryEmailAddress: { emailAddress: "new@example.com" },
      emailAddresses: [{ emailAddress: "new@example.com" }],
    });
    const row = await ensureUser();
    expect(row).toMatchObject({ id: "user_new", email: "new@example.com", name: "New" });
  });
});
