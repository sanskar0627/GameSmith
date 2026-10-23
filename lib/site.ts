/**
 * Brand and creator details. The single source of truth for attribution
 * and personal links, used by the landing footer, the play page and the
 * account menu. Change a link here and every placement follows.
 */

export type CreatorLink = {
  id: "x" | "github" | "linkedin";
  /** Short visible label. */
  label: string;
  /** Full accessible description, read by screen readers. */
  description: string;
  href: string;
};

export const SITE = {
  name: "GameSmith",
  attribution: "Made by GameSmith · @sanskarshukla",
  creator: {
    name: "Sanskar Shukla",
    /** X handle, used for `twitter:creator` on share cards. */
    xHandle: "@sanskar0627",
  },
  links: [
    {
      id: "x",
      label: "X",
      description: "Sanskar Shukla on X, @sanskar0627",
      href: "https://x.com/sanskar0627",
    },
    {
      id: "github",
      label: "GitHub",
      description: "GameSmith source code on GitHub",
      href: "https://github.com/sanskar0627/GameSmith",
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      description: "Sanskar Shukla on LinkedIn",
      href: "https://www.linkedin.com/in/sanskar2003",
    },
  ] satisfies CreatorLink[],
} as const;
