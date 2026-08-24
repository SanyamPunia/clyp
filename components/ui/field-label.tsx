"use client";

import type React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Control-label treatment. Sentence case at 13px in the low-contrast text
 * step. Kept as a plain utility string rather than an `@layer components`
 * class so `cn` can resolve it against a primitive's own `text-*` class.
 */
const FIELD_LABEL = "text-[13px] font-normal text-muted-foreground";

export function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return <Label className={cn(FIELD_LABEL, className)} {...props} />;
}
