/**
 * The main-thread side of the motion pass: one worker per read, terminated
 * when the reply lands.
 *
 * Kept apart from `lib/motion.ts`, which the worker's entry imports. A module
 * that both spawned the worker and was imported by it made a cycle through a
 * worker entry, and the production build did not come back from it.
 */

import type { MotionReply, MotionRequest, MotionTrack } from "@/lib/motion";

export function readMotion(request: MotionRequest): Promise<MotionTrack> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./motion.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<MotionReply>) => {
      worker.terminate();
      if (event.data.type === "done") resolve({ samples: event.data.samples });
      else reject(new Error(event.data.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "The motion could not be read"));
    };
    worker.postMessage(request);
  });
}
