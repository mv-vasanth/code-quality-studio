export const CHECKLIST_STORAGE_KEY = "pqs-best-practices-checked";

export function slugify(name) {
  return (
    (name || "playwright-audit")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "playwright-audit"
  );
}

export function formatReportDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function severityRank(s) {
  if (s === "critical") return 0;
  if (s === "warning") return 1;
  return 2;
}

export function categoryLabel(categories, id) {
  return categories.find((c) => c.id === id)?.label ?? id;
}
