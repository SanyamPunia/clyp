import type React from "react";

import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A width-by-height readout. The separator is the X icon rather than a letter
 * or a multiplication character, so every place that prints dimensions matches.
 */
export function Dimensions({
  width,
  height,
  className,
  style,
}: {
  width: number;
  height: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={cn("flex items-center gap-1 tabular-nums", className)}
      style={style}
      aria-label={`${width} by ${height} pixels`}
    >
      {width}
      <XIcon className="size-2.5 shrink-0" aria-hidden="true" />
      {height}
    </span>
  );
}
