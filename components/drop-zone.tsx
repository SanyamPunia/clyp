"use client";

import type React from "react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { type LoadedMedia, kindOf, loadMedia } from "@/lib/media";
import { cn } from "@/lib/utils";

/**
 * Reads a dropped file and hands the caller the loaded media, or toasts why it
 * cannot. The validation and probing live in `lib/media.ts`, since a drop zone
 * has no business knowing which codecs a browser can decode.
 */
export function readMediaFile(
  file: File,
  onLoad: (loaded: LoadedMedia) => void,
): void {
  loadMedia(file)
    .then(onLoad)
    .catch((error: Error) => toast.error(error.message));
}

interface DropZoneProps {
  onFile: (loaded: LoadedMedia) => void;
  /** A sound file is a soundtrack for what is already here, not a replacement. */
  onAudio?: (file: File) => void;
  className?: string;
  children: React.ReactNode;
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * Wraps the whole canvas so a drag anywhere over the stage counts, not only a
 * drag onto the small card in the middle of it.
 */
export function DropZone({
  onFile,
  onAudio,
  className,
  children,
  ref,
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  // Drag enter and leave fire for every child, so a depth counter is what
  // tells a real leave apart from crossing into a nested element.
  const depth = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    depth.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    depth.current -= 1;
    if (depth.current <= 0) {
      depth.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setIsDragging(false);

      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      // Routed on the file rather than on what the canvas holds, so dropping a
      // track never clears the clip it was meant to go with.
      if (kindOf(file.type) === "audio") onAudio?.(file);
      else readMediaFile(file, onFile);
    },
    [onAudio, onFile]
  );

  return (
    <div
      ref={ref}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-dragging={isDragging || undefined}
      className={cn(
        "transition-colors duration-200",
        isDragging && "border-selected bg-accent",
        className
      )}
    >
      {children}
    </div>
  );
}
