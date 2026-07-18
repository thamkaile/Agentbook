import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";

export type NoticeTone = "info" | "success" | "warning" | "error";

export interface NoticeProps {
  children: ReactNode;
  title?: string;
  tone?: NoticeTone;
  className?: string;
}

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

export function Notice({
  children,
  title,
  tone = "info",
  className = "",
}: NoticeProps) {
  const Icon = ICONS[tone];
  const role = tone === "error" ? "alert" : "status";

  return (
    <div
      className={["notice", `notice--${tone}`, className]
        .filter(Boolean)
        .join(" ")}
      role={role}
    >
      <Icon className="notice__icon" size={20} aria-hidden="true" />
      <div>
        {title ? <p className="notice__title">{title}</p> : null}
        <div className="notice__body">{children}</div>
      </div>
    </div>
  );
}

