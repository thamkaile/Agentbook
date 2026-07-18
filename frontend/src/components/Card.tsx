import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: "default" | "muted" | "accent";
  padding?: "none" | "small" | "medium" | "large";
  children: ReactNode;
}

export function Card({
  tone = "default",
  padding = "medium",
  className = "",
  children,
  ...props
}: CardProps) {
  const classes = [
    "card",
    `card--${tone}`,
    `card--padding-${padding}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}

