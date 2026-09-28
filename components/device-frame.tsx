import type React from "react";

import type { Device } from "@/lib/style-options";
import { cn } from "@/lib/utils";

/*
 * The device belongs to the exported artwork, not the app chrome, so its
 * colours are fixed and none of them follow the app theme, the same exception
 * the title bar's lights are.
 *
 * Every measure is a fraction of the media's width, for the reason the title
 * bar is: the frame is laid out in the picture's own pixels, so a bezel in
 * fixed CSS pixels would be a hairline round a 2560px capture.
 *
 * There is no notch or island. Anything drawn over the screen is covered in a
 * video export, which draws the decoded frames over the whole screen box, so a
 * clip and a still would disagree about the phone.
 */
const PHONE_BODY = "#0b0b0c";
const PHONE_RIM = "#2c2c2e";
const LID = "#0d0d0f";
const CAMERA = "#26262a";
const BASE = "linear-gradient(#dcdce1, #a3a3ac)";
const BASE_NOTCH = "#8b8b94";

/** The screen's own corner radius in media pixels, or null for no device. */
export function deviceScreenRadius(device: Device, width: number): number | null {
  if (device === "phone") return Math.round(width * 0.11);
  if (device === "laptop") return 0;
  return null;
}

export function DeviceFrame({
  device,
  width,
  shadow,
  children,
}: {
  device: Exclude<Device, "none">;
  /** The media's own width in px, which every size here scales from. */
  width: number;
  /** The frame's shadow class, which moves from the media to the device. */
  shadow: string;
  children: React.ReactNode;
}) {
  if (device === "phone") {
    const bezel = Math.max(8, Math.round(width * 0.035));
    const rim = Math.max(1, Math.round(width * 0.004));
    const radius = (deviceScreenRadius("phone", width) ?? 0) + bezel;

    return (
      <div
        className={cn(shadow, "artwork-ease relative transition-[box-shadow]")}
        style={{
          padding: bezel,
          borderRadius: radius,
          background: PHONE_BODY,
          border: `${rim}px solid ${PHONE_RIM}`,
        }}
      >
        {children}
      </div>
    );
  }

  const side = Math.max(6, Math.round(width * 0.02));
  const top = Math.max(10, Math.round(width * 0.035));
  const bottom = Math.max(8, Math.round(width * 0.03));
  const lid = Math.max(6, Math.round(width * 0.025));
  const camera = Math.max(3, Math.round(width * 0.006));
  const screen = width + side * 2;
  const baseHeight = Math.max(8, Math.round(width * 0.03));

  // The base is wider than the lid, as a laptop's deck is. It is given an
  // explicit width rather than negative margins, so the artwork measures it
  // and a target shape leaves room for it.
  return (
    <div className="flex w-max flex-col items-center">
      <div
        className={cn(shadow, "artwork-ease relative transition-[box-shadow]")}
        style={{
          padding: `${top}px ${side}px ${bottom}px`,
          borderRadius: `${lid}px ${lid}px 0 0`,
          background: LID,
        }}
      >
        <span
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ top: top / 2, width: camera, height: camera, background: CAMERA }}
        />
        {children}
      </div>
      <div
        aria-hidden="true"
        className="relative"
        style={{
          width: Math.round(screen * 1.14),
          height: baseHeight,
          background: BASE,
          borderRadius: `0 0 ${baseHeight}px ${baseHeight}px`,
        }}
      >
        <span
          className="absolute top-0 left-1/2 -translate-x-1/2"
          style={{
            width: Math.round(screen * 0.14),
            height: Math.round(baseHeight * 0.4),
            background: BASE_NOTCH,
            borderRadius: `0 0 ${baseHeight}px ${baseHeight}px`,
          }}
        />
      </div>
    </div>
  );
}
