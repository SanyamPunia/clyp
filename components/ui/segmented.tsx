"use client";

import type React from "react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

/**
 * Segmented control. A recessed track holding options, with the selected one
 * lifted onto its own surface. Used for every "pick one of a few" control, so
 * the radius chips and the export scale tiles cannot drift apart.
 *
 * The radio itself is visually hidden but still absolutely positioned, so the
 * option must stay `relative` to keep it inside the panel's clipping chain.
 */
export function SegmentedGroup({
  value,
  onValueChange,
  className,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={onValueChange}
      className={cn("grid gap-1 rounded-lg bg-track p-1", className)}
    >
      {children}
    </RadioGroup>
  );
}

export function SegmentedOption({
  id,
  value,
  selected,
  disabled = false,
  className,
  children,
}: {
  id: string;
  value: string;
  selected: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "relative flex select-none items-center justify-center rounded-md text-[13px]",
        "transition-all duration-150",
        disabled
          ? "cursor-not-allowed text-muted-foreground opacity-50"
          : "cursor-pointer active:scale-[0.97]",
        selected && "bg-track-active text-foreground shadow-sm",
        !selected && !disabled && "text-muted-foreground hover:text-foreground",
        className
      )}
    >
      <RadioGroupItem
        value={value}
        id={id}
        disabled={disabled}
        className="sr-only"
      />
      {children}
    </label>
  );
}
