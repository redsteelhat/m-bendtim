/** YYYY-MM-DD — işlem anındaki takvim günü (Türkiye saati; önizleme ile sunucu uyumu). */
export function dateOnlyLocal(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
