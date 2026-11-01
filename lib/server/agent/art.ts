import "server-only";

import { generateImage } from "ai";

import { assetImageModel } from "@/lib/ai/providers";
import { ASSET_CUTOUT_MODEL, ASSET_IMAGE_MODEL } from "@/lib/billing/pricing";

/**
 * Game art from Fal (Phase 10). Images are written into the game's
 * `public/assets/` folder, which Vite serves as-is and copies into builds.
 * Sandboxes have no network, so art is made here and handed in as bytes.
 */

export const ART_SHAPES = {
  square: "1024x1024",
  landscape: "1216x832",
  portrait: "832x1216",
} as const;

export type ArtShape = keyof typeof ART_SHAPES;

export type DrawInput = {
  prompt: string;
  shape: ArtShape;
  /** Cut the subject out onto a transparent background (sprites, icons). */
  transparent: boolean;
  abortSignal?: AbortSignal;
};

export type DrawnImage = { data: Uint8Array; mediaType: string };

export type Draw = (input: DrawInput) => Promise<DrawnImage>;

/** Extension for a generated image's media type. */
export function imageExtension(mediaType: string): "png" | "jpg" | "webp" {
  if (mediaType.includes("png")) return "png";
  if (mediaType.includes("webp")) return "webp";
  return "jpg";
}

/** Real Fal calls with one key (the user's or the platform's). */
export function falDraw(apiKey: string): Draw {
  return async ({ prompt, shape, transparent, abortSignal }) => {
    const { image } = await generateImage({
      model: assetImageModel(ASSET_IMAGE_MODEL, apiKey),
      prompt,
      size: ART_SHAPES[shape],
      providerOptions: { fal: { outputFormat: transparent ? "png" : "jpeg", enableSafetyChecker: true } },
      abortSignal,
      maxRetries: 1,
    });
    if (!transparent) return { data: image.uint8Array, mediaType: image.mediaType };
    const { image: cut } = await generateImage({
      model: assetImageModel(ASSET_CUTOUT_MODEL, apiKey),
      prompt: { images: [image.uint8Array] },
      abortSignal,
      maxRetries: 1,
    });
    return { data: cut.uint8Array, mediaType: cut.mediaType || "image/png" };
  };
}
