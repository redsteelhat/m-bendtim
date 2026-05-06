import { PDFParse } from "pdf-parse";

export type ParsedIrsaliyeLine = {
  rowNo: number;
  sku: string;
  name: string;
  quantity: number;
  unit: string;
};

export type ParsedIrsaliye = {
  documentNo: string;
  documentDate: string;
  lineCount: number;
  lines: ParsedIrsaliyeLine[];
  warnings: string[];
  rawText?: string;
};

export class IrsaliyePdfParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IrsaliyePdfParseError";
  }
}

export async function parseIrsaliyePdf(buffer: Buffer): Promise<ParsedIrsaliye> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return parseIrsaliyeText(result.text, { includeRawText: process.env.NODE_ENV !== "production" });
  } finally {
    await parser.destroy();
  }
}

export function parseIrsaliyeText(
  rawText: string,
  options: { includeRawText?: boolean } = {}
): ParsedIrsaliye {
  const text = normalizeText(rawText);
  const warnings: string[] = [];
  const documentNo = extractDocumentNo(text);
  const documentDate = extractDocumentDate(text);
  const lines = extractLines(text, warnings);

  if (!documentNo) throw new IrsaliyePdfParseError("İrsaliye No okunamadı");
  if (!documentDate) throw new IrsaliyePdfParseError("İrsaliye Tarihi okunamadı");
  if (lines.length === 0) throw new IrsaliyePdfParseError("PDF içinde malzeme satırı bulunamadı");

  return {
    documentNo,
    documentDate,
    lineCount: lines.length,
    lines,
    warnings,
    ...(options.includeRawText ? { rawText: text } : {}),
  };
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function extractDocumentNo(text: string): string {
  const match = text.match(/(?:İrsaliye|Irsaliye)\s*No\s*:?\s*([A-Z0-9\s-]+)/iu);
  return match?.[1]?.replace(/\s+/g, "").trim() ?? "";
}

function extractDocumentDate(text: string): string {
  const match = text.match(/(?:İrsaliye|Irsaliye)\s*Tarihi\s*:?\s*(\d{2})[-./](\d{2})[-./](\d{4})/iu);
  if (!match) return "";
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function extractLines(text: string, warnings: string[]): ParsedIrsaliyeLine[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let tableStarted = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/Sıra\s*No/i.test(line) && /Malzeme\s*Kodu/i.test(line) && /Miktar/i.test(line)) {
      tableStarted = true;
      continue;
    }

    const next = lines[i + 1] ?? "";
    const startsRow = tableStarted && isRowStart(line, next);
    if (startsRow) {
      if (current.length > 0) chunks.push(current.join(" "));
      current = [line];
      continue;
    }

    if (current.length > 0) {
      if (isLikelyTableFooter(line)) {
        chunks.push(current.join(" "));
        current = [];
        continue;
      }
      if (parseLineChunk(current.join(" "))) {
        chunks.push(current.join(" "));
        current = [];
        continue;
      }
      current.push(line);
    }
  }
  if (current.length > 0) chunks.push(current.join(" "));

  const rows: ParsedIrsaliyeLine[] = [];
  for (const chunk of chunks) {
    const parsed = parseLineChunk(chunk);
    if (!parsed) {
      warnings.push(`Satır okunamadı: ${chunk.slice(0, 180)}`);
      continue;
    }
    rows.push(parsed);
  }

  return rows;
}

function isRowStart(line: string, nextLine: string): boolean {
  if (/^\d{1,4}\s+\S+/.test(line)) return true;
  return /^\d{1,4}$/.test(line) && /^\S+/.test(nextLine) && looksLikeSku(nextLine.split(/\s+/)[0]);
}

function looksLikeSku(value: string): boolean {
  const normalized = cleanSku(value);
  return /[A-Z0-9ÇĞİÖŞÜ._-]*\d+[A-Z0-9ÇĞİÖŞÜ._-]*/iu.test(normalized) && /[-.]/.test(normalized);
}

function isLikelyTableFooter(line: string): boolean {
  return /^(Toplam|Genel\s+Toplam|Not|Açıklamalar|Vergi|Sayfa)\b/iu.test(line);
}

function parseLineChunk(chunk: string): ParsedIrsaliyeLine | null {
  const normalized = chunk.replace(/\s+/g, " ").trim();
  const rowMatch = normalized.match(/^(\d{1,4})\s+(.+)$/u);
  if (!rowMatch) return null;

  const rowNo = Number(rowMatch[1]);
  if (!Number.isInteger(rowNo) || rowNo < 1) return null;

  const rest = rowMatch[2].trim();
  const qtyUnitMatch = rest.match(/^(.*)\s+(\d+\s*(?:[,.]\s*\d+)?)\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s*$/u);
  if (!qtyUnitMatch) return null;

  const beforeQuantity = qtyUnitMatch[1].trim();
  const skuNameMatch =
    beforeQuantity.match(/^(.+?-\s*O\s*P\d+)\s+(.+)$/iu) ??
    beforeQuantity.match(/^(\S+)\s+(.+)$/u);
  if (!skuNameMatch) return null;

  const sku = cleanSku(skuNameMatch[1]);
  if (!looksLikeSku(sku)) return null;

  const name = cleanName(skuNameMatch[2]);
  const quantity = Number(qtyUnitMatch[2].replace(/\s+/g, "").replace(",", "."));
  const unit = qtyUnitMatch[3].trim();
  if (!name || !Number.isFinite(quantity) || quantity <= 0 || !unit) return null;

  return { rowNo, sku, name, quantity, unit };
}

function cleanSku(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function cleanName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/m\s+m/giu, "mm")
    .replace(/ÇEK\s+ME/giu, "ÇEKME")
    .replace(/TRANSMİS\s+YON/giu, "TRANSMİSYON")
    .replace(/Tran\s+sm\s+isy\s+on/giu, "Transmisyon")
    .trim();
}
