const BADGE_COLORS = [
  "var(--banana)",
  "var(--jungle)",
  "var(--bark)",
  "var(--leaf)",
  "var(--mango)",
];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function hashColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return BADGE_COLORS[h % BADGE_COLORS.length];
}

export function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
