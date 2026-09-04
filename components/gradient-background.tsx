import type React from "react";

import { NOISE_TILE_SIZE, NOISE_TILE_URL } from "@/lib/noise";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD - gradient swap
 *
 *    0ms   user picks a new preset
 *          outgoing layer stays painted underneath
 *          incoming layer mounts at opacity 0 on top
 *  400ms   incoming layer reaches full opacity
 * ─────────────────────────────────────────────────────────
 * Background-image is not an animatable CSS property, so a cross-fade needs
 * two stacked layers rather than a transition on a single element.
 *
 * Which gradient was showing before is remembered by the parent, in the event
 * handler that changed it. That keeps this component free of state and of any
 * effect that would have to watch a prop.
 * ───────────────────────────────────────────────────────── */

const CROSS_FADE_MS = 400;

/** Layer opacity at intensity 100. Past this the grain buries the artwork. */
const MAX_NOISE_OPACITY = 0.55;

interface GradientBackgroundProps {
  /** Full CSS background-image value, from `resolveGradientCss`. */
  css: string;
  /** What was painted before `css`, held during the fade. */
  previousCss: string;
  showNoiseOverlay?: boolean;
  /** Grain strength, 0 to 100. */
  noiseIntensity?: number;
  children: React.ReactNode;
}

export function GradientBackground({
  css,
  previousCss,
  showNoiseOverlay = false,
  noiseIntensity = 55,
  children,
}: GradientBackgroundProps) {
  const grain = showNoiseOverlay
    ? (noiseIntensity / 100) * MAX_NOISE_OPACITY
    : 0;

  /**
   * A transparent background is the one incoming layer that is not opaque.
   *
   * The cross-fade works by leaving the outgoing gradient painted underneath,
   * which is safe for every other kind because an opaque layer covers it once
   * it settles. Under a transparent one it would show through for good rather
   * than for 400ms, in the canvas and in the export alike, so it is not
   * painted at all. There is nothing to fade into anyway.
   */
  const transparent = css === "none";

  return (
    <div className="relative">
      {/* Outgoing gradient holds the frame while the new one fades in. Every
          generated layer is opaque, so this never shows through once the
          incoming layer settles, including in the export. */}
      {!transparent && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-0"
          style={{ backgroundImage: previousCss }}
        />
      )}

      <div
        aria-hidden="true"
        key={css}
        className="animate-gradient-in absolute inset-0 z-10"
        style={{
          backgroundImage: css,
          animationDuration: `${CROSS_FADE_MS}ms`,
        }}
      />

      {/* Always mounted, at opacity 0 when off, so switching grain on or
          changing its amount eases rather than snaps. At 0 an overlay blend
          is a no-op, in the preview and in the export alike. */}
      <div
        aria-hidden="true"
        className="artwork-ease pointer-events-none absolute inset-0 z-20 mix-blend-overlay transition-opacity"
        style={{
          opacity: grain,
          backgroundImage: `url("${NOISE_TILE_URL}")`,
          backgroundRepeat: "repeat",
          backgroundSize: `${NOISE_TILE_SIZE}px ${NOISE_TILE_SIZE}px`,
        }}
      />

      <div className="relative z-30">{children}</div>
    </div>
  );
}
