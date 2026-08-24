"use client";

import type React from "react";
import { useRef } from "react";
import { CommandIcon, ImageIcon, UploadIcon } from "lucide-react";

import { readImageFile } from "@/components/drop-zone";
import { Button } from "@/components/ui/button";

interface UploadCardProps {
  onImageUpload: (dataUrl: string) => void;
}

/**
 * Empty-state card. It sits inside the gradient frame so the background,
 * padding, and corner settings preview live before any image exists.
 */
export function UploadCard({ onImageUpload }: UploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readImageFile(file, onImageUpload);
    e.target.value = "";
  };

  return (
    <div className="w-full max-w-sm rounded-xl border border-stroke bg-panel p-5 shadow-lg">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      <div className="mb-4 grid size-8 place-items-center rounded-md bg-elevated">
        <ImageIcon
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
      </div>

      <h3 className="text-[15px] font-medium">Add a screenshot</h3>
      <p className="mt-0.5 mb-4 text-[15px] leading-[24px] text-muted-foreground">
        Drag an image onto the canvas, paste one with{" "}
        <kbd className="relative inline-flex items-center gap-0.5 rounded border border-stroke bg-elevated px-1 py-0.5 align-middle">
          <CommandIcon className="size-2.5" aria-hidden="true" />
          <span className="text-xs font-medium">V</span>
          <span className="sr-only">Command V</span>
        </kbd>
        , or pick a file. Styling below previews right away.
      </p>

      <Button
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadIcon className="size-3.5" aria-hidden="true" />
        Choose file
      </Button>
    </div>
  );
}
