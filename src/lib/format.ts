const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelative(iso: string, now = Date.now()) {
  const value = new Date(iso).getTime();
  if (Number.isNaN(value)) return "Unknown";
  const diff = Math.max(0, now - value);

  if (diff < MINUTE) return "Just now";
  if (diff < HOUR) {
    const minutes = Math.round(diff / MINUTE);
    return `${minutes} min ago`;
  }
  if (diff < DAY) {
    const hours = Math.round(diff / HOUR);
    return `${hours} hr ago`;
  }
  if (diff < 2 * DAY) return "Yesterday";
  if (diff < 7 * DAY) {
    const days = Math.round(diff / DAY);
    return `${days} days ago`;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

export function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * HOUR).toISOString();
}

export function daysAgo(days: number) {
  return hoursAgo(days * 24);
}

export function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * HOUR).toISOString();
}

export function isOverdue(iso?: string) {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

export function isDueSoon(iso?: string, withinHours = 24) {
  if (!iso) return false;
  const diff = new Date(iso).getTime() - Date.now();
  return diff >= 0 && diff < withinHours * HOUR;
}
