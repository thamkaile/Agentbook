import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

import { Button } from "./Button";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  closeLabel?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  className = "",
  closeLabel = "Close dialog",
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      queueMicrotask(() => {
        if (!dialog.open) return;
        dialog
          .querySelector<HTMLElement>(
            "[autofocus], button:not(:disabled), input:not(:disabled), " +
              "select:not(:disabled), textarea:not(:disabled), [href]",
          )
          ?.focus();
      });
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    }
  }, [open]);

  useEffect(
    () => () => {
      const dialog = dialogRef.current;
      if (dialog?.open) {
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
      }
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    },
    [],
  );

  function handleBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className={["dialog", className].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onClose();
      }}
      onMouseDown={handleBackdrop}
    >
      <div className="dialog__panel">
        <header className="dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? (
              <div id={descriptionId} className="dialog__description">
                {description}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={closeLabel}
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="dialog__body">{children}</div>
        {actions ? <footer className="dialog__actions">{actions}</footer> : null}
      </div>
    </dialog>
  );
}

export interface ConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}

export function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
}: ConfirmationDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
            loadingText="Working..."
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="dialog__confirmation-copy">{description}</div>
    </Dialog>
  );
}
