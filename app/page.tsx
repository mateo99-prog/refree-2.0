"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { BarChart3, CalendarDays, Camera, Check, ChevronRight, CircleEuro, Clock3, Download, ExternalLink, FileSpreadsheet, FileText, FileUp, Home, MapPin, Maximize2, Menu, MessageCircle, Minimize2, Pencil, Play, Plus, Search, Settings, ShieldCheck, Tag, TimerReset, Trash2, Trophy, UploadCloud, Users, Video, WalletCards, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { parseFbclmDesignationPages } from "@/lib/fbclm-pdf";
import type { ParsedDesignationPdf, PdfOfficial, PdfTextItem } from "@/lib/fbclm-pdf";
import { supabase } from "@/lib/supabase";
import { findMatchForVideoTitle, findRecordedGameForMatch } from "@/lib/video-match";

type View = "inicio" | "importar" | "regionales" | "escolares" | "grabados" | "ganancias" | "arbitros" | "tarifas" | "ajustes";
type MatchCompetition = "regional" | "escolar";
type Match = { id: string; competition: MatchCompetition; matchNumber?: string; date: string; time: string; home: string; away: string; category: string; role: string; venue: string; gross: number; diets: number; retention: number; partners: string[]; video?: boolean; status: "confirmado" | "pendiente" };
type Rate = { id: string; category: string; role: string; amount: number; retention: number };
type Contact = { id: string; name: string; phone: string; role: string; licenseId?: string; city?: string };
type VideoAnnotation = { id: string; seconds: number; category: string; label: string; note: string; createdAt: string };
type RecordedGame = { id: string; title: string; youtubeUrl: string; youtubeId: string; matchId?: string; createdAt: string; annotations: VideoAnnotation[] };
type AppData = { dataVersion: number; matches: Match[]; rates: Rate[]; contacts: Contact[]; recordedGames: RecordedGame[]; settings: { name: string; season: string; earningsGoal: number; username: string; profileImage: string } };
type Viewer = { userId: string; displayName: string; email: string; fullName: string | null };

const sampleData: AppData = {
  dataVersion: 4,
  matches: [
    { id: "p1", competition: "regional", date: "2026-09-19", time: "18:30", home: "CB Toledo", away: "Baloncesto Talavera", category: "Junior Autonómico", role: "Árbitro auxiliar", venue: "Pabellón Javier Lozano Cid", gross: 32, diets: 8, retention: 2, partners: ["Álvaro Martín"], video: true, status: "confirmado" },
    { id: "p2", competition: "regional", date: "2026-09-20", time: "12:00", home: "CEI Toledo", away: "CB La Sagra", category: "Infantil Regional", role: "Árbitro", venue: "Pabellón IES Universidad Laboral", gross: 24, diets: 0, retention: 2, partners: ["Lucía Gómez"], video: false, status: "confirmado" },
    { id: "p3", competition: "regional", date: "2026-09-12", time: "17:00", home: "CB Mora", away: "Basket Azuqueca", category: "Cadete Regional", role: "Árbitro", venue: "Pabellón Municipal de Mora", gross: 27.5, diets: 6, retention: 2, partners: ["Álvaro Martín"], video: false, status: "confirmado" },
  ],
  rates: [
    { id: "t1", category: "Junior Autonómico", role: "Árbitro auxiliar", amount: 32, retention: 2 },
    { id: "t2", category: "Infantil Regional", role: "Árbitro", amount: 24, retention: 2 },
    { id: "t3", category: "Cadete Regional", role: "Árbitro", amount: 27.5, retention: 2 },
  ],
  contacts: [],
  recordedGames: [],
  settings: { name: "Árbitro", season: "2026/27", earningsGoal: 250, username: "", profileImage: "" },
};
const emptyData = (name: string): AppData => ({ dataVersion: 4, matches: [], rates: [], contacts: [], recordedGames: [], settings: { name, season: "2026/27", earningsGoal: 250, username: "", profileImage: "" } });

const nav: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "inicio", label: "Inicio", icon: Home }, { id: "importar", label: "Importar", icon: FileUp }, { id: "regionales", label: "Regionales", icon: CalendarDays }, { id: "escolares", label: "Partidos escolares", icon: Trophy }, { id: "grabados", label: "Partidos grabados", icon: Video },
  { id: "ganancias", label: "Ganancias", icon: BarChart3 }, { id: "arbitros", label: "Árbitros", icon: Users }, { id: "tarifas", label: "Tarifas", icon: CircleEuro }, { id: "ajustes", label: "Ajustes", icon: Settings },
];
const RETENTION_RATE = 2;
const CURRENT_DATA_VERSION = 4;
const SAMPLE_CONTACT_IDS = new Set(["a1", "a2"]);
const normalizeData = (state: AppData): AppData => {
  const removeSampleContacts = (state.dataVersion || 0) < 1;
  const savedGoal = Number(state.settings?.earningsGoal);
  return {
    ...state,
    dataVersion: CURRENT_DATA_VERSION,
    matches: (state.matches || []).map((match) => ({ ...match, competition: match.competition === "escolar" ? "escolar" : "regional", retention: RETENTION_RATE })),
    rates: (state.rates || []).map((rate) => ({ ...rate, retention: RETENTION_RATE })),
    contacts: removeSampleContacts ? (state.contacts || []).filter((contact) => !SAMPLE_CONTACT_IDS.has(contact.id)) : (state.contacts || []),
    settings: {
      name: state.settings?.name || "Árbitro",
      season: state.settings?.season || "2026/27",
      earningsGoal: Number.isFinite(savedGoal) && savedGoal >= 0 ? savedGoal : 250,
      username: state.settings?.username || "",
      profileImage: state.settings?.profileImage || "",
    },
  };
};
const money = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
const net = (m: Match) => m.gross * (1 - RETENTION_RATE / 100) + m.diets;
const normalizeRateField = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es-ES");
const canonicalRole = (value: string) => {
  const role = normalizeRateField(value).replace(/[.]/g, "");
  const aliases: Record<string, string> = {
    ap: "arbitro principal", arbitro: "arbitro principal", "arbitro principal": "arbitro principal",
    aa: "arbitro auxiliar", "arbitro auxiliar": "arbitro auxiliar",
    an: "anotador", anotador: "anotador",
    cr: "cronometrador", cronometrador: "cronometrador",
    op: "operador rll", "operador rll": "operador rll", "operador reloj lanzamiento": "operador rll", "operador reloj de lanzamiento": "operador rll",
    aj: "ayudante de anotador", "ayudante de anotador": "ayudante de anotador",
    "3a": "tercer arbitro", "tercer arbitro": "tercer arbitro",
    ia: "informador arbitral", "informador arbitral": "informador arbitral",
    ax: "auxiliar de mesa en pruebas", "auxiliar de mesa en pruebas": "auxiliar de mesa en pruebas",
    ta: "tutor arbitral", "tutor arbitral": "tutor arbitral",
    raf: "representante actividades federativas", "representante de actividades federativas": "representante actividades federativas",
    it: "informador auxiliar de mesa", "informador auxiliar de mesa": "informador auxiliar de mesa",
    ca: "consultor arbitral", "consultor arbitral": "consultor arbitral",
    fi: "filmador", filmador: "filmador",
  };
  return aliases[role] || role;
};
const normalizeUsername = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const resizeProfileImage = (file: File) => new Promise<string>((resolve, reject) => {
  if (!file.type.startsWith("image/")) { reject(new Error("Selecciona una imagen JPG, PNG o WebP.")); return; }
  if (file.size > 8 * 1024 * 1024) { reject(new Error("La imagen no puede superar 8 MB.")); return; }
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error("No se pudo procesar la imagen."));
    image.onload = () => {
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const sourceX = (image.naturalWidth - side) / 2;
      const sourceY = (image.naturalHeight - side) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = 256; canvas.height = 256;
      const context = canvas.getContext("2d");
      if (!context) { reject(new Error("No se pudo preparar la imagen.")); return; }
      context.drawImage(image, sourceX, sourceY, side, side, 0, 0, 256, 256);
      resolve(canvas.toDataURL("image/jpeg", 0.84));
    };
    image.src = String(reader.result);
  };
  reader.readAsDataURL(file);
});
const findSavedRate = (rates: Rate[], category: string, role: string) => {
  const normalizedCategory = normalizeRateField(category);
  const normalizedRole = normalizeRateField(role);
  if (!normalizedCategory || !normalizedRole) return undefined;
  return rates.find((rate) => normalizeRateField(rate.category) === normalizedCategory && canonicalRole(rate.role) === canonicalRole(normalizedRole));
};
const applySavedRate = (match: Match, rates: Rate[]): Match => {
  const savedRate = findSavedRate(rates, match.category, match.role);
  return savedRate ? { ...match, gross: savedRate.amount, retention: RETENTION_RATE } : match;
};
const dateLabel = (iso: string) => new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00`));
const localIsoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase("es-ES") + value.slice(1);
const matchCountLabel = (count: number) => `${count} ${count === 1 ? "partido" : "partidos"}`;
const compact = (value: string) => value.replaceAll("-", "").replaceAll(":", "");
const annotationGroups = [
  { name: "Mecánica arbitral", color: "#f47b20", items: ["Ángulo de visión", "Distancia a la jugada", "Posicionamiento", "Rotación"] },
  { name: "RLL", color: "#9656dc", items: ["Mantener", "Reiniciar"] },
  { name: "Faltas", color: "#e43c68", items: ["Bloqueo ilegal", "Empuja", "Golpea", "Golpea en AOS", "Golpea en la cabeza", "No call", "Otras"] },
  { name: "Señalización", color: "#2eaf55", items: ["Comunicación", "Correcta", "Incorrecta"] },
  { name: "Transiciones", color: "#df2abb", items: ["Nuevo cabeza", "Nuevo cola"] },
  { name: "Violaciones", color: "#a84bc0", items: ["3 segundos en zona", "Avance ilegal", "Campo atrás", "Doble regate"] },
];
const parseYouTubeId = (value: string) => {
  try { const url = new URL(value.trim()); if (url.hostname.includes("youtu.be")) return url.pathname.slice(1).split("/")[0]; if (url.hostname.includes("youtube.com")) return url.searchParams.get("v") || url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] || ""; } catch { return ""; }
  return "";
};
const timeLabel = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
const videoAt = (game: RecordedGame, seconds: number) => `https://www.youtube.com/watch?v=${encodeURIComponent(game.youtubeId)}&t=${Math.max(0, Math.floor(seconds) - 3)}s`;
const makeId = () => typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const sameContact = (contact: Contact, official: PdfOfficial) => Boolean(
  (contact.licenseId && official.licenseId && contact.licenseId === official.licenseId)
  || normalizeRateField(contact.name) === normalizeRateField(official.name)
);
const uniqueImportedOfficials = (parsed: ParsedDesignationPdf) => {
  const officials: PdfOfficial[] = [];
  parsed.matches.flatMap((match) => match.officials).forEach((official) => {
    if (official.licenseId && official.licenseId === parsed.designatedLicenseId) return;
    if (!officials.some((saved) => (saved.licenseId && official.licenseId && saved.licenseId === official.licenseId) || normalizeRateField(saved.name) === normalizeRateField(official.name))) officials.push(official);
  });
  return officials;
};
const mergeImportedOfficials = (contacts: Contact[], officials: PdfOfficial[]) => {
  let added = 0; let updated = 0;
  const merged = [...contacts];
  officials.forEach((official) => {
    const index = merged.findIndex((contact) => sameContact(contact, official));
    if (index === -1) {
      merged.push({ id: makeId(), name: official.name, phone: official.phone, role: official.role, licenseId: official.licenseId || undefined, city: official.city || undefined });
      added += 1;
      return;
    }
    const current = merged[index];
    const next = { ...current, phone: current.phone || official.phone, role: current.role === "Árbitro" ? official.role : current.role, licenseId: current.licenseId || official.licenseId || undefined, city: current.city || official.city || undefined };
    if (JSON.stringify(next) !== JSON.stringify(current)) { merged[index] = next; updated += 1; }
  });
  return { contacts: merged, added, updated };
};
function saveBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function assetDataUrl(path: string) { const response = await fetch(path); if (!response.ok) throw new Error("No se pudo cargar el recurso"); const blob = await response.blob(); return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }); }
function googleCalendar(m: Match) {
  const start = `${compact(m.date)}T${compact(m.time)}00`; const e = new Date(`${m.date}T${m.time}:00`); e.setHours(e.getHours() + 2);
  const end = `${compact(m.date)}T${String(e.getHours()).padStart(2, "0")}${String(e.getMinutes()).padStart(2, "0")}00`;
  const p = new URLSearchParams({ action: "TEMPLATE", text: `🏀 ${m.home} – ${m.away}`, dates: `${start}/${end}`, location: m.venue, details: `${m.category}\n${m.role}\nCompañeros: ${m.partners.join(", ") || "Sin indicar"}` });
  window.open(`https://calendar.google.com/calendar/render?${p}`, "_blank", "noopener,noreferrer");
}

function MatchDialog({ competition, rates, onAdd }: { competition: MatchCompetition; rates: Rate[]; onAdd: (m: Match) => void }) {
  const [open, setOpen] = useState(false); const [form, setForm] = useState({ date: "2026-09-26", time: "18:00", home: "", away: "", category: "", role: "Árbitro", venue: "", gross: "0" });
  const [rateMessage, setRateMessage] = useState("");
  const set = (key: string, value: string) => { setForm((f) => ({ ...f, [key]: value })); if (key === "category" || key === "role") setRateMessage(""); };
  const importRate = () => { const savedRate = findSavedRate(rates, form.category, form.role); if (!savedRate) { setRateMessage("No hay una tarifa guardada para esa categoría y función."); return; } setForm((current) => ({ ...current, gross: String(savedRate.amount) })); setRateMessage(`Tarifa importada: ${money(savedRate.amount)}`); };
  const changeOpen = (nextOpen: boolean) => { if (!nextOpen) setRateMessage(""); setOpen(nextOpen); };
  const submit = () => { if (!form.home.trim() || !form.away.trim()) return; const match: Match = { id: makeId(), competition, ...form, category: form.category.trim() || "Sin categoría", role: form.role.trim() || "Árbitro", gross: Math.max(0, Number(form.gross) || 0), diets: 0, retention: RETENTION_RATE, partners: [], video: false, status: "confirmado" }; onAdd(applySavedRate(match, rates)); setRateMessage(""); setOpen(false); };
  return <Dialog open={open} onOpenChange={changeOpen}><DialogTrigger asChild><Button className="primary-btn"><Plus /> Nuevo partido</Button></DialogTrigger><DialogContent className="dialog-card"><DialogHeader><DialogTitle>Añadir partido</DialogTitle><DialogDescription>Regístralo manualmente si todavía no tienes el PDF.</DialogDescription></DialogHeader><div className="form-grid">
    <label>Fecha<Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></label><label>Hora<Input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} /></label>
    <label>Equipo local<Input placeholder="Equipo local" value={form.home} onChange={(e) => set("home", e.target.value)} /></label><label>Equipo visitante<Input placeholder="Equipo visitante" value={form.away} onChange={(e) => set("away", e.target.value)} /></label>
    <label>Categoría<Input placeholder="Junior Autonómico" value={form.category} onChange={(e) => set("category", e.target.value)} /></label><label>Función<Input value={form.role} onChange={(e) => set("role", e.target.value)} /></label>
    <label className="wide">Pabellón<Input placeholder="Pabellón" value={form.venue} onChange={(e) => set("venue", e.target.value)} /></label><label>Tarifa bruta<Input type="number" min="0" step="0.01" value={form.gross} onChange={(e) => set("gross", e.target.value)} /></label>
    <div className="wide"><Button type="button" variant="outline" onClick={importRate}><CircleEuro /> Importar tarifa guardada</Button>{rateMessage && <p className="form-helper">{rateMessage}</p>}</div>
  </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button className="primary-btn" onClick={submit}>Guardar partido</Button></DialogFooter></DialogContent></Dialog>;
}

function EditMatchDialog({ match, rates, onSave }: { match: Match; rates: Rate[]; onSave: (match: Match) => void }) {
  const formFromMatch = (item: Match) => ({ date: item.date, time: item.time, home: item.home, away: item.away, category: item.category, role: item.role, venue: item.venue, gross: String(item.gross), diets: String(item.diets), partners: item.partners.join(", ") });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => formFromMatch(match));
  const [rateMessage, setRateMessage] = useState("");
  const set = (key: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [key]: value })); if (key === "category" || key === "role") setRateMessage(""); };
  const importRate = () => { const savedRate = findSavedRate(rates, form.category, form.role); if (!savedRate) { setRateMessage("No hay una tarifa guardada para esa categoría y función."); return; } setForm((current) => ({ ...current, gross: String(savedRate.amount) })); setRateMessage(`Tarifa importada: ${money(savedRate.amount)}`); };
  const changeOpen = (nextOpen: boolean) => { if (nextOpen) setForm(formFromMatch(match)); setRateMessage(""); setOpen(nextOpen); };
  const submit = () => {
    if (!form.home.trim() || !form.away.trim()) return;
    const updatedMatch: Match = {
      ...match,
      date: form.date,
      time: form.time,
      home: form.home.trim(),
      away: form.away.trim(),
      category: form.category.trim() || "Sin categoría",
      role: form.role.trim() || "Árbitro",
      venue: form.venue.trim(),
      gross: Math.max(0, Number(form.gross) || 0),
      diets: Math.max(0, Number(form.diets) || 0),
      retention: RETENTION_RATE,
      partners: form.partners.split(",").map((partner) => partner.trim()).filter(Boolean),
    };
    onSave(applySavedRate(updatedMatch, rates));
    setOpen(false);
  };
  return <Dialog open={open} onOpenChange={changeOpen}><DialogTrigger asChild><button aria-label={`Editar ${match.home} contra ${match.away}`} title="Editar partido"><Pencil /></button></DialogTrigger><DialogContent className="dialog-card"><DialogHeader><DialogTitle>Editar partido</DialogTitle><DialogDescription>Actualiza la designación y añade los compañeros separados por comas.</DialogDescription></DialogHeader><div className="form-grid">
    <label>Fecha<Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></label><label>Hora<Input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} /></label>
    <label>Equipo local<Input value={form.home} onChange={(e) => set("home", e.target.value)} /></label><label>Equipo visitante<Input value={form.away} onChange={(e) => set("away", e.target.value)} /></label>
    <label>Categoría<Input value={form.category} onChange={(e) => set("category", e.target.value)} /></label><label>Función<Input value={form.role} onChange={(e) => set("role", e.target.value)} /></label>
    <label className="wide">Pabellón<Input value={form.venue} onChange={(e) => set("venue", e.target.value)} /></label>
    <label>Tarifa bruta<Input type="number" min="0" step="0.01" value={form.gross} onChange={(e) => set("gross", e.target.value)} /></label><label>Dietas<Input type="number" min="0" step="0.01" value={form.diets} onChange={(e) => set("diets", e.target.value)} /></label>
    <div className="wide"><Button type="button" variant="outline" onClick={importRate}><CircleEuro /> Importar tarifa guardada</Button>{rateMessage && <p className="form-helper">{rateMessage}</p>}</div>
    <label className="wide">Compañeros · separados por comas<Input value={form.partners} onChange={(e) => set("partners", e.target.value)} placeholder="Ana López, Carlos Ruiz" /></label>
  </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button className="primary-btn" onClick={submit}>Guardar cambios</Button></DialogFooter></DialogContent></Dialog>;
}

function VideoDialog({ matches, onAdd }: { matches: Match[]; onAdd: (game: RecordedGame) => void }) {
  const [open, setOpen] = useState(false); const [title, setTitle] = useState(""); const [url, setUrl] = useState(""); const [matchId, setMatchId] = useState(""); const [error, setError] = useState("");
  const chooseMatch = (id: string) => { setMatchId(id); const match = matches.find((item) => item.id === id); if (match && !title.trim()) setTitle(`${match.home} – ${match.away}`); };
  const submit = () => { const youtubeId = parseYouTubeId(url); if (!youtubeId) { setError("Introduce un enlace válido de YouTube."); return; } const cleanTitle = title.trim() || "Partido grabado"; const linkedMatchId = matchId || findMatchForVideoTitle(cleanTitle, matches)?.id; onAdd({ id: makeId(), title: cleanTitle, youtubeUrl: url.trim(), youtubeId, matchId: linkedMatchId || undefined, createdAt: new Date().toISOString(), annotations: [] }); setTitle(""); setUrl(""); setMatchId(""); setError(""); setOpen(false); };
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="primary-btn"><Plus /> Añadir vídeo</Button></DialogTrigger><DialogContent className="dialog-card"><DialogHeader><DialogTitle>Añadir partido grabado</DialogTitle><DialogDescription>Pega el enlace de YouTube. RefFlow intentará relacionarlo con uno de tus partidos.</DialogDescription></DialogHeader><div className="video-form"><label>Partido correspondiente<NativeSelect className="w-full" value={matchId} onChange={(event) => chooseMatch(event.target.value)}><NativeSelectOption value="">Detectar automáticamente por el título</NativeSelectOption>{matches.map((match) => <NativeSelectOption key={match.id} value={match.id}>{match.home} – {match.away} · {dateLabel(match.date)}</NativeSelectOption>)}</NativeSelect></label><label>Título del partido<Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="CB Toledo – Baloncesto Talavera" /></label><label>Enlace de YouTube<Input value={url} onChange={(e) => { setUrl(e.target.value); setError(""); }} placeholder="https://www.youtube.com/watch?v=…" /></label>{error && <p className="form-error">{error}</p>}</div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button className="primary-btn" onClick={submit}>Añadir y analizar</Button></DialogFooter></DialogContent></Dialog>;
}

type YouTubePlayer = { getCurrentTime: () => number; seekTo: (seconds: number, allowSeekAhead: boolean) => void; destroy: () => void };
type YouTubeWindow = Window & { YT?: { Player: new (element: HTMLElement, options: { videoId: string; playerVars: Record<string, number>; events: { onReady: () => void } }) => YouTubePlayer }; onYouTubeIframeAPIReady?: () => void };

export default function RefFlow() {
  const [view, setView] = useState<View>("inicio"); const [data, setData] = useState<AppData>(sampleData); const [loaded, setLoaded] = useState(false);
  const [viewer, setViewer] = useState<Viewer | null>(null); const [authState, setAuthState] = useState<"loading" | "authenticated" | "anonymous">("loading");
  const [legacyMigrationNeeded, setLegacyMigrationNeeded] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login"); const [authEmail, setAuthEmail] = useState(""); const [authPassword, setAuthPassword] = useState(""); const [authName, setAuthName] = useState(""); const [authBusy, setAuthBusy] = useState(false); const [authMessage, setAuthMessage] = useState("");
  const [usernameDraft, setUsernameDraft] = useState(""); const [profileMessage, setProfileMessage] = useState(""); const [profileBusy, setProfileBusy] = useState(false); const profileFileRef = useRef<HTMLInputElement>(null);
  const [saveState, setSaveState] = useState<"guardando" | "guardado" | "error">("guardando"); const [menuOpen, setMenuOpen] = useState(false); const [search, setSearch] = useState("");
  const [pdfState, setPdfState] = useState<"idle" | "reading" | "ready" | "error">("idle"); const [pdfImport, setPdfImport] = useState<ParsedDesignationPdf | null>(null); const [pdfFileName, setPdfFileName] = useState(""); const [pdfError, setPdfError] = useState(""); const [notice, setNotice] = useState(""); const fileRef = useRef<HTMLInputElement>(null);
  const [selectedGameId, setSelectedGameId] = useState(""); const [manualMinute, setManualMinute] = useState(0); const [manualSecond, setManualSecond] = useState(0); const [annotationNote, setAnnotationNote] = useState(""); const [playerReady, setPlayerReady] = useState(false); const [analysisFullscreen, setAnalysisFullscreen] = useState(false);
  const playerMountRef = useRef<HTMLDivElement>(null); const playerRef = useRef<YouTubePlayer | null>(null); const analysisStageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    const loadSession = async (session: Session | null) => {
      if (!active) return;
      if (!session) {
        setViewer(null);
        setLegacyMigrationNeeded(false);
        setAuthState("anonymous");
        setLoaded(true);
        return;
      }

      try {
        setAuthState("loading");
        const user = session.user;
        const email = user.email || "";
        const metadataName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
        const currentViewer: Viewer = { userId: user.id, email, displayName: metadataName || email, fullName: metadataName || null };
        const [{ data: stored, error: readError }, { data: profile, error: profileError }] = await Promise.all([
          supabase.from("user_states").select("payload").eq("user_id", user.id).maybeSingle(),
          supabase.from("profiles").select("username").eq("user_id", user.id).maybeSingle(),
        ]);
        if (readError) throw readError;
        if (profileError) throw profileError;

        let state = stored?.payload as AppData | null | undefined;
        let requiresLegacyLink = false;
        if (!state) {
          const legacyResponse = await fetch("/api/legacy-state", { headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null);
          if (legacyResponse?.ok) {
            const legacy = await legacyResponse.json() as { state?: AppData | null };
            state = legacy.state || null;
          } else if (window.location.hostname.endsWith(".chatgpt.site")) {
            requiresLegacyLink = true;
          }
        }

        const savedState = state
          ? { ...sampleData, ...state, dataVersion: state.dataVersion ?? 0, recordedGames: state.recordedGames || [] }
          : emptyData(metadataName || email.split("@")[0] || "Árbitro");
        const normalized = normalizeData(savedState);
        normalized.settings.username = profile?.username || normalized.settings.username;
        normalized.matches = normalized.matches.map((match) => match.gross > 0 ? match : applySavedRate(match, normalized.rates));

        if (!stored && !requiresLegacyLink) {
          const { error: createError } = await supabase.from("user_states").upsert({
            user_id: user.id,
            email,
            display_name: normalized.settings.name || metadataName || email,
            payload: normalized,
            updated_at: new Date().toISOString(),
          });
          if (createError) throw createError;
        }

        if (!active) return;
        setViewer(currentViewer);
        setData(normalized);
        setUsernameDraft(normalized.settings.username);
        setLegacyMigrationNeeded(requiresLegacyLink);
        setSaveState("guardado");
        setAuthState("authenticated");
      } catch {
        if (!active) return;
        setAuthState("anonymous");
        setNotice("No se pudieron cargar tus datos. Inténtalo de nuevo.");
      } finally {
        if (active) setLoaded(true);
      }
    };

    void supabase.auth.getSession().then(({ data: sessionData }) => loadSession(sessionData.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "INITIAL_SESSION") void loadSession(session);
    });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!loaded || authState !== "authenticated" || !viewer || legacyMigrationNeeded) return;
    const t = setTimeout(() => {
      setSaveState("guardando");
      void (async () => {
        try {
          const { error } = await supabase.from("user_states").upsert({
            user_id: viewer.userId,
            email: viewer.email,
            display_name: data.settings.name || viewer.displayName,
            payload: data,
            updated_at: new Date().toISOString(),
          });
          if (error) throw error;
          setSaveState("guardado");
        } catch {
          setSaveState("error");
        }
      })();
    }, 500);
    return () => clearTimeout(t);
  }, [data, loaded, authState, viewer, legacyMigrationNeeded]);
  useEffect(() => { const context = (document as unknown as { modelContext?: { registerTool: (tool: unknown, options?: { signal: AbortSignal }) => void | Promise<void> } }).modelContext; if (!context?.registerTool) return; const lifecycle = new AbortController(); void Promise.resolve(context.registerTool({ name: "list_matches", title: "Ver partidos", description: "Devuelve los partidos registrados en RefFlow.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => ({ matches: data.matches.map(({ id, competition, date, time, home, away, category }) => ({ id, competition, date, time, home, away, category })) }) }, { signal: lifecycle.signal })).catch(() => undefined); return () => lifecycle.abort(); }, [data.matches]);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const weekStartDate = new Date(today); weekStartDate.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekEndDate = new Date(weekStartDate); weekEndDate.setDate(weekStartDate.getDate() + 6);
  const weekStart = localIsoDate(weekStartDate); const weekEnd = localIsoDate(weekEndDate);
  const monthPrefix = localIsoDate(today).slice(0, 7);
  const monthLabel = capitalize(new Intl.DateTimeFormat("es-ES", { month: "long" }).format(today));
  const todayLabel = capitalize(new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(today));
  const nextMatches = data.matches.filter((m) => new Date(`${m.date}T${m.time}:00`) >= now).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const weekMatches = data.matches.filter((m) => m.date >= weekStart && m.date <= weekEnd);
  const total = data.matches.reduce((s, m) => s + net(m), 0); const monthTotal = data.matches.filter((m) => m.date.startsWith(monthPrefix)).reduce((s, m) => s + net(m), 0); const weekTotal = weekMatches.reduce((s, m) => s + net(m), 0);
  const goalProgress = data.settings.earningsGoal > 0 ? Math.round(monthTotal / data.settings.earningsGoal * 100) : (monthTotal > 0 ? 100 : 0);
  const regionalMatches = data.matches.filter((m) => m.competition === "regional");
  const schoolMatches = data.matches.filter((m) => m.competition === "escolar");
  const regionalTotal = regionalMatches.reduce((sum, match) => sum + net(match), 0);
  const schoolTotal = schoolMatches.reduce((sum, match) => sum + net(match), 0);
  const activeCompetition: MatchCompetition = view === "escolares" ? "escolar" : "regional";
  const normalizedSearch = normalizeRateField(search);
  const filtered = data.matches.filter((m) => m.competition === activeCompetition && normalizeRateField(`${m.home} ${m.away} ${m.category} ${m.venue}`).includes(normalizedSearch));
  const updateMatch = (id: string, patch: Partial<Match>) => setData((d) => ({ ...d, matches: d.matches.map((m) => m.id === id ? { ...m, ...patch } : m) }));
  const recordedGames = data.recordedGames || []; const selectedGame = recordedGames.find((game) => game.id === selectedGameId) || recordedGames[0];
  const pdfOfficials = pdfImport ? uniqueImportedOfficials(pdfImport) : [];
  const pdfNewOfficials = pdfOfficials.filter((official) => !data.contacts.some((contact) => sameContact(contact, official)));

  useEffect(() => { if (!selectedGame && selectedGameId) queueMicrotask(() => setSelectedGameId("")); if (selectedGame && !selectedGameId) queueMicrotask(() => setSelectedGameId(selectedGame.id)); }, [selectedGame, selectedGameId]);
  useEffect(() => { const onFullscreenChange = () => { if (document.fullscreenElement === analysisStageRef.current) setAnalysisFullscreen(true); else if (!document.fullscreenElement) setAnalysisFullscreen(false); }; document.addEventListener("fullscreenchange", onFullscreenChange); return () => document.removeEventListener("fullscreenchange", onFullscreenChange); }, []);
  useEffect(() => { if (!analysisFullscreen) return; const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previous; }; }, [analysisFullscreen]);
  useEffect(() => {
    if (view !== "grabados" || !selectedGame?.youtubeId || !playerMountRef.current) return;
    let cancelled = false; setPlayerReady(false); playerRef.current?.destroy(); playerMountRef.current.innerHTML = "";
    const createPlayer = () => { const ytWindow = window as YouTubeWindow; if (cancelled || !ytWindow.YT?.Player || !playerMountRef.current) return; playerRef.current = new ytWindow.YT.Player(playerMountRef.current, { videoId: selectedGame.youtubeId, playerVars: { rel: 0, modestbranding: 1, playsinline: 1 }, events: { onReady: () => setPlayerReady(true) } }); };
    const ytWindow = window as YouTubeWindow;
    if (ytWindow.YT?.Player) createPlayer(); else { const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]'); ytWindow.onYouTubeIframeAPIReady = createPlayer; if (!existing) { const script = document.createElement("script"); script.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(script); } }
    return () => { cancelled = true; playerRef.current?.destroy(); playerRef.current = null; };
  }, [selectedGame?.id, selectedGame?.youtubeId, view]);

  const currentSeconds = () => playerReady && playerRef.current ? Math.floor(playerRef.current.getCurrentTime()) : Math.max(0, manualMinute * 60 + manualSecond);
  const addAnnotation = (category: string, label: string) => {
    if (!selectedGame) return; const seconds = currentSeconds(); const item: VideoAnnotation = { id: makeId(), seconds, category, label, note: annotationNote.trim(), createdAt: new Date().toISOString() };
    setData((d) => ({ ...d, recordedGames: (d.recordedGames || []).map((game) => game.id === selectedGame.id ? { ...game, annotations: [...game.annotations, item].sort((a, b) => a.seconds - b.seconds) } : game) })); setAnnotationNote(""); setManualMinute(Math.floor(seconds / 60)); setManualSecond(seconds % 60);
  };
  const seekTo = (seconds: number) => { const replayFrom = Math.max(0, seconds - 3); playerRef.current?.seekTo(replayFrom, true); setManualMinute(Math.floor(replayFrom / 60)); setManualSecond(replayFrom % 60); };
  const toggleAnalysisFullscreen = async () => {
    if (analysisFullscreen) { if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined); setAnalysisFullscreen(false); return; }
    setAnalysisFullscreen(true); await analysisStageRef.current?.requestFullscreen?.().catch(() => undefined);
  };
  const exportVideoReport = async () => {
    if (!selectedGame || selectedGame.annotations.length === 0) return;
    const [{ jsPDF }, logoData] = await Promise.all([import("jspdf"), assetDataUrl("/icon-192.png")]); const doc = new jsPDF({ unit: "mm", format: "a4" }); const pageWidth = doc.internal.pageSize.getWidth(); const pageHeight = doc.internal.pageSize.getHeight(); const annotations = [...selectedGame.annotations].sort((a, b) => a.seconds - b.seconds); const generatedAt = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short" }).format(new Date());
    const drawHeader = (continued = false) => { doc.setFillColor(7, 21, 45); doc.rect(0, 0, pageWidth, 38, "F"); doc.setFillColor(11, 92, 255); doc.rect(0, 38, pageWidth, 2, "F"); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(19); doc.text("REFFLOW", 16, 16); doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(193, 211, 238); doc.text(continued ? "INFORME DE ANÁLISIS ARBITRAL · CONTINUACIÓN" : "INFORME DE ANÁLISIS ARBITRAL", 16, 26); doc.setFillColor(255, 255, 255); doc.roundedRect(pageWidth - 34, 5, 25, 25, 5, 5, "F"); doc.addImage(logoData, "PNG", pageWidth - 31.5, 7.5, 20, 20); };
    const drawSectionTitle = (title: string, y: number) => { doc.setTextColor(11, 92, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text(title, 16, y); doc.setDrawColor(211, 222, 238); doc.line(16, y + 3, pageWidth - 16, y + 3); };
    drawHeader(); doc.setFillColor(246, 249, 253); doc.roundedRect(14, 48, 182, 33, 4, 4, "F"); doc.setTextColor(117, 132, 153); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.text("PARTIDO", 19, 56); doc.setTextColor(15, 35, 64); doc.setFontSize(13); doc.text(doc.splitTextToSize(selectedGame.title, 112) as string[], 19, 64); doc.setTextColor(117, 132, 153); doc.setFontSize(7.5); doc.text("ÁRBITRO", 137, 56); doc.text("ANOTACIONES", 137, 70); doc.setTextColor(15, 35, 64); doc.setFontSize(10); doc.text(data.settings.name || "Sin indicar", 137, 62); doc.setFontSize(11); doc.text(String(annotations.length), 137, 77);
    doc.setFillColor(238, 244, 255); doc.roundedRect(14, 87, 182, 26, 4, 4, "F"); doc.setTextColor(11, 92, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text("VÍDEO ORIGINAL", 19, 95); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); const videoLines = doc.splitTextToSize(selectedGame.youtubeUrl, 165) as string[]; videoLines.slice(0, 2).forEach((line, index) => doc.textWithLink(line, 19, 102 + index * 4.5, { url: selectedGame.youtubeUrl })); doc.setTextColor(99, 115, 137); doc.setFontSize(7.5); doc.text(`Informe generado el ${generatedAt}`, 19, 120); drawSectionTitle("LÍNEA DE TIEMPO · PULSA EN EL MINUTO PARA ABRIR 3 SEGUNDOS ANTES", 130); let y = 140;
    annotations.forEach((annotation, index) => { const labelLines = doc.splitTextToSize(annotation.label, 111) as string[]; const noteLines = annotation.note ? doc.splitTextToSize(annotation.note, 111) as string[] : []; const blockHeight = Math.max(21, 11 + labelLines.length * 4.7 + noteLines.length * 4); if (y + blockHeight > pageHeight - 18) { doc.addPage(); drawHeader(true); drawSectionTitle("LÍNEA DE TIEMPO", 50); y = 60; } const color = annotationGroups.find((group) => group.name === annotation.category)?.color || "#0b5cff"; const rgb = color.match(/[a-f\d]{2}/gi)?.map((part) => parseInt(part, 16)) || [11, 92, 255]; doc.setFillColor(index % 2 === 0 ? 248 : 244, index % 2 === 0 ? 250 : 247, index % 2 === 0 ? 253 : 251); doc.roundedRect(14, y - 5, 182, blockHeight, 3, 3, "F"); doc.setFillColor(rgb[0], rgb[1], rgb[2]); doc.roundedRect(14, y - 5, 3, blockHeight, 1.5, 1.5, "F"); doc.setTextColor(11, 92, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.textWithLink(timeLabel(annotation.seconds), 22, y + 3, { url: videoAt(selectedGame, annotation.seconds) }); doc.setTextColor(124, 137, 155); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.text(`ABRE EN ${timeLabel(Math.max(0, annotation.seconds - 3))}`, 22, y + 9); doc.setTextColor(rgb[0], rgb[1], rgb[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.text(annotation.category.toUpperCase(), 58, y); doc.setTextColor(20, 39, 67); doc.setFontSize(10); doc.text(labelLines, 58, y + 6); if (noteLines.length) { doc.setTextColor(99, 113, 133); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.text(noteLines, 58, y + 6 + labelLines.length * 4.7); } doc.setTextColor(150, 160, 174); doc.setFontSize(7.5); doc.text(String(index + 1).padStart(2, "0"), 189, y + 2, { align: "right" }); y += blockHeight + 4; });
    const pages = doc.getNumberOfPages(); for (let page = 1; page <= pages; page++) { doc.setPage(page); doc.setDrawColor(224, 230, 239); doc.line(16, pageHeight - 13, pageWidth - 16, pageHeight - 13); doc.setTextColor(132, 143, 159); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.text("RefFlow · Análisis de vídeo arbitral", 16, pageHeight - 7); doc.text(`Página ${page} de ${pages}`, pageWidth - 16, pageHeight - 7, { align: "right" }); } const safeTitle = selectedGame.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, ""); doc.save(`RefFlow_Analisis_${safeTitle || "Partido"}.pdf`);
  };

  const importPdf = async (file?: File) => {
    if (!file) return;
    const looksLikePdf = file.type === "application/pdf" || file.name.toLocaleLowerCase("es-ES").endsWith(".pdf");
    if (!looksLikePdf) { setPdfError("El archivo seleccionado no es un PDF."); setPdfState("error"); return; }
    if (file.size > 20 * 1024 * 1024) { setPdfError("El PDF supera el límite de 20 MB."); setPdfState("error"); return; }
    setPdfState("reading"); setPdfImport(null); setPdfFileName(file.name); setPdfError("");
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).pathname;
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const pages: PdfTextItem[][] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const content = await (await pdf.getPage(pageNumber)).getTextContent();
        pages.push(content.items.flatMap((item) => {
          if (!("str" in item) || !item.str.trim()) return [];
          return [{ page: pageNumber, x: item.transform[4], y: item.transform[5], text: item.str }];
        }));
      }
      const parsed = parseFbclmDesignationPages(pages);
      if (parsed.matches.length === 0) throw new Error("FORMATO_NO_RECONOCIDO");
      setPdfImport(parsed); setPdfState("ready");
    } catch (error) {
      console.error("[RefFlow PDF] No se pudo analizar la designación", error);
      setPdfImport(null);
      setPdfError(error instanceof Error && error.message === "FORMATO_NO_RECONOCIDO" ? "El PDF se abre correctamente, pero su formato de designaciones no coincide con el de FBCLM." : "No se pudo abrir el lector de PDF. Recarga la página e inténtalo otra vez.");
      setPdfState("error");
    }
  };
  const addPdfDesignations = (competition: MatchCompetition) => {
    if (!pdfImport) return;
    const officials = uniqueImportedOfficials(pdfImport);
    const mergedContacts = mergeImportedOfficials(data.contacts, officials);
    const existingKeys = new Set(data.matches.map((match) => match.matchNumber ? `number:${match.date}|${match.matchNumber}` : `teams:${match.date}|${match.time}|${normalizeRateField(match.home)}|${normalizeRateField(match.away)}`));
    let skipped = 0; let importedRates = 0;
    const matches = pdfImport.matches.flatMap((designation) => {
      const key = designation.matchNumber ? `number:${designation.date}|${designation.matchNumber}` : `teams:${designation.date}|${designation.time}|${normalizeRateField(designation.home)}|${normalizeRateField(designation.away)}`;
      if (existingKeys.has(key)) { skipped += 1; return []; }
      existingKeys.add(key);
      const partners = designation.officials.filter((official) => !pdfImport.designatedLicenseId || official.licenseId !== pdfImport.designatedLicenseId).map((official) => official.name);
      const match: Match = { id: makeId(), competition, matchNumber: designation.matchNumber, date: designation.date, time: designation.time, home: designation.home, away: designation.away, category: designation.category, role: designation.role, venue: designation.venue || "Pabellón pendiente", gross: 0, diets: 0, retention: RETENTION_RATE, partners, video: false, status: "confirmado" };
      if (findSavedRate(data.rates, match.category, match.role)) importedRates += 1;
      return [applySavedRate(match, data.rates)];
    });
    setData((current) => ({ ...current, matches: [...matches, ...current.matches], contacts: mergedContacts.contacts }));
    setView(competition === "escolar" ? "escolares" : "regionales");
    setNotice(`${matches.length} ${matches.length === 1 ? "designación añadida" : "designaciones añadidas"}${importedRates ? ` · ${importedRates} con tarifa importada` : ""}${mergedContacts.added ? ` · ${mergedContacts.added} compañeros nuevos en Árbitros` : ""}${mergedContacts.updated ? ` · ${mergedContacts.updated} contactos completados` : ""}${skipped ? ` · ${skipped} duplicadas omitidas` : ""}. Revisa los datos antes de añadir el partido al calendario.`);
    setPdfState("idle"); setPdfImport(null); setPdfFileName(""); setPdfError("");
    if (fileRef.current) fileRef.current.value = "";
  };
  const discardPdf = () => {
    setPdfState("idle"); setPdfImport(null); setPdfFileName(""); setPdfError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const exportExcel = async () => {
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    wb.creator = "RefFlow";
    // Preserve visible totals even in spreadsheet viewers that do not recalculate formulas on open.
    wb.calcProperties.fullCalcOnLoad = true;
    const months = ["SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE", "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO"];
    const nums = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
    months.forEach((month, index) => {
      const ws = wb.addWorksheet(month, { views: [{ state: "frozen", ySplit: 4 }] });
      ws.mergeCells("A1:J1");
      const title = ws.getCell("A1");
      title.value = `${month} · TEMPORADA ${data.settings.season}`;
      title.font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
      title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B5CFF" } };
      title.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(1).height = 34;
      ws.addRow([]);
      const year = nums[index] >= 9 ? 2026 : 2027;
      const monthMatches = data.matches.filter((match) => Number(match.date.slice(0, 4)) === year && Number(match.date.slice(5, 7)) === nums[index]);
      const addSection = (label: string, competition: MatchCompetition, sectionColor: string) => {
        const sectionRow = ws.addRow([label]);
        for (let col = 1; col <= 10; col += 1) {
          sectionRow.getCell(col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: sectionColor } };
          sectionRow.getCell(col).font = { bold: true, color: { argb: "FFFFFFFF" } };
        }
        ws.mergeCells(sectionRow.number, 1, sectionRow.number, 10);
        sectionRow.height = 26;
        sectionRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
        const header = ws.addRow(["FECHA", "HORA", "LOCAL", "VISITANTE", "CATEGORÍA", "FUNCIÓN", "TARIFA", "DIETAS", "TOTAL BRUTO", "TOTAL NETO"]);
        header.font = { bold: true, color: { argb: "FFFFFFFF" } };
        header.height = 28;
        header.eachCell((cell, col) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col <= 2 ? "FF29415F" : col <= 6 ? "FF0B5CFF" : col <= 8 ? "FFFF8A1D" : "FF16A085" } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        });
        const sectionMatches = monthMatches.filter((match) => match.competition === competition);
        const firstMatchRow = ws.rowCount + 1;
        sectionMatches.forEach((match) => ws.addRow([match.date, match.time, match.home, match.away, match.category, match.role, match.gross, match.diets, match.gross + match.diets, net(match)]));
        if (sectionMatches.length === 0) {
          const emptyRow = ws.addRow([`Sin partidos ${competition === "regional" ? "regionales" : "escolares"} este mes`]);
          emptyRow.font = { italic: true, color: { argb: "FF7D899B" } };
          ws.mergeCells(emptyRow.number, 1, emptyRow.number, 10);
        }
        const lastMatchRow = ws.rowCount;
        const grossTotalValue = sectionMatches.reduce((sum, match) => sum + match.gross + match.diets, 0);
        const netTotalValue = sectionMatches.reduce((sum, match) => sum + net(match), 0);
        const grossTotal = sectionMatches.length ? { formula: `SUM(I${firstMatchRow}:I${lastMatchRow})`, result: grossTotalValue } : 0;
        const netTotal = sectionMatches.length ? { formula: `SUM(J${firstMatchRow}:J${lastMatchRow})`, result: netTotalValue } : 0;
        const totalRow = ws.addRow(["", "", "", "", "", `TOTAL ${label}`, "", "", grossTotal, netTotal]);
        totalRow.font = { bold: true };
        totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F0FF" } };
        ws.addRow([]);
      };
      addSection("REGIONALES", "regional", "FF0B5CFF");
      addSection("ESCOLARES", "escolar", "FFF47B20");
      const monthlyGross = monthMatches.reduce((sum, match) => sum + match.gross + match.diets, 0);
      const monthlyNet = monthMatches.reduce((sum, match) => sum + net(match), 0);
      const monthlyTotalRow = ws.addRow(["", "", "", "", "", "TOTAL DEL MES", "", "", monthlyGross, monthlyNet]);
      monthlyTotalRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      monthlyTotalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF07152D" } };
      monthlyTotalRow.height = 28;
      [7, 8, 9, 10].forEach((col) => { ws.getColumn(col).numFmt = '#,##0.00 [$€-es-ES]'; });
      ws.columns = [{ width: 13 }, { width: 9 }, { width: 23 }, { width: 23 }, { width: 22 }, { width: 20 }, { width: 12 }, { width: 12 }, { width: 15 }, { width: 15 }];
    });
    const summary = wb.addWorksheet("RESUMEN");
    summary.columns = [{ width: 28 }, { width: 18 }];
    summary.addRow(["REFFLOW · RESUMEN", `Temporada ${data.settings.season}`]);
    summary.addRow([]);
    summary.addRow(["Esta semana", weekTotal]);
    summary.addRow(["Este mes", monthTotal]);
    summary.addRow(["Toda la temporada", total]);
    summary.addRow(["Partidos", data.matches.length]);
    summary.getRow(1).font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
    summary.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF07152D" } };
    [3, 4, 5].forEach((row) => { summary.getCell(row, 2).numFmt = '#,##0.00 [$€-es-ES]'; });
    const buffer = await wb.xlsx.writeBuffer();
    saveBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `RefFlow_Temporada_${data.settings.season.replace("/", "-")}.xlsx`);
  };

  const currentLabel = nav.find((item) => item.id === view)?.label;
  const saveUsername = async () => {
    if (!viewer) return;
    const username = normalizeUsername(usernameDraft);
    if (!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(username)) {
      setProfileMessage("Usa entre 3 y 24 caracteres: letras, números, punto, guion o guion bajo.");
      return;
    }
    setProfileBusy(true); setProfileMessage("");
    const { error } = await supabase.from("profiles").upsert({
      user_id: viewer.userId,
      username,
      email: viewer.email,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) {
      setProfileMessage(error.code === "23505" ? "Ese nombre de usuario ya está en uso." : "No se pudo guardar el nombre de usuario.");
    } else {
      setUsernameDraft(username);
      setData((current) => ({ ...current, settings: { ...current.settings, username } }));
      setProfileMessage("Nombre de usuario guardado. Ya puedes usarlo para iniciar sesión.");
    }
    setProfileBusy(false);
  };
  const changeProfileImage = async (file?: File) => {
    if (!file) return;
    setProfileBusy(true); setProfileMessage("");
    try {
      const profileImage = await resizeProfileImage(file);
      setData((current) => ({ ...current, settings: { ...current.settings, profileImage } }));
      setProfileMessage("Foto actualizada.");
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "No se pudo guardar la foto.");
    } finally {
      setProfileBusy(false);
      if (profileFileRef.current) profileFileRef.current.value = "";
    }
  };
  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage("");
    try {
      if (authMode === "signup") {
        const { data: result, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: { data: { full_name: authName.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!result.session) setAuthMessage("Cuenta creada. Revisa tu correo para confirmar el acceso y después vuelve a RefFlow.");
      } else {
        const identifier = authEmail.trim();
        if (identifier.includes("@")) {
          const { error } = await supabase.auth.signInWithPassword({ email: identifier, password: authPassword });
          if (error) throw error;
        } else {
          const { data: loginData, error: loginError } = await supabase.functions.invoke("login-with-username", { body: { username: normalizeUsername(identifier), password: authPassword } });
          if (loginError || !loginData?.access_token || !loginData?.refresh_token) throw new Error("Usuario/correo o contraseña incorrectos.");
          const { error: sessionError } = await supabase.auth.setSession({ access_token: loginData.access_token, refresh_token: loginData.refresh_token });
          if (sessionError) throw sessionError;
        }
      }
    } catch (error) {
      setAuthMessage(authMode === "login" ? "Usuario/correo o contraseña incorrectos." : error instanceof Error ? error.message : "No se pudo completar el acceso.");
    } finally {
      setAuthBusy(false);
    }
  };

  if (!loaded || authState === "loading") return <main className="auth-screen"><div className="auth-card loading-card"><img className="auth-logo" src="/favicon.svg" alt="RefFlow" /><h1>Cargando RefFlow…</h1><p>Preparando tu espacio privado.</p></div></main>;
  if (authState === "anonymous") return <main className="auth-screen"><section className="auth-card"><img className="auth-logo" src="/favicon.svg" alt="RefFlow" /><p className="auth-kicker">REFFLOW</p><h1>Tu arbitraje, organizado</h1><p className="auth-copy">Tus designaciones, ganancias y análisis estarán sincronizados en cualquier versión de RefFlow.</p><div className="auth-tabs"><button type="button" className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setAuthMessage(""); }}>Iniciar sesión</button><button type="button" className={authMode === "signup" ? "active" : ""} onClick={() => { setAuthMode("signup"); setAuthMessage(""); }}>Crear cuenta</button></div><form className="auth-form" onSubmit={submitAuth}>{authMode === "signup" && <label>Nombre completo<Input value={authName} onChange={(event) => setAuthName(event.target.value)} autoComplete="name" required /></label>}<label>{authMode === "login" ? "Correo o nombre de usuario" : "Correo electrónico"}<Input type={authMode === "login" ? "text" : "email"} value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} autoComplete="username" required /></label><label>Contraseña<Input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength={6} required /></label>{authMessage && <p className="auth-message">{authMessage}</p>}<button className="auth-button" type="submit" disabled={authBusy}>{authBusy ? "Comprobando…" : authMode === "signup" ? "Crear mi cuenta" : "Entrar"} <ChevronRight /></button></form><small>{authMode === "login" ? "Puedes entrar con tu nombre de usuario o con tu correo." : "La cuenta se crea con correo; después podrás elegir tu usuario en Ajustes."}</small></section></main>;
  const greetingName = (data.settings.name || viewer?.fullName || viewer?.displayName || "Árbitro").trim().split(/\s+/)[0];
  const initials = data.settings.name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "AP";
  return <div className="app-shell"><aside className={`sidebar ${menuOpen ? "open" : ""}`}><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X /></button><div className="brand"><img className="ball-logo" src="/favicon.svg" alt="" /><div><strong>RefFlow</strong><small>Temporada {data.settings.season}</small></div></div><nav>{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setMenuOpen(false); }}><Icon /><span>{label}</span>{view === id && <ChevronRight className="chev" />}</button>)}</nav><div className="sync-card"><span className={saveState === "error" ? "sync-dot error" : "sync-dot"} /><div><strong>{saveState === "guardando" ? "Guardando…" : saveState === "error" ? "Sin conexión" : "Todo guardado"}</strong><small>Sincronizado con Supabase</small></div></div><div className="profile"><span className="profile-avatar">{data.settings.profileImage ? <img src={data.settings.profileImage} alt="Foto de perfil" /> : initials}</span><div><strong>{data.settings.name}</strong><small>{data.settings.username ? `@${data.settings.username}` : viewer?.email}</small></div><button type="button" onClick={() => void supabase.auth.signOut()} aria-label="Cerrar sesión">Salir</button></div></aside>{menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" />}
    <main className="main-panel"><header className="topbar"><button className="menu-btn" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu /></button><div><p>RefFlow</p><h1>{currentLabel}</h1></div><div className="top-actions"><div className="search"><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar partido…" /></div>{view === "grabados" ? <VideoDialog matches={data.matches} onAdd={(game) => { setData((d) => ({ ...d, recordedGames: [...(d.recordedGames || []), game] })); setSelectedGameId(game.id); }} /> : <MatchDialog competition={activeCompetition} rates={data.rates} onAdd={(m) => setData((d) => ({ ...d, matches: [m, ...d.matches] }))} />}</div></header>{notice && <div className="notice"><ShieldCheck /><span>{notice}</span><button onClick={() => setNotice("")}><X /></button></div>}{legacyMigrationNeeded && <div className="notice legacy-notice"><ShieldCheck /><span>¿Ya usabas RefFlow? Conecta una vez tu acceso anterior para recuperar tus datos.</span><a href="/signin-with-chatgpt?return_to=%2F" target="_top">Recuperar datos</a><button onClick={() => setLegacyMigrationNeeded(false)}>Empezar sin datos anteriores</button></div>}

      {view === "inicio" && <section className="content dashboard"><div className="welcome"><div><p>{todayLabel}</p><h2>Hola, {greetingName} <span>👋</span></h2><small>Tienes {nextMatches.length} designaciones próximas.</small></div><button onClick={() => setView("importar")}><UploadCloud /> Importar designaciones</button></div><div className="kpi-grid"><article className="kpi primary"><div><span>ESTA SEMANA</span><strong>{money(weekTotal)}</strong><small>{matchCountLabel(weekMatches.length)}</small></div><div className="kpi-icon"><WalletCards /></div></article><article className="kpi"><div><span>ESTE MES</span><strong>{money(monthTotal)}</strong><small>{monthLabel}</small></div><div className="kpi-icon orange"><BarChart3 /></div></article><article className="kpi"><div><span>TEMPORADA</span><strong>{money(total)}</strong><small>{matchCountLabel(data.matches.length)}</small></div><div className="kpi-icon green"><Trophy /></div></article></div><div className="dashboard-grid"><section className="panel upcoming"><div className="panel-heading"><div><p>PRÓXIMAS DESIGNACIONES</p><h3>Tu fin de semana</h3></div><button onClick={() => setView("regionales")}>Ver regionales <ChevronRight /></button></div>{nextMatches.slice(0,3).map((m, i) => <article className={`match-row ${i === 0 ? "featured" : ""}`} key={m.id}><div className="date-box"><strong>{new Date(`${m.date}T12:00`).getDate()}</strong><span>{new Intl.DateTimeFormat("es-ES", { month: "short" }).format(new Date(`${m.date}T12:00`)).toUpperCase()}</span></div><div className="match-main"><span className="category">{m.category}</span><h4>{m.home} <em>vs</em> {m.away}</h4><p><Clock3 /> {m.time} <MapPin /> {m.venue}</p></div><div className="match-side"><strong>{money(net(m))}</strong><span>Neto estimado</span><button onClick={() => googleCalendar(m)}><CalendarDays /> Calendario</button></div></article>)}</section><aside className="side-stack"><section className="panel earnings"><div className="panel-heading"><div><p>GANANCIAS</p><h3>{monthLabel}</h3></div><CircleEuro /></div><div className="ring"><div><strong>{goalProgress}%</strong><span>del objetivo</span></div></div><div className="earn-row"><span>Cobrado</span><strong>{money(monthTotal)}</strong></div><div className="earn-row"><span>Objetivo</span><strong>{money(data.settings.earningsGoal)}</strong></div><button onClick={() => setView("ganancias")}>Ver desglose <ChevronRight /></button></section><section className="excel-card"><div className="excel-icon"><FileSpreadsheet /></div><div><h3>Excel de temporada</h3><p>Genera tu hoja actualizada con todos los meses.</p><button onClick={exportExcel}><Download /> Descargar .xlsx</button></div></section></aside></div></section>}

      {view === "importar" && <section className="content narrow"><div className="section-intro"><p>IMPORTAR DESIGNACIONES</p><h2>Sube el PDF de la federación</h2><span>RefFlow detectará cada partido y los colegiados de su ficha detallada.</span></div><input ref={fileRef} hidden type="file" accept="application/pdf,.pdf" onChange={(e) => void importPdf(e.target.files?.[0])} /><button type="button" className={`drop-zone ${pdfState}`} onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void importPdf(e.dataTransfer.files[0]); }}><span className="drop-icon"><FileUp /></span><strong>{pdfState === "reading" ? "Analizando partidos y colegiados…" : pdfState === "ready" ? "Designaciones detectadas" : pdfState === "error" ? "No se pudo analizar el PDF" : "Arrastra aquí el PDF de designaciones"}</strong><small>{pdfState === "ready" ? `${pdfFileName} · revisa el resultado antes de importar` : pdfState === "error" ? pdfError : "o pulsa para seleccionarlo · máximo 20 MB"}</small><span className="fake-button">{pdfState === "ready" ? "Elegir otro PDF" : pdfState === "error" ? "Volver a intentarlo" : "Seleccionar PDF"}</span></button>{pdfState === "ready" && pdfImport && <div className="panel pdf-result"><div className="panel-heading"><div><p>REVISIÓN PREVIA</p><h3>{pdfImport.matches.length} {pdfImport.matches.length === 1 ? "designación detectada" : "designaciones detectadas"}</h3></div><span className="pdf-ready-icon"><Check /></span></div><div className="pdf-summary-grid"><div><strong>{pdfImport.matches.length}</strong><span>Partidos</span></div><div><strong>{pdfOfficials.length}</strong><span>Compañeros</span></div><div><strong>{pdfNewOfficials.length}</strong><span>Nuevos en Árbitros</span></div></div><div className="pdf-match-list">{pdfImport.matches.map((match) => { const savedRate = findSavedRate(data.rates, match.category, match.role); return <article className="pdf-match-card" key={`${match.matchNumber}-${match.date}-${match.time}`}><div className="pdf-match-date"><strong>{new Date(`${match.date}T12:00:00`).getDate()}</strong><span>{new Intl.DateTimeFormat("es-ES", { month: "short" }).format(new Date(`${match.date}T12:00:00`)).toUpperCase()}</span></div><div className="pdf-match-main"><div className="pdf-match-top"><span>PARTIDO {match.matchNumber}</span><small>{match.time}</small></div><h4>{match.home} <em>vs</em> {match.away}</h4><p>{match.category} · {match.role}</p><small>{match.officials.length} colegiados en la ficha</small></div><span className={`pdf-rate ${savedRate ? "found" : "pending"}`}>{savedRate ? `${money(savedRate.amount)} · tarifa encontrada` : "Tarifa pendiente"}</span></article>; })}</div><div className="pdf-contact-note"><Users /><div><strong>Agenda automática</strong><span>Al importar, se crearán los compañeros que todavía no existan con su nombre y teléfono. Los contactos ya guardados no se duplicarán.</span></div></div><div className="pdf-actions"><Button variant="outline" onClick={discardPdf}>Descartar</Button><Button variant="outline" onClick={() => addPdfDesignations("escolar")}>Añadir como escolares</Button><Button className="primary-btn" onClick={() => addPdfDesignations("regional")}>Añadir como regionales</Button></div></div>}<div className="info-strip"><ShieldCheck /><div><strong>Tu PDF permanece en este dispositivo</strong><span>Se analiza localmente y no se guarda ni se sube. Solo se sincronizan los partidos y contactos que confirmes.</span></div></div></section>}

      {(view === "regionales" || view === "escolares") && <section className="content"><div className="page-heading"><div><p>{view === "escolares" ? "PARTIDOS ESCOLARES" : "PARTIDOS REGIONALES"}</p><h2>Temporada {data.settings.season}</h2></div><MatchDialog competition={activeCompetition} rates={data.rates} onAdd={(m) => setData((d) => ({ ...d, matches: [m, ...d.matches] }))} /></div><div className="panel table-wrap"><table><thead><tr><th>Fecha</th><th>Partido</th><th>Categoría / función</th><th>Lugar</th><th>Neto</th><th>Acciones</th></tr></thead><tbody>{filtered.length === 0 ? <tr><td colSpan={6} className="empty-table">Aún no hay partidos {view === "escolares" ? "escolares" : "regionales"}.</td></tr> : filtered.sort((a,b) => b.date.localeCompare(a.date)).map((m) => { const recordedVideo = findRecordedGameForMatch(m, recordedGames); return <tr key={m.id}><td><strong>{dateLabel(m.date)}</strong><small>{m.time}</small></td><td><strong>{m.home}</strong><small>vs {m.away}{m.matchNumber ? ` · Nº ${m.matchNumber}` : ""}</small></td><td><span className="pill">{m.category}</span><small>{m.role}</small></td><td><span>{m.venue}</span><small>{m.partners.join(", ") || "Sin compañeros"}</small></td><td><strong>{money(net(m))}</strong><small>{money(m.gross + m.diets)} bruto</small></td><td><div className="row-actions"><button onClick={() => googleCalendar(m)} aria-label="Añadir a Google Calendar" title="Añadir a Google Calendar"><CalendarDays /></button><EditMatchDialog match={m} rates={data.rates} onSave={(updated) => updateMatch(m.id, updated)} /><button disabled={!recordedVideo} onClick={() => { if (!recordedVideo) return; setSelectedGameId(recordedVideo.id); setView("grabados"); }} className={recordedVideo ? "selected" : ""} aria-label={recordedVideo ? "Abrir vídeo del partido" : "No hay vídeo para este partido"} title={recordedVideo ? "Vídeo detectado · abrir análisis" : "No hay ningún vídeo correspondiente"}><Video /></button><button onClick={() => setData((d) => ({ ...d, matches: d.matches.filter((x) => x.id !== m.id) }))} aria-label="Eliminar partido" title="Eliminar partido"><X /></button></div></td></tr>; })}</tbody></table></div></section>}

      {view === "grabados" && <section className="content video-analysis-page"><div className="page-heading"><div><p>ANÁLISIS DE VÍDEO</p><h2>Partidos grabados</h2></div><VideoDialog matches={data.matches} onAdd={(game) => { setData((d) => ({ ...d, recordedGames: [...(d.recordedGames || []), game] })); setSelectedGameId(game.id); }} /></div>
        {recordedGames.length === 0 ? <div className="panel video-empty"><span><Video /></span><h3>Añade tu primer partido</h3><p>Pega un enlace de YouTube y podrás guardar acciones en el minuto y segundo exactos.</p><VideoDialog matches={data.matches} onAdd={(game) => { setData((d) => ({ ...d, recordedGames: [game] })); setSelectedGameId(game.id); }} /></div> : <div className="video-workspace">
          <aside className="panel video-library"><div className="video-library-title"><div><p>VÍDEOS</p><strong>{recordedGames.length} {recordedGames.length === 1 ? "partido" : "partidos"}</strong></div><Video /></div>{recordedGames.map((game) => <button key={game.id} className={selectedGame?.id === game.id ? "active" : ""} onClick={() => setSelectedGameId(game.id)}><span className="video-list-icon"><Play /></span><span><strong>{game.title}</strong><small>{game.annotations.length} anotaciones</small></span><ChevronRight /></button>)}</aside>
          {selectedGame && <div className="analyzer-main"><div ref={analysisStageRef} className={`analysis-stage ${analysisFullscreen ? "analysis-fullscreen" : ""}`}><section className="panel player-panel"><div className="player-heading"><div><p>ANALIZANDO</p><h3>{selectedGame.title}</h3></div><div className="player-heading-actions"><button className="fullscreen-toggle" onClick={toggleAnalysisFullscreen} aria-label={analysisFullscreen ? "Salir de pantalla completa" : "Analizar a pantalla completa"}>{analysisFullscreen ? <Minimize2 /> : <Maximize2 />}<span>{analysisFullscreen ? "Salir" : "Pantalla completa"}</span></button><a href={selectedGame.youtubeUrl} target="_blank" rel="noreferrer">Abrir en YouTube <ExternalLink /></a></div></div><div className="youtube-frame"><div ref={playerMountRef} /></div><div className="capture-bar"><div className="time-inputs"><TimerReset /><label>Min<input type="number" min="0" value={manualMinute} onChange={(e) => setManualMinute(Math.max(0, Number(e.target.value)))} /></label><span>:</span><label>Seg<input type="number" min="0" max="59" value={manualSecond} onChange={(e) => setManualSecond(Math.min(59, Math.max(0, Number(e.target.value))))} /></label></div><button onClick={() => { const seconds = currentSeconds(); setManualMinute(Math.floor(seconds / 60)); setManualSecond(seconds % 60); }}><Clock3 /> Capturar instante actual</button><strong>{timeLabel(manualMinute * 60 + manualSecond)}</strong></div><div className="note-box"><textarea value={annotationNote} onChange={(e) => setAnnotationNote(e.target.value)} placeholder="Nota opcional: qué ocurrió, posición, decisión…" /><button disabled={!annotationNote.trim()} onClick={() => addAnnotation("Nota libre", "Anotación")}>Guardar nota</button></div></section>
            <section className="panel quick-tags"><div className="panel-heading"><div><p>ANOTACIONES RÁPIDAS</p><h3>Pulsa para guardar en {playerReady ? "el instante actual" : timeLabel(manualMinute * 60 + manualSecond)}</h3></div><div className="quick-tags-tools"><Tag /><button className="quick-tags-exit" onClick={toggleAnalysisFullscreen} aria-label="Salir de pantalla completa"><Minimize2 /></button></div></div><div className="tag-groups">{annotationGroups.map((group) => <div className="tag-group" key={group.name} style={{ borderLeftColor: group.color }}><div className="tag-group-title"><span style={{ background: group.color }} /><strong>{group.name}</strong></div><div className="tag-buttons">{group.items.map((item) => <button key={item} onClick={() => addAnnotation(group.name, item)}><span style={{ background: group.color }} />{item}</button>)}</div></div>)}</div></section></div>
            <section className="panel annotations-panel"><div className="panel-heading"><div><p>LÍNEA DE TIEMPO</p><h3>{selectedGame.annotations.length} anotaciones</h3></div><div className="timeline-actions"><button className="report-button" onClick={exportVideoReport} disabled={selectedGame.annotations.length === 0}><FileText /> Finalizar y descargar PDF</button><Clock3 /></div></div>{selectedGame.annotations.length === 0 ? <div className="annotation-empty">Reproduce el vídeo y pulsa una etiqueta rápida para crear la primera anotación.</div> : <div className="annotation-list">{[...selectedGame.annotations].sort((a,b) => a.seconds - b.seconds).map((annotation) => <div className="annotation-row" key={annotation.id}><button className="timestamp" onClick={() => seekTo(annotation.seconds)} title="Reproducir desde 3 segundos antes" aria-label={`Reproducir ${annotation.label} desde 3 segundos antes`}><Play /> {timeLabel(annotation.seconds)}</button><span className="annotation-color" style={{ background: annotationGroups.find((group) => group.name === annotation.category)?.color || "#0b5cff" }} /><div><strong>{annotation.label}</strong><small>{annotation.category}{annotation.note ? ` · ${annotation.note}` : ""}</small></div><button className="annotation-delete" onClick={() => setData((d) => ({ ...d, recordedGames: (d.recordedGames || []).map((game) => game.id === selectedGame.id ? { ...game, annotations: game.annotations.filter((item) => item.id !== annotation.id) } : game) }))} aria-label="Eliminar anotación"><Trash2 /></button></div>)}</div>}</section>
          </div>}
        </div>}
      </section>}

      {view === "ganancias" && <section className="content"><div className="page-heading"><div><p>GANANCIAS</p><h2>Resumen económico</h2></div><Button className="primary-btn" onClick={exportExcel}><FileSpreadsheet /> Exportar Excel</Button></div><div className="kpi-grid"><article className="kpi primary"><div><span>ESTA SEMANA</span><strong>{money(weekTotal)}</strong><small>{matchCountLabel(weekMatches.length)} · Neto estimado</small></div><WalletCards /></article><article className="kpi"><div><span>ESTE MES</span><strong>{money(monthTotal)}</strong><small>{monthLabel}</small></div><BarChart3 /></article><article className="kpi"><div><span>TEMPORADA</span><strong>{money(total)}</strong><small>{data.matches.length} designaciones</small></div><Trophy /></article></div><div className="panel finance-list"><div className="panel-heading"><div><p>DESGLOSE GENERAL</p><h3>Ingresos por partido</h3></div></div>{data.matches.map((m) => <div className="finance-row" key={m.id}><div><strong>{m.home} – {m.away}</strong><small>{dateLabel(m.date)} · {m.category}</small></div><span>{money(m.gross)} tarifa + {money(m.diets)} dietas</span><strong>{money(net(m))}</strong></div>)}</div><div className="earnings-split">{[
        { key: "escolares", label: "Escolares", matches: schoolMatches, total: schoolTotal },
        { key: "regionales", label: "Regionales", matches: regionalMatches, total: regionalTotal },
      ].map((group) => <div className="panel finance-list" key={group.key}><div className="panel-heading"><div><p>GANANCIAS</p><h3>{group.label}</h3></div><div className="finance-heading-total"><strong>{money(group.total)}</strong><button onClick={() => setView(group.key as View)}>Ver partidos <ChevronRight /></button></div></div>{group.matches.length === 0 ? <div className="finance-empty">Aún no hay ingresos de partidos {group.label.toLowerCase()}.</div> : group.matches.map((m) => <div className="finance-row" key={m.id}><div><strong>{m.home} – {m.away}</strong><small>{dateLabel(m.date)} · {m.category}</small></div><span>{money(m.gross)} tarifa + {money(m.diets)} dietas</span><strong>{money(net(m))}</strong></div>)}</div>)}</div></section>}

      {view === "arbitros" && <section className="content"><div className="page-heading"><div><p>AGENDA</p><h2>Compañeros</h2></div><Button className="primary-btn" onClick={() => { const name = prompt("Nombre del árbitro"); if (name) setData((d) => ({ ...d, contacts: [...d.contacts, { id: makeId(), name, phone: "", role: "Árbitro" }] })); }}><Plus /> Añadir árbitro</Button></div>{data.contacts.length === 0 ? <div className="panel contacts-empty"><Users /><h3>Aún no hay compañeros</h3><p>Los árbitros y oficiales aparecerán aquí automáticamente cuando importes una designación.</p></div> : <div className="contact-grid">{data.contacts.map((c) => <article className="contact-card" key={c.id}><span className="avatar">{c.name.split(" ").map((x) => x[0]).slice(0,2).join("")}</span><div><h3>{c.name}</h3><p>{c.role}{c.city ? ` · ${c.city}` : ""}</p><span>{c.phone || "Teléfono pendiente"}</span></div><div className="contact-actions"><button onClick={() => { const phone = prompt("Número de teléfono", c.phone); if (phone !== null) setData((d) => ({ ...d, contacts: d.contacts.map((x) => x.id === c.id ? { ...x, phone } : x) })); }} aria-label={`Editar teléfono de ${c.name}`}><Pencil /></button><button disabled={!c.phone} onClick={() => window.open(`https://wa.me/34${c.phone.replace(/\D/g, "")}`, "_blank", "noopener,noreferrer")}><MessageCircle /> WhatsApp</button></div></article>)}</div>}</section>}

      {view === "tarifas" && <section className="content"><div className="page-heading"><div><p>TARIFAS</p><h2>Temporada {data.settings.season}</h2></div><Button className="primary-btn" onClick={() => setData((d) => ({ ...d, rates: [...d.rates, { id: makeId(), category: "Nueva categoría", role: "Árbitro", amount: 0, retention: RETENTION_RATE }] }))}><Plus /> Nueva tarifa</Button></div><div className="panel table-wrap"><table><thead><tr><th>Competición</th><th>Función</th><th>Tarifa</th><th>Retención</th><th>Neto</th><th></th></tr></thead><tbody>{data.rates.map((r) => <tr key={r.id}><td><Input value={r.category} onChange={(e) => setData((d) => ({ ...d, rates: d.rates.map((x) => x.id === r.id ? { ...x, category: e.target.value } : x) }))} /></td><td><Input value={r.role} onChange={(e) => setData((d) => ({ ...d, rates: d.rates.map((x) => x.id === r.id ? { ...x, role: e.target.value } : x) }))} /></td><td><Input type="number" step="0.01" value={r.amount} onChange={(e) => setData((d) => ({ ...d, rates: d.rates.map((x) => x.id === r.id ? { ...x, amount: Number(e.target.value) } : x) }))} /></td><td><Input type="number" value={RETENTION_RATE} readOnly aria-label="Retención fija del 2 por ciento" /></td><td><strong>{money(r.amount * (1 - RETENTION_RATE / 100))}</strong></td><td><button className="icon-delete" onClick={() => setData((d) => ({ ...d, rates: d.rates.filter((x) => x.id !== r.id) }))}><X /></button></td></tr>)}</tbody></table></div></section>}

      {view === "ajustes" && <section className="content narrow"><div className="section-intro"><p>AJUSTES</p><h2>Personaliza RefFlow</h2><span>Estos datos ayudan a identificarte en las designaciones y organizar la temporada.</span></div><div className="panel settings-form">
        <div className="settings-profile wide"><span className="settings-avatar">{data.settings.profileImage ? <img src={data.settings.profileImage} alt="Foto de perfil" /> : initials}</span><div><strong>Foto de perfil</strong><span>Se recorta automáticamente y solo se guarda en tu cuenta.</span><div className="settings-photo-actions"><input ref={profileFileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void changeProfileImage(event.target.files?.[0])} /><Button type="button" variant="outline" disabled={profileBusy} onClick={() => profileFileRef.current?.click()}><Camera /> {data.settings.profileImage ? "Cambiar foto" : "Añadir foto"}</Button>{data.settings.profileImage && <button type="button" className="text-action" onClick={() => { setData((current) => ({ ...current, settings: { ...current.settings, profileImage: "" } })); setProfileMessage("Foto eliminada."); }}>Eliminar</button>}</div></div></div>
        <label>Nombre tal como aparece en las designaciones<Input value={data.settings.name} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, name: e.target.value } }))} /></label>
        <label>Temporada<Input value={data.settings.season} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, season: e.target.value } }))} /></label>
        <label>Objetivo mensual de ganancias<Input type="number" min="0" step="10" value={data.settings.earningsGoal} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, earningsGoal: Math.max(0, Number(e.target.value) || 0) } }))} /><small>Se usa en el porcentaje de la pantalla de inicio.</small></label>
        <label>Nombre de usuario<div className="username-control"><Input value={usernameDraft} onChange={(e) => { setUsernameDraft(e.target.value); setProfileMessage(""); }} placeholder="mateo.garcia" autoComplete="username" /><Button type="button" disabled={profileBusy} onClick={() => void saveUsername()}>{profileBusy ? "Guardando…" : "Guardar usuario"}</Button></div><small>De 3 a 24 caracteres, sin espacios. Podrás iniciar sesión con este nombre o con tu correo.</small></label>
        {profileMessage && <p className="settings-message wide">{profileMessage}</p>}
        <div className="setting-row"><div><strong>Google Calendar</strong><span>Los botones de cada partido abren el evento listo para confirmar.</span></div><span className="status-ready"><Check /> Disponible</span></div><div className="setting-row"><div><strong>Instalar la aplicación</strong><span>En Android usa “Añadir a pantalla de inicio”; en Windows, “Instalar aplicación”.</span></div><span className="status-ready"><Check /> PWA lista</span></div>
      </div></section>}
    </main><nav className="bottom-nav">{nav.filter(({ id }) => ["inicio", "importar", "regionales", "escolares", "ganancias"].includes(id)).map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon /><span>{label}</span></button>)}</nav>
  </div>;
}
