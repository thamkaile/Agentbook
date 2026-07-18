export function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatPercent(value: number | null | undefined): string {
  return value == null ? 'Not enough data' : `${value.toFixed(1)}%`;
}

export function formatRatioPercent(value: number | null | undefined): string {
  return value == null ? 'Not enough data' : `${(value * 100).toFixed(1)}%`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The request could not be completed.';
}

export function titleCase(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
