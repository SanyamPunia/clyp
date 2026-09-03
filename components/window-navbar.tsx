import type React from "react";
import { LockIcon } from "lucide-react";

import type { WindowChrome } from "@/lib/style-options";
import { cn } from "@/lib/utils";

// The bar belongs to the exported artwork, not the app chrome, so every colour
// here is fixed and none of it follows the app theme. The exported PNG has no
// theme to follow.
const LIGHTS = ["#FF605C", "#FFBD44", "#00CA4E"];

/**
 * The bar is sized from the media, not from the app.
 *
 * The frame is laid out in the picture's own pixels, so a bar in fixed CSS
 * pixels is 40px tall on a 640px clip and on a 2560px Retina capture alike,
 * and on the capture it reads as a hairline with text nobody can make out. A
 * real capture carries its bar at the capture's own density: 28px with 12px
 * lights on a 1x window around 1280px wide, twice that on a 2x one. So every
 * measure below is a 1x macOS metric multiplied by the media's width over
 * 1280. The floor is 1x, because a window's chrome is never drawn smaller than
 * that however narrow the window: a 640px clip gets the same bar a 640px
 * window would have had.
 */
const REFERENCE_WIDTH = 1280;
const MIN_SCALE = 1;
const MAX_SCALE = 4;

/** 1x macOS metrics, in px. */
const LIGHT = 12;
const LIGHT_GAP = 8;
const INSET = 13;
const TITLE_PAD = 8;
const FIELD_PAD = 9;
const FIELD_HEIGHT = 28;
const FIELD_MAX_WIDTH = 460;
const FIELD_INSET = 12;
const FIELD_GAP = 6;
const FIELD_RADIUS = 7;
const FIELD_TEXT = 13;

interface WindowNavbarProps {
  variant: Exclude<WindowChrome, "none">;
  /** The media's own width in px, which every size here scales from. */
  width: number;
  dark?: boolean;
  /** Browser only. What the address field reads. */
  url?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function WindowNavbar({
  variant,
  width,
  dark = false,
  url = "",
  className,
  style,
}: WindowNavbarProps) {
  const s = Math.min(Math.max(width / REFERENCE_WIDTH, MIN_SCALE), MAX_SCALE);
  const tone = dark ? "bg-black/55" : "bg-white/85";
  const lights = (
    <div className="flex items-center" style={{ gap: LIGHT_GAP * s }}>
      {LIGHTS.map((color) => (
        <span
          key={color}
          className="rounded-full"
          style={{ width: LIGHT * s, height: LIGHT * s, backgroundColor: color }}
        />
      ))}
    </div>
  );

  if (variant === "mac") {
    return (
      <div
        className={cn(
          "artwork-ease flex items-center transition-[background-color,border-radius]",
          tone,
          className,
        )}
        style={{ ...style, padding: `${TITLE_PAD * s}px ${INSET * s}px` }}
      >
        {lights}
      </div>
    );
  }

  // Equal side columns, so the address field is centred on the bar rather than
  // on what is left beside the lights. It is capped rather than filling the
  // middle: a field the width of a 1280px window reads as a search box.
  return (
    <div
      className={cn(
        "artwork-ease grid grid-cols-[1fr_minmax(0,2fr)_1fr] items-center transition-[background-color,border-radius]",
        tone,
        className,
      )}
      style={{
        ...style,
        gap: FIELD_INSET * s,
        padding: `${FIELD_PAD * s}px ${INSET * s}px`,
      }}
    >
      {lights}
      <div
        className={cn(
          "artwork-ease mx-auto flex w-full min-w-0 items-center justify-center transition-[background-color,color]",
          dark ? "bg-white/10" : "bg-black/6",
        )}
        style={{
          height: FIELD_HEIGHT * s,
          maxWidth: FIELD_MAX_WIDTH * s,
          paddingInline: FIELD_INSET * s,
          gap: FIELD_GAP * s,
          borderRadius: FIELD_RADIUS * s,
          fontSize: FIELD_TEXT * s,
          color: dark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.6)",
        }}
      >
        {/* Sized inline rather than from the icon scale, because it scales
            with the picture like everything else in the bar. */}
        {url && (
          <LockIcon
            className="shrink-0"
            style={{ width: FIELD_TEXT * s, height: FIELD_TEXT * s }}
            aria-hidden="true"
          />
        )}
        <span className="truncate">{url}</span>
      </div>
    </div>
  );
}
