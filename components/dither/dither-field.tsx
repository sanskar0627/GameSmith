"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ditherIndex, resolveColor, type RGBA } from "./engine";
import { SCENES, type SceneName } from "./scenes";

/**
 * <DitherField> renders a procedural scene through an ordered (Bayer) dither
 * using colors from the current theme. It is GameSmith's illustration engine:
 * atmosphere for auth and empty states, and live "forging" visuals while the
 * agent builds a game. No images, no dependencies, crisp at any size.
 *
 * The field fills its parent (position it like any block element).
 */
export type DitherFieldProps = {
  scene?: SceneName;
  /**
   * Colors from dark tone (0) to light tone (1). CSS colors or custom property
   * names (e.g. "--ember"). "transparent" is allowed for overlays.
   */
  palette?: string[];
  /** Size of one dither pixel in CSS px. */
  pixel?: number;
  animated?: boolean;
  /** Frame rate when animated. Low on purpose: steps, not smoothness. */
  fps?: number;
  seed?: number;
  /** Tone shaping: contrast around 0.5 and a bias added after. */
  contrast?: number;
  bias?: number;
  className?: string;
  /** Accessible label. Omit for decorative fields (the default). */
  label?: string;
};

export function DitherField({
  scene = "horizon",
  palette = ["--dither-ink", "--ember", "--dither-paper"],
  pixel = 3,
  animated = false,
  fps = 10,
  seed = 7,
  contrast = 1,
  bias = 0,
  className,
  label,
}: DitherFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paletteKey = palette.join("|");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const sceneFn = SCENES[scene];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shouldAnimate = animated && !reduceMotion;

    let colors: RGBA[] = [];
    let w = 0;
    let h = 0;
    let image: ImageData | null = null;
    let raf = 0;
    let visible = true;
    let last = 0;
    const start = performance.now();

    const readPalette = () => {
      colors = paletteKey.split("|").map((c) => resolveColor(c, canvas));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const nw = Math.max(1, Math.ceil(rect.width / pixel));
      const nh = Math.max(1, Math.ceil(rect.height / pixel));
      if (nw === w && nh === h) return;
      w = nw;
      h = nh;
      canvas.width = w;
      canvas.height = h;
      image = ctx.createImageData(w, h);
    };

    const draw = (t: number) => {
      if (!image || colors.length === 0) return;
      const data = image.data;
      const levels = colors.length;
      const opts = { seed, aspect: w / h };
      for (let y = 0; y < h; y++) {
        const v = (y + 0.5) / h;
        for (let x = 0; x < w; x++) {
          const u = (x + 0.5) / w;
          let tone = sceneFn(u, v, t, opts);
          tone = (tone - 0.5) * contrast + 0.5 + bias;
          const c = colors[ditherIndex(tone, x, y, levels)];
          const i = (y * w + x) * 4;
          data[i] = c[0];
          data[i + 1] = c[1];
          data[i + 2] = c[2];
          data[i + 3] = c[3];
        }
      }
      ctx.putImageData(image, 0, 0);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || now - last < 1000 / fps) return;
      last = now;
      draw((now - start) / 1000);
    };

    readPalette();
    resize();
    draw(0);
    if (shouldAnimate) raf = requestAnimationFrame(frame);

    const ro = new ResizeObserver(() => {
      resize();
      draw((performance.now() - start) / 1000);
    });
    ro.observe(canvas);

    // Re-resolve colors when the theme changes (class or style on <html>).
    const mo = new MutationObserver(() => {
      readPalette();
      draw((performance.now() - start) / 1000);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      io.disconnect();
    };
  }, [scene, paletteKey, pixel, animated, fps, seed, contrast, bias]);

  return (
    <canvas
      ref={canvasRef}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("block size-full pixelated", className)}
    />
  );
}
