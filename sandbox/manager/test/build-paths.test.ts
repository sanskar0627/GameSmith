import { describe, expect, it } from "vitest";

import { isBuildPath } from "../src/manager.js";

describe("build output paths", () => {
  it("accepts normal build files", () => {
    for (const p of ["index.html", "assets/index-Ab12_c.js", "assets/sky.jpg", "fonts/a@2x.woff2"]) expect(isBuildPath(p)).toBe(true);
  });
  it("rejects anything that could escape or confuse the store", () => {
    for (const p of ["", "/etc/passwd", "../x", "a/../b", "a//b", "a\\\\b", "a b.js", "a\\0b", "./index.html"]) {
      expect(isBuildPath(p)).toBe(false);
    }
  });
});
