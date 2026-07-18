import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className = "",
}: PageHeaderProps) {
  return (
    <header className={["page-header", className].filter(Boolean).join(" ")}>
      <div className="page-header__copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? (
          <div className="page-header__description">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

export interface SectionHeaderProps {
  title: string;
  headingId?: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  headingId,
  description,
  actions,
  className = "",
}: SectionHeaderProps) {
  return (
    <div className={["section-header", className].filter(Boolean).join(" ")}>
      <div>
        <h2 id={headingId}>{title}</h2>
        {description ? (
          <div className="section-header__description">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="section-header__actions">{actions}</div> : null}
    </div>
  );
}
