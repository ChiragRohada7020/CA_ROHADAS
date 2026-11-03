"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ModalProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  destructive?: boolean;
  loading?: boolean;
}

export function Modal({
  open,
  onOpenChange,
  onClose,
  title,
  description,
  children,
  size,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  destructive = false,
  loading = false,
}: ModalProps) {
  const handleOpenChange = (open: boolean) => {
    onOpenChange?.(open);
    onClose?.(open);
  };

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={sizeClasses[size ?? "md"]}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="pb-4">{children}</div>
        {(onConfirm || confirmLabel) && (
          <DialogFooter>
            <Button onClick={() => onOpenChange?.(false)} variant="outline" disabled={loading}>
              {cancelLabel}
            </Button>
            {onConfirm && (
              <Button
                onClick={() => {
                  onConfirm?.();
                  onOpenChange?.(false);
                }}
                variant={destructive ? "destructive" : "default"}
                disabled={loading}
              >
                {loading ? "…" : confirmLabel}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
