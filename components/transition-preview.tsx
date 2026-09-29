import type React from "react";

import type { TransitionKind } from "@/lib/clip-transitions";
import { cn } from "@/lib/utils";

/**
 * A few words on what each transition does, beside its moving picture. Kept
 * to the tooltip's length, since the picture says the rest.
 */
const DESCRIPTIONS: Record<TransitionKind | "none", string> = {
  none: "Jumps straight from one part to the next",
  dissolve: "The last frame fades into the next part",
  black: "Fades to black at the join, then back",
  white: "Fades to white at the join, then back",
  blur: "Blurs out of one part and into the next",
  zoom: "Pushes in at the join, then settles",
};

/** A stand-in clip: a flat colour with one shape, so the two read apart. */
function Clip({
  tone,
  className,
  style,
}: {
  tone: "a" | "b";
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0",
        tone === "a" ? "bg-clip-a" : "bg-clip-b",
        className,
      )}
      style={style}
    >
      {tone === "a" ? (
        <span className="absolute top-3 left-4 size-4 rounded-full bg-clip-light/85" />
      ) : (
        <span className="absolute right-4 bottom-3 size-4 rounded-sm bg-clip-light/85" />
      )}
      <span className="absolute inset-x-4 bottom-2 h-1 rounded-full bg-clip-light/40" />
    </div>
  );
}

/**
 * A looping picture of a transition, for the picker's tooltip. The first clip
 * plays into the second and back, through the transition, so it can be judged
 * before it is picked. Its motion is CSS keyframes in `globals.css`, off under
 * reduced motion, where it holds on the first clip and the line says the rest.
 */
export function TransitionPreview({ kind }: { kind: TransitionKind | "none" }) {
  // The second clip arrives on a step at the join for every kind but a
  // dissolve, which fades it in instead.
  const arrive = kind === "dissolve" ? "tp-dissolve" : "tp-cut";

  return (
    <div className="flex w-36 flex-col gap-1.5 py-1">
      <div
        aria-hidden="true"
        className="relative h-20 overflow-hidden rounded-md bg-clip-a"
      >
        <div
          className={cn("absolute inset-0", kind === "zoom" && "tp-run")}
          style={kind === "zoom" ? { animationName: "tp-zoom" } : undefined}
        >
          <Clip
            tone="a"
            className={kind === "blur" ? "tp-run" : undefined}
            style={kind === "blur" ? { animationName: "tp-blur-out" } : undefined}
          />
          <Clip
            tone="b"
            className="tp-run"
            style={{
              opacity: 0,
              animationName: kind === "blur" ? `${arrive}, tp-blur-in` : arrive,
            }}
          />
        </div>
        {(kind === "black" || kind === "white") && (
          <div
            className={cn(
              "tp-run absolute inset-0",
              kind === "black" ? "bg-clip-dark" : "bg-clip-light",
            )}
            style={{ opacity: 0, animationName: "tp-dip" }}
          />
        )}
      </div>
      <p className="text-xs leading-snug font-medium text-balance">
        {DESCRIPTIONS[kind]}
      </p>
    </div>
  );
}
