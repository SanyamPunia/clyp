import type React from "react";

import { cn } from "@/lib/utils";

// The traffic lights belong to the exported artwork, not the app chrome, so
// they stay fixed and do not follow the app theme.
const LIGHTS = ["#FF605C", "#FFBD44", "#00CA4E"];

interface WindowNavbarProps {
  dark?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function WindowNavbar({ dark = false, className, style }: WindowNavbarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-3.5 py-2.5 transition-colors duration-200",
        dark ? "bg-black/55" : "bg-white/85",
        className
      )}
      style={style}
    >
      {LIGHTS.map((color) => (
        <span
          key={color}
          className="size-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}
