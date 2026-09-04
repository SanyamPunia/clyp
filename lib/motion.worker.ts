/**
 * The worker the motion pass runs in. One request per worker: the main thread
 * spawns it, posts a `MotionRequest`, and terminates it when the reply lands
 * or the clip goes away. Termination is the cancel.
 */

import { type MotionReply, type MotionRequest, analyzeMotion } from "@/lib/motion";

const scope = self as unknown as {
  postMessage(message: MotionReply, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<MotionRequest>) => void) | null;
};

scope.onmessage = async (event) => {
  try {
    const { samples, clicks } = await analyzeMotion(event.data, (fraction) =>
      scope.postMessage({ type: "progress", fraction }),
    );
    scope.postMessage({ type: "done", samples, clicks }, [
      samples.buffer,
      clicks.buffer,
    ]);
  } catch (error) {
    scope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "The motion could not be read",
    });
  }
};
