import { useSyncExternalStore } from "react";

import { shaderSupported } from "@/lib/shader";

const noSubscribers = () => () => {};
const notOnServer = () => false;

/**
 * Whether this browser can draw a moving background.
 *
 * Read through `useSyncExternalStore` rather than during render, because the
 * server has no canvas: a render-time read would disagree with the server's
 * HTML and break hydration. The server says no, so a moving preset first
 * renders as its still stand-in and comes alive on hydration.
 */
export function useShaderSupport(): boolean {
  return useSyncExternalStore(noSubscribers, shaderSupported, notOnServer);
}
