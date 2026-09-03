/**
 * The worker the motion pass runs in. One request per worker: the main thread
 * spawns it, posts a `MotionRequest`, and terminates it when the reply lands.
 */

import { type MotionReply, type MotionRequest, analyzeMotion } from "@/lib/motion";

const scope = self as unknown as {
  postMessage(message: MotionReply, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<MotionRequest>) => void) | null;
};

scope.onmessage = async (event) => {
  try {
    const samples = await analyzeMotion(event.data);
    scope.postMessage({ type: "done", samples }, [samples.buffer]);
  } catch (error) {
    scope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "The motion could not be read",
    });
  }
};
