import Image from "next/image";
import { FrameIcon, GlobeIcon } from "lucide-react";

import type { Platform } from "@/lib/templates";
import { cn } from "@/lib/utils";

/**
 * A platform's own logo, from svgl (svgl.app), checked in under
 * `public/platforms/`.
 *
 * Files rather than inline SVG, because the Instagram, Facebook and TikTok
 * marks carry gradient ids, and the same logo shown in the dropdown and in its
 * trigger at once would put two copies of one id on the page. An image keeps
 * each copy's ids to itself. The X, TikTok and Threads files are svgl's dark
 * variants, since the app is dark only.
 *
 * The web has no logo of its own, so it takes the lucide globe. No template at
 * all takes the frame icon, so every row in the dropdown carries a mark and
 * the labels line up.
 */
export function PlatformIcon({
  platform,
  className,
}: {
  /** Null for no template. */
  platform: Platform | null;
  className?: string;
}) {
  if (platform === null) {
    return (
      <FrameIcon
        className={cn("size-4 shrink-0 text-muted-foreground", className)}
        aria-hidden="true"
      />
    );
  }
  if (platform === "web") {
    return (
      <GlobeIcon
        className={cn("size-4 shrink-0 text-muted-foreground", className)}
        aria-hidden="true"
      />
    );
  }
  return (
    <Image
      src={`/platforms/${platform}.svg`}
      alt=""
      aria-hidden="true"
      width={16}
      height={16}
      draggable={false}
      className={cn("size-4 shrink-0 select-none", className)}
    />
  );
}
