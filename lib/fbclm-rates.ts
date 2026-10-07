import type { PdfTextItem } from "./fbclm-pdf";

export const FBCLM_RATE_ROLES = [
  "Árbitro principal",
  "Árbitro auxiliar",
  "Anotador",
  "Cronometrador",
  "Operador RLL",
  "Ayudante de anotador",
] as const;

export type ParsedRateRow = {
  category: string;
  amounts: Array<number | null>;
};

export type ParsedRateSheet = {
  season: string;
  rows: ParsedRateRow[];
  rates: Array<{ category: string; role: string; amount: number }>;
  excludedCategories: string[];
};

type PdfRow = { y: number; items: PdfTextItem[] };

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const normalized = (value: string) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-ES");
const compactNormalized = (value: string) => normalized(value).replace(/[^a-z0-9]/g, "");
const moneyToken = /^(?:\d{1,4}(?:[.,]\d{1,2})?|-)$/;

const rowsForPage = (items: PdfTextItem[]) => {
  const rows: PdfRow[] = [];
  [...items].sort((a, b) => b.y - a.y || a.x - b.x).forEach((item) => {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  });
  rows.forEach((row) => row.items.sort((a, b) => a.x - b.x));
  return rows.sort((a, b) => b.y - a.y);
};

const categoryLabel = (value: string) => {
  const lowerWords = new Set(["de", "del", "la", "las", "y", "por"]);
  const correctedWords: Record<string, string> = { alevin: "Alevín", autonomica: "Autonómica", benjamin: "Benjamín", division: "División" };
  return clean(value).split(" ").map((word, index) => {
    const upper = word.toLocaleUpperCase("es-ES");
    if (upper === "UCLM" || /^U\d+$/.test(upper)) return upper;
    if (upper === "3X3") return "3x3";
    if (upper === "4X4") return "4x4";
    const lower = word.toLocaleLowerCase("es-ES");
    if (correctedWords[lower]) return correctedWords[lower];
    if (index > 0 && lowerWords.has(lower)) return lower;
    return lower.charAt(0).toLocaleUpperCase("es-ES") + lower.slice(1);
  }).join(" ");
};

const parseSeason = (pages: PdfTextItem[][]) => {
  const text = pages.flat().map((item) => item.text).join(" ");
  const match = text.match(/(?:TEMPORADA|TARIFAS?)\s+(20\d{2})\s*[-/]\s*(20\d{2}|\d{2})/i);
  if (!match) return "";
  const end = match[2].length === 4 ? match[2].slice(-2) : match[2];
  return `${match[1]}/${end}`;
};

const shouldExclude = (category: string) => {
  const value = normalized(category);
  return value.includes("feb") || (value.includes("provincial") && value.includes("guadalajara")) || value.includes("trof");
};

const parseDataRow = (row: PdfRow): ParsedRateRow | null => {
  const valueItems = row.items.filter((item) => moneyToken.test(clean(item.text)));
  if (valueItems.length !== FBCLM_RATE_ROLES.length) return null;
  const firstValueX = Math.min(...valueItems.map((item) => item.x));
  const rawCategory = clean(row.items.filter((item) => item.x < firstValueX).map((item) => item.text).join(" "));
  if (!rawCategory || normalized(rawCategory) === "categoria") return null;
  const amounts = valueItems.map((item) => {
    const token = clean(item.text);
    if (token === "-") return null;
    const amount = Number(token.replace(",", "."));
    return Number.isFinite(amount) ? amount : null;
  });
  return { category: categoryLabel(rawCategory), amounts };
};

export const parseFbclmRatePages = (pages: PdfTextItem[][]): ParsedRateSheet => {
  const season = parseSeason(pages);
  const acceptedRows: ParsedRateRow[] = [];
  const excludedCategories: string[] = [];

  pages.forEach((page) => {
    const rows = rowsForPage(page);
    const startIndex = rows.findIndex((row) => compactNormalized(row.items.map((item) => item.text).join(" ")).includes("categoriasfbclm"));
    if (startIndex < 0) return;
    const endIndex = rows.findIndex((row, index) => index > startIndex && compactNormalized(row.items.map((item) => item.text).join(" ")).includes("importeseneuros"));
    const tableRows = rows.slice(startIndex + 1, endIndex > startIndex ? endIndex : undefined);
    tableRows.forEach((row) => {
      const parsed = parseDataRow(row);
      if (!parsed) return;
      if (shouldExclude(parsed.category)) excludedCategories.push(parsed.category);
      else if (parsed.amounts.every((amount) => amount === null)) return;
      else acceptedRows.push(parsed);
    });
  });

  const rows = acceptedRows.filter((row, index) => acceptedRows.findIndex((candidate) => normalized(candidate.category) === normalized(row.category)) === index);
  const rates = rows.flatMap((row) => row.amounts.flatMap((amount, index) => amount === null ? [] : [{ category: row.category, role: FBCLM_RATE_ROLES[index], amount }]));
  if (!season || rows.length < 5 || rates.length < 10) throw new Error("FORMATO_TARIFAS_NO_RECONOCIDO");
  return { season, rows, rates, excludedCategories };
};
