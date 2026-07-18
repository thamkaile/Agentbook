import type { ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  HelpCircle,
  MinusCircle,
} from "lucide-react";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "info"
  | "success"
  | "warning"
  | "danger";

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: ReactNode;
  className?: string;
}

export function Badge({
  children,
  tone = "neutral",
  icon,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={["badge", `badge--${tone}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      {icon ? <span className="badge__icon">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}

export type StudyOutcome = "unrated" | "understood" | "partial" | "confused";

const OUTCOME_PRESENTATION = {
  unrated: {
    label: "Unrated",
    icon: CircleDashed,
    tone: "neutral" as const,
  },
  understood: {
    label: "Understood",
    icon: CheckCircle2,
    tone: "success" as const,
  },
  partial: {
    label: "Partly understood",
    icon: MinusCircle,
    tone: "warning" as const,
  },
  confused: {
    label: "Needs review",
    icon: AlertCircle,
    tone: "danger" as const,
  },
} satisfies Record<StudyOutcome, object>;

export interface OutcomeBadgeProps {
  outcome: StudyOutcome | string;
  className?: string;
}

export function OutcomeBadge({ outcome, className }: OutcomeBadgeProps) {
  const presentation =
    OUTCOME_PRESENTATION[outcome as StudyOutcome] ?? {
      label: outcome || "Unknown",
      icon: HelpCircle,
      tone: "neutral" as const,
    };
  const Icon = presentation.icon;

  return (
    <Badge
      tone={presentation.tone}
      icon={<Icon size={15} strokeWidth={2} aria-hidden="true" />}
      className={className}
    >
      {presentation.label}
    </Badge>
  );
}

