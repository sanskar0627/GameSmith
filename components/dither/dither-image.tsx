"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ditherIndex, resolveColor } from "./engine";

/**
 * <DitherImage> converts a same-origin image into a duotone (or N-tone)
 * ordered dither using theme colors. Used for game thumbnails so every
 * generated game shares one visual language in grids and lists.
 * Set `reveal` to fade to the original image on hover (parent needs `group`).
 */
type DitherImageProps = {
  src: string;
  alt: string;
  palette?: string[];
  pixel?: number;
  contrast?: number;
  bias?: number;
  reveal?: boolean;
  className?: string;
};

export function DitherImage({
  src,
  alt,
  palette = ["--dither-ink", "--ember", "--dither-paper"],
  pixel = 2,
  contrast = 1.15,
  bias = 0,
  reveal = false,
  className,
}: DitherImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paletteKey = palette.join("|");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";

    const render = () => {
      if (cancelled || !img.naturalWidth) return;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.ceil(rect.width / pixel));
      const h = Math.max(1, Math.ceil(rect.height / pixel));
      canvas.width = w;
      canvas.height = h;
      // object-fit: cover
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      const frame = ctx.getImageData(0, 0, w, h);
      const d = frame.data;
      const colors = paletteKey.split("|").map((c) => resolveColor(c, canvas));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
          const tone = (lum - 0.5) * contrast + 0.5 + bias;
          const c = colors[ditherIndex(tone, x, y, colors.length)];
          d[i] = c[0];
          d[i + 1] = c[1];
          d[i + 2] = c[2];
          d[i + 3] = c[3];
        }
      }
      ctx.putImageData(frame, 0, 0);
    };

    img.onload = render;
    img.src = src;
    const ro = new ResizeObserver(render);
    ro.observe(canvas);
    const mo = new MutationObserver(render);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    return () => {
      cancelled = true;
      ro.disconnect();
      mo.disconnect();
    };
  }, [src, paletteKey, pixel, contrast, bias]);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full pixelated" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={cn(
          "absolute inset-0 size-full object-cover",
          reveal
            ? "opacity-0 transition-opacity duration-300 ease-forge group-hover:opacity-100 group-focus-visible:opacity-100"
            : "sr-only",
        )}
      />
    </div>
  );
}
