"use client";

import type React from "react";

import { useState } from "react";
import { Input } from "@/components/ui/input";

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ color, onChange }: ColorPickerProps) {
  const [inputValue, setInputValue] = useState(color);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    onChange(e.target.value);
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        type="color"
        value={color}
        onChange={handleInputChange}
        className="w-8 h-8 p-0 border-0 overflow-hidden"
      />
      <Input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        className="text-xs h-8"
        placeholder="#000000"
      />
    </div>
  );
}
