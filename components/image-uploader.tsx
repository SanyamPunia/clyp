"use client";

import type React from "react";

import { useCallback, useRef } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ImageUploaderProps {
  onImageUpload: (imageData: string) => void;
}

export function ImageUploader({ onImageUpload }: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        onImageUpload(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    },
    [onImageUpload]
  );

  const handleButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      <Button variant="outline" onClick={handleButtonClick} className="text-xs">
        <Upload className="h-3 w-3 mr-1" />
        Upload Screenshot
      </Button>
    </div>
  );
}
