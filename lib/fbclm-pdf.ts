export type PdfTextItem = { page: number; x: number; y: number; text: string };

export type PdfOfficial = {
  name: string;
  phone: string;
  role: string;
  licenseId: string;
  city: string;
};

export type ParsedDesignation = {
  matchNumber: string;
  date: string;
  time: string;
  category: string;
  home: string;
  away: string;
  role: string;
  venue: string;
  officials: PdfOfficial[];
};

export type ParsedDesignationPdf = {
  designatedName: string;
  designatedLicenseId: string;
  matches: ParsedDesignation[];
};

type PdfRow = { y: number; items: PdfTextItem[] };

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const normalized = (value: string) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

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

const rowText = (row: PdfRow) => clean(row.items.map((item) => item.text).join(" "));
const itemTextInRange = (row: PdfRow, minX: number, maxX = Number.POSITIVE_INFINITY) => clean(row.items.filter((item) => item.x >= minX && item.x < maxX).map((item) => item.text).join(" "));
const findRow = (rows: PdfRow[], value: string) => rows.find((row) => normalized(rowText(row)).includes(normalized(value)));
const rowsBetween = (rows: PdfRow[], upperY: number, lowerY: number) => rows.filter((row) => row.y < upperY - 2 && row.y > lowerY + 2);

const ROLE_CODES: Record<string, string> = {
  AP: "Árbitro principal",
  AA: "Árbitro auxiliar",
  AN: "Anotador",
  CR: "Cronometrador",
  OP: "Operador RLL",
  AJ: "Ayudante de anotador",
  "3A": "Tercer árbitro",
  IA: "Informador arbitral",
  AX: "Auxiliar de mesa en pruebas",
  TA: "Tutor arbitral",
  RAF: "Representante de actividades federativas",
  IT: "Informador auxiliar de mesa",
  CA: "Consultor arbitral",
  FI: "Filmador",
};

const parseHeader = (rows: PdfRow[]) => {
  const marker = findRow(rows, "EL/LA");
  if (!marker) return { designatedName: "", designatedLicenseId: "", defaultVenue: "", roleByMatch: new Map<string, string>() };
  const identityRow = rows.find((row) => Math.abs(row.y - marker.y) <= 6 && row.items.some((item) => /^\d{3,8}$/.test(clean(item.text))));
  const designatedLicenseId = clean(identityRow?.items.find((item) => item.x >= 65 && item.x < 115 && /^\d{3,8}$/.test(clean(item.text)))?.text || "");
  const designatedName = clean(identityRow?.items.filter((item) => item.x >= 110).map((item) => item.text).join(" ") || "").replace(/^\.+|_+/g, "").trim();

  const tableHeader = findRow(rows, "Num Partido");
  const groupHeader = findRow(rows, "Grupo");
  const designationDateRow = findRow(rows, "Ha sido designado");
  const dateRow = designationDateRow ? rows.find((row) => row.y < designationDateRow.y - 2 && /\d{1,2}[\/-]\d{1,2}[\/-]20\d{2}/.test(rowText(row))) : undefined;
  const defaultVenue = dateRow && tableHeader ? rowText(rows.find((row) => row.y < dateRow.y - 2 && row.y > tableHeader.y + 2) || { y: 0, items: [] }) : "";
  const roleByMatch = new Map<string, string>();
  if (tableHeader && groupHeader) {
    rowsBetween(rows, tableHeader.y, groupHeader.y).forEach((row) => {
      const matchNumber = clean(row.items.find((item) => item.x < 70 && /^\d{3,8}$/.test(clean(item.text)))?.text || "");
      const roleCode = clean(row.items.find((item) => item.x >= 65 && item.x < 110 && /^[A-Z0-9]{2,3}$/.test(clean(item.text)))?.text || "").toUpperCase();
      if (matchNumber && roleCode) roleByMatch.set(matchNumber, ROLE_CODES[roleCode] || roleCode);
    });
  }
  return { designatedName, designatedLicenseId, defaultVenue, roleByMatch };
};

const parseOfficial = (row: PdfRow, nameX: number, phoneX: number, cityX: number): PdfOfficial | null => {
  const role = itemTextInRange(row, 90, nameX);
  const nameWithId = itemTextInRange(row, nameX, phoneX);
  const phone = itemTextInRange(row, phoneX, cityX).replace(/\D/g, "");
  const city = itemTextInRange(row, cityX);
  const licenseId = nameWithId.match(/\((\d{2,8})\)\s*$/)?.[1] || "";
  const name = clean(nameWithId.replace(/\s*\(\d{2,8}\)\s*$/, ""));
  if (!role || !name) return null;
  return { role, name, phone, licenseId, city };
};

const parseDetailPage = (rows: PdfRow[], designatedLicenseId: string, defaultVenue: string, roleByMatch: Map<string, string>): ParsedDesignation | null => {
  const matchHeader = findRow(rows, "Datos partido");
  const teamsHeader = findRow(rows, "Datos Equipos");
  const officialsHeader = findRow(rows, "Datos colegiados");
  const observationsHeader = findRow(rows, "Observaciones");
  if (!matchHeader || !teamsHeader || !officialsHeader || !observationsHeader) return null;

  const dayLabel = matchHeader.items.find((item) => normalized(item.text) === "dia");
  const matchLabel = matchHeader.items.find((item) => normalized(item.text).includes("num. partido"));
  const competitionLabel = matchHeader.items.find((item) => normalized(item.text) === "competicion");
  if (!dayLabel || !matchLabel || !competitionLabel) return null;

  const matchRows = rowsBetween(rows, matchHeader.y, teamsHeader.y);
  const dateTime = clean(matchRows.map((row) => itemTextInRange(row, dayLabel.x, matchLabel.x)).filter(Boolean).join(" "));
  const matchNumber = clean(matchRows.map((row) => itemTextInRange(row, matchLabel.x, competitionLabel.x)).filter(Boolean).join(" ")).match(/\d{3,8}/)?.[0] || "";
  const category = clean(matchRows.map((row) => itemTextInRange(row, competitionLabel.x)).filter(Boolean).join(" "));
  const dateMatch = dateTime.match(/(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})/);
  const time = dateTime.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/)?.[0] || "";
  const date = dateMatch ? `${dateMatch[3]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}` : "";

  const localLabel = findRow(rows, "Equipo Local");
  const visitorLabel = findRow(rows, "Equipo Visitante");
  const colorLabelX = localLabel?.items.find((item) => normalized(item.text).includes("color camiseta"))?.x || 250;
  const teamX = localLabel?.items.find((item) => normalized(item.text) === "equipo local")?.x || dayLabel.x;
  const home = localLabel && visitorLabel ? clean(rowsBetween(rows, localLabel.y, visitorLabel.y).map((row) => itemTextInRange(row, teamX, colorLabelX)).filter(Boolean).join(" ")) : "";
  const away = visitorLabel ? clean(rowsBetween(rows, visitorLabel.y, officialsHeader.y).map((row) => itemTextInRange(row, teamX, colorLabelX)).filter(Boolean).join(" ")) : "";

  const roleLabel = officialsHeader.items.find((item) => normalized(item.text) === "funcion");
  const nameLabel = officialsHeader.items.find((item) => normalized(item.text).includes("nombre y apellidos"));
  const phoneLabel = officialsHeader.items.find((item) => normalized(item.text) === "telefono");
  const cityLabel = officialsHeader.items.find((item) => normalized(item.text) === "poblacion");
  const officials = roleLabel && nameLabel && phoneLabel && cityLabel
    ? rowsBetween(rows, officialsHeader.y, observationsHeader.y).map((row) => parseOfficial(row, nameLabel.x, phoneLabel.x, cityLabel.x)).filter((official): official is PdfOfficial => Boolean(official))
    : [];

  const ownOfficial = officials.find((official) => official.licenseId === designatedLicenseId);
  const role = ownOfficial?.role || roleByMatch.get(matchNumber) || "Función pendiente";
  if (!date || !time || !matchNumber || !category || !home || !away) return null;
  return { matchNumber, date, time, category, home, away, role, venue: defaultVenue, officials };
};

export const parseFbclmDesignationPages = (pages: PdfTextItem[][]): ParsedDesignationPdf => {
  const firstPageRows = rowsForPage(pages[0] || []);
  const header = parseHeader(firstPageRows);
  const matches = pages
    .map((page) => parseDetailPage(rowsForPage(page), header.designatedLicenseId, header.defaultVenue, header.roleByMatch))
    .filter((match): match is ParsedDesignation => Boolean(match));
  return { designatedName: header.designatedName, designatedLicenseId: header.designatedLicenseId, matches };
};
