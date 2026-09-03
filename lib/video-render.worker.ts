/**
 * The worker the encode runs in. One request per worker: the main thread
 * spawns it, posts a `RenderMessage`, and terminates it when the reply lands
 * or the export is cancelled. Termination is also the cancel, which is why
 * the loop itself carries no abort signal.
 */

import {
  type RenderMessage,
  type RenderReply,
  renderVideo,
} from "@/lib/video-render";

// The dom lib types `self` as a window, whose `postMessage` takes an origin.
// This is the worker's own shape, and all of it this file uses.
const scope = self as unknown as {
  postMessage(message: RenderReply, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<RenderMessage>) => void) | null;
};

scope.onmessage = async (event) => {
  try {
    const buffer = await renderVideo({
      ...event.data,
      onProgress: (fraction) => scope.postMessage({ type: "progress", fraction }),
    });
    scope.postMessage({ type: "done", buffer }, [buffer]);
  } catch (error) {
    scope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Export failed",
    });
  }
};
