"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** One line naming the consequence of confirming. */
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  /**
   * Destructive by default, since most confirms here lose work. `default` is
   * for a step that costs time rather than work, like a long read.
   */
  confirmVariant?: "destructive" | "default";
}

/**
 * Confirm step for actions that lose work. The action runs first and the
 * dialog closes after, so a caller can keep it open on failure.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  confirmVariant = "destructive",
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-xs">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={confirmVariant} size="lg" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
