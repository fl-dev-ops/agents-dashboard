"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type DestructiveConfirmationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  onConfirm: () => void;
  actionLabel: string;
  pendingLabel?: string;
  isPending?: boolean;
  confirmationText?: string;
};

export function DestructiveConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  actionLabel,
  pendingLabel,
  isPending = false,
  confirmationText = "delete",
}: DestructiveConfirmationDialogProps) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!open) setValue("");
  }, [open]);

  const matches = value === confirmationText;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Type <span className="font-mono font-medium text-foreground">{confirmationText}</span> to confirm.
          </p>
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={confirmationText}
            className="font-mono"
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!matches || isPending}
            onClick={onConfirm}
          >
            {isPending ? pendingLabel ?? actionLabel : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
