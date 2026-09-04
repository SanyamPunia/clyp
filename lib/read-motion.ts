/**
 * The main-thread side of the motion pass: one worker per read, terminated
 * when the reply lands or the read is cancelled.
 *
 * Kept apart from `lib/motion.ts`, which the worker's entry imports. A module
 * that both spawned the worker and was imported by it made a cycle through a
 * worker entry, and the production build did not come back from it.
 */

import type { MotionReply, MotionRequest, MotionTrack } from "@/lib/motion";

export interface MotionRead {
  track: Promise<MotionTrack>;
  /** Stops the decode at once. The promise then rejects with an AbortError. */
  cancel: () => void;
}

export function readMotion(
  request: MotionRequest,
  onProgress?: (fraction: number) => void,
): MotionRead {
  const worker = new Worker(new URL("./motion.worker.ts", import.meta.url), {
    type: "module",
  });
  let settle: { resolve: (t: MotionTrack) => void; reject: (e: Error) => void };

  const track = new Promise<MotionTrack>((resolve, reject) => {
    settle = { resolve, reject };
    worker.onmessage = (event: MessageEvent<MotionReply>) => {
      const reply = event.data;
      if (reply.type === "progress") {
        onProgress?.(reply.fraction);
        return;
      }
      worker.terminate();
      if (reply.type === "done") resolve({ samples: reply.samples });
      else reject(new Error(reply.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "The motion could not be read"));
    };
    worker.postMessage(request);
  });

  return {
    track,
    cancel: () => {
      worker.terminate();
      settle.reject(new DOMException("Aborted", "AbortError"));
    },
  };
}
