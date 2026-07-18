export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = true,
  className = "",
}: ProgressBarProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), safeMax);
  const percentage = Math.round((safeValue / safeMax) * 100);

  return (
    <div className={["progress", className].filter(Boolean).join(" ")}>
      {label || showValue ? (
        <div className="progress__label">
          <span>{label ?? "Progress"}</span>
          {showValue ? <span>{percentage}%</span> : null}
        </div>
      ) : null}
      <progress value={safeValue} max={safeMax} aria-label={label ?? "Progress"}>
        {percentage}%
      </progress>
    </div>
  );
}

