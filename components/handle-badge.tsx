import type { BadgePosition } from "@/lib/style-options";

/**
 * A handle in a corner of the frame, such as `@clyp`, so a post that gets
 * reshared still says whose it is.
 *
 * It sits in the padded box the artwork centres in, positioned against the
 * frame's edge rather than the picture's, so it lands in the padding and a
 * target shape moves it with the frame. It renders inside the export ref and
 * both exports bake it through the same raster as the caption.
 *
 * It carries its own colours for the caption's reason: it sits over an
 * arbitrary gradient and the exported PNG has no theme. A translucent pill
 * keeps it readable over any of them.
 */
export function HandleBadge({
  text,
  size,
  dark,
  position,
}: {
  text: string;
  size: number;
  dark: boolean;
  position: BadgePosition;
}) {
  const inset = Math.max(12, Math.round(size * 0.9));
  const [vertical, horizontal] = position.split("-") as [
    "top" | "bottom",
    "left" | "right",
  ];

  return (
    <span
      className="artwork-ease pointer-events-none absolute z-10 rounded-full font-medium leading-none whitespace-nowrap transition-[font-size,padding,color,background-color]"
      style={{
        [vertical]: inset,
        [horizontal]: inset,
        fontSize: size,
        padding: `${Math.round(size * 0.45)}px ${Math.round(size * 0.75)}px`,
        color: dark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.95)",
        backgroundColor: dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.35)",
      }}
    >
      {text}
    </span>
  );
}
