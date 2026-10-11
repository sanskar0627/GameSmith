import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MadeBy } from "@/components/brand/made-by";
import { SITE } from "@/lib/site";

describe("creator links (lib/site.ts)", () => {
  it("uses the exact attribution text", () => {
    expect(SITE.attribution).toBe("Made by GameSmith · @sanskarshukla");
  });

  it("points at the right profiles", () => {
    const byId = Object.fromEntries(SITE.links.map((l) => [l.id, l.href]));
    expect(byId).toEqual({
      x: "https://x.com/sanskar0627",
      github: "https://github.com/sanskar0627/GameSmith",
      linkedin: "https://www.linkedin.com/in/sanskar2003",
    });
  });

  it("only uses https links on the expected hosts", () => {
    const hosts = { x: "x.com", github: "github.com", linkedin: "www.linkedin.com" };
    for (const link of SITE.links) {
      const url = new URL(link.href);
      expect(url.protocol).toBe("https:");
      expect(url.host).toBe(hosts[link.id]);
    }
  });
});

describe("<MadeBy />", () => {
  const html = renderToStaticMarkup(<MadeBy />);

  it("renders the attribution", () => {
    expect(html).toContain("Made by GameSmith · @sanskarshukla");
  });

  it("renders every link as a safe new-tab link with an accessible description", () => {
    for (const link of SITE.links) {
      const anchor = html.match(new RegExp(`<a[^>]*href="${link.href.replace(/[.]/g, "\\.")}"[^>]*>(.*?)</a>`));
      expect(anchor, link.id).not.toBeNull();
      const tag = anchor![0];
      expect(tag).toContain('target="_blank"');
      expect(tag).toContain('rel="noopener noreferrer"');
      expect(tag).toContain(link.label);
      expect(tag).toContain("(opens in a new tab)");
    }
  });

  it("wraps the links in a labelled nav landmark", () => {
    expect(html).toContain('<nav aria-label="Creator links"');
  });
});
