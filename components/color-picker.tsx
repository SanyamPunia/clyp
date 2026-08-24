"use client";

import type React from "react";
import { useState } from "react";

import { Input } from "@/components/ui/input";

const HEX = /^#[0-9a-fA-F]{6}$/;

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ color, onChange }: ColorPickerProps) {
  // The text field holds what is being typed, which is not always a color yet.
  // Both writers below keep it in step, so it never needs to sync from a prop.
  const [draft, setDraft] = useState(color);

  const handleSwatch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
    onChange(e.target.value);
  };

  // A half-typed hex is not a valid CSS color and would blank the whole
  // gradient, so the text field only commits once it parses.
  const handleText = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setDraft(next);
    if (HEX.test(next)) onChange(next);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={color}
        onChange={handleSwatch}
        aria-label="Pick a color"
        className="size-9 shrink-0 cursor-pointer rounded-md border border-stroke bg-transparent p-0.5"
      />
      <Input
        type="text"
        value={draft}
        onChange={handleText}
        onBlur={() => setDraft(color)}
        className="text-xs tabular-nums placeholder:text-xs"
        placeholder="#000000"
        spellCheck={false}
      />
    </div>
  );
}
