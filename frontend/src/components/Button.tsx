import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingText?: string;
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  loading = false,
  loadingText = "Working…",
  icon,
  className = "",
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const classes = ["button", `button--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      type={type}
      {...props}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : icon}
      <span>{loading ? loadingText : children}</span>
    </button>
  );
}

