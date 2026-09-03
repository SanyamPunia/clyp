import type React from "react";
import { LockIcon } from "lucide-react";

import type { WindowChrome } from "@/lib/style-options";
import { cn } from "@/lib/utils";

// The bar belongs to the exported artwork, not the app chrome, so every colour
// here is fixed and none of it follows the app theme. The exported PNG has no
// theme to follow.
const LIGHTS = ["#FF605C", "#FFBD44", "#00CA4E"];

interface WindowNavbarProps {
  variant: Exclude<WindowChrome, "none">;
  dark?: boolean;
  /** Browser only. What the address field reads. */
  url?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function WindowNavbar({
  variant,
  dark = false,
  url = "",
  className,
  style,
}: WindowNavbarProps) {
  const tone = dark ? "bg-black/55" : "bg-white/85";
  const lights = (
    <div className="flex items-center gap-1.5">
      {LIGHTS.map((color) => (
        <span
          key={color}
          className="size-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );

  if (variant === "mac") {
    return (
      <div
        className={cn(
          "flex items-center px-3.5 py-2.5 transition-colors duration-200",
          tone,
          className,
        )}
        style={style}
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
        "grid grid-cols-[1fr_minmax(0,2fr)_1fr] items-center gap-3 px-3.5 py-2 transition-colors duration-200",
        tone,
        className,
      )}
      style={style}
    >
      {lights}
      <div
        className={cn(
          "mx-auto flex h-6 w-full max-w-md min-w-0 items-center justify-center gap-1.5 rounded-md px-3 text-xs",
          dark ? "bg-white/10" : "bg-black/6",
        )}
        style={{ color: dark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.6)" }}
      >
        {url && <LockIcon className="size-3 shrink-0" aria-hidden="true" />}
        <span className="truncate">{url}</span>
      </div>
    </div>
  );
}
