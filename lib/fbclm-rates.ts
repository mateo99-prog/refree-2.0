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
  diets: Array<{ id: string; label: string; amount: number }>;
  mileage: Array<{ id: string; label: string; amount: number }>;
};

type PdfRow = { y: number; items: PdfTextItem[] };

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const normalized = (value: string) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-ES");
const compactNormalized = (value: string) => normalized(value).replace(/[^a-z0-9]/g, "");
const moneyToken = /^(?:\d{1,4}(?:[.,]\d{1,2})?|-)$/;

export const canonicalRateCategory = (value: string) => {
  const category = normalized(value);
  const has = (...parts: string[]) => parts.every((part) => category.includes(part));
  if (has("primera", "feb")) return "primera feb";
  if (has("segunda", "feb")) return "segunda feb";
  if (has("tercera", "feb")) return "tercera feb";
  if (has("primera", "nacional", "masculin")) return "primera nacional masculina";
  if (has("primera", "nacional", "femenin") || has("liga", "ribesalat")) return "primera nacional femenina";
  if (has("liga", "stm", "autonom", "masculin") || has("primera", "division", "autonom")) return "primera division autonomica";
  if (has("primera", "autonom") && has("fem")) return "segunda femenina castilla la mancha";
  if (has("segunda", "division", "autonom", "masculin") || has("zonal", "castilla", "mancha")) return "zonal castilla la mancha";
  if (has("segunda", "femenin", "castilla", "mancha")) return "segunda femenina castilla la mancha";
  if (has("liga", "uclm") && has("u18")) return "liga uclm u18";
  if (has("junior", "u19") || has("liga", "u19") || has("junior", "zonal", "u19")) return "junior zonal u19";
  if (has("provincial", "guadalajara")) return "liga provincial guadalajara";
  if (has("autonom", "cadete")) return "liga autonomica cadete";
  if (has("sector", "infantil", "asociado") || has("sector", "infatil", "asociado")) return "sector infantil asociado";
  if (has("3x3", "escolar")) return "3x3 escolar federado";
  if (has("3x3", "senior")) return "3x3 senior federado";
  if (has("4x4")) return "4x4 federado";
  if (has("alevin", "federado")) return "alevin federado";
  if (has("benjamin", "federado")) return "benjamin federado";
  if (has("cadete", "provincial")) return "cadete provincial";
  if (has("infantil", "provincial")) return "infantil provincial";
  if (has("alevin", "provincial")) return "alevin provincial";
  if (has("benjamin", "provincial")) return "benjamin provincial";
  if (has("trofeo", "jccm", "masculin")) return "trofeo jccm masculino";
  if (has("trofeo", "jccm", "femenin")) return "trofeo jccm femenino";
  if (has("trofeo", "diput") && has("c", "real", "mas")) return "trofeo diputacion ciudad real masculino";
  if (has("trofeo", "diput") && has("c", "real", "fem")) return "trofeo diputacion ciudad real femenino";
  return category;
};

export const rateCategoryLeagueNames = (value: string): string[] => {
  const key = compactNormalized(value);
  if (key === "primeranacionalmasculina") return ["Primera Nacional Masculina"];
  if (key === "primeradivisionautonomica" || key.includes("ligastm1autonomicamasculina")) return ["Liga STM 1º Autonómica Masculina"];
  if (key === "zonalcastillalamancha" || key.includes("segundadivisionautonomicamasculina")) return ["Segunda División Autonómica Masculina"];
  if (key === "primeranacionalfemenina" || key.includes("ribesalat")) return ["1º División Nacional Femenina - Liga RibéSalat"];
  if (key === "segundafemeninacastillalamancha" || (key.includes("primeraautonomicafem") && (key.includes("igualdad") || key.includes("igualda")))) return ["Primera Autonómica Fem - Liga Igualdad"];
  if (key === "ligauclmu18masculinoyfemenina") return ["Junior U18 Masculina - Liga UCLM Masculina", "Junior U18 Femenina - Liga UCLM Femenina"];
  if (key.includes("junioru18masculina") && key.includes("uclmmasculina")) return ["Junior U18 Masculina - Liga UCLM Masculina"];
  if (key.includes("junioru18femenina") && key.includes("uclmfemenina")) return ["Junior U18 Femenina - Liga UCLM Femenina"];
  if (key === "juniorzonalu19masculinoyfemenina") return ["Junior U19 Masculina", "Liga U19 Femenina"];
  if (key.includes("junioru19masculina")) return ["Junior U19 Masculina"];
  if (key.includes("ligau19femenina")) return ["Liga U19 Femenina"];
  if (key === "ligaautonomicacadetemasculinoyfemenina") return ["Liga Autonómica Cadete Masculina", "Liga Autonómica Cadete Femenina"];
  if (key.includes("ligaautonomicacadetemasculina")) return ["Liga Autonómica Cadete Masculina"];
  if (key.includes("ligaautonomicacadetefemenina")) return ["Liga Autonómica Cadete Femenina"];
  if (key === "sectorinfantilasociadomasculinoyfemenina") return ["Sector Infantil Masculino Asociado", "Sector Infantil Femenino Asociado"];
  if (key.includes("sectorinfantilmasculinoasociado") || key.includes("sectorinfatilmasculinoasociado")) return ["Sector Infantil Masculino Asociado"];
  if (key.includes("sectorinfantilfemeninoasociado") || key.includes("sectorinfatilfemeninoasociado")) return ["Sector Infantil Femenino Asociado"];
  return [categoryLabel(value)];
};

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

function categoryLabel(value: string) {
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
}

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

const parseExpenseOptions = (pages: PdfTextItem[][]) => {
  const diets: Array<{ id: string; label: string; amount: number }> = [];
  const mileage: Array<{ id: string; label: string; amount: number }> = [];
  const dietLabels: Record<string, string> = { de1kma75km: "De 1 km a 75 km", de76kma150km: "De 76 km a 150 km", de151kma250km: "De 151 km a 250 km", de251km: "Más de 251 km" };
  const mileageLabels: Record<string, string> = { kmindividual: "Individual", kmcolectivo: "Colectivo", kmcadregional: "CAD regional", kmdeportebase: "Deporte base" };
  pages.flatMap(rowsForPage).forEach((row) => {
    const leftLabel = clean(row.items.filter((item) => item.x < 155).map((item) => item.text).join(" "));
    const leftAmountText = clean(row.items.filter((item) => item.x >= 155 && item.x < 215).map((item) => item.text).join(" "));
    const rightLabel = clean(row.items.filter((item) => item.x >= 215 && item.x < 340).map((item) => item.text).join(" "));
    const rightAmountText = clean(row.items.filter((item) => item.x >= 340).map((item) => item.text).join(" "));
    const leftAmount = Number(leftAmountText.match(/\d+(?:[.,]\d{1,2})?/)?.[0].replace(",", "."));
    const rightAmount = Number(rightAmountText.match(/\d+(?:[.,]\d{1,2})?/)?.[0].replace(",", "."));
    if (normalized(leftLabel).startsWith("de ") && Number.isFinite(leftAmount)) { const id = compactNormalized(leftLabel); diets.push({ id, label: dietLabels[id] || categoryLabel(leftLabel), amount: leftAmount }); }
    if (normalized(rightLabel).startsWith("km ") && Number.isFinite(rightAmount)) { const id = compactNormalized(rightLabel); mileage.push({ id, label: mileageLabels[id] || categoryLabel(rightLabel.replace(/^KM\s+/i, "")), amount: rightAmount }); }
  });
  return { diets, mileage };
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

  const leagueRows = acceptedRows.flatMap((row) => rateCategoryLeagueNames(row.category).map((category) => ({ ...row, category })));
  const rows = leagueRows.filter((row, index) => leagueRows.findIndex((candidate) => normalized(candidate.category) === normalized(row.category)) === index);
  const rates = rows.flatMap((row) => row.amounts.flatMap((amount, index) => amount === null ? [] : [{ category: row.category, role: FBCLM_RATE_ROLES[index], amount }]));
  const expenses = parseExpenseOptions(pages);
  if (!season || rows.length < 5 || rates.length < 10) throw new Error("FORMATO_TARIFAS_NO_RECONOCIDO");
  return { season, rows, rates, excludedCategories, ...expenses };
};
