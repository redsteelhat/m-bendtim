/**
 * Miktarı tam sayı olarak gösterir (API DECIMAL / string değerleri için).
 */
export function formatQtyInteger(q: string | number): string {
  const raw = typeof q === "string" ? q.replace(/\s/g, "").replace(",", ".") : String(q);
  const n = typeof q === "string" ? Number.parseFloat(raw) : Number(q);
  if (!Number.isFinite(n)) return String(q);
  return String(Math.round(n));
}
