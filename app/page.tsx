"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { BarChart3, CalendarDays, Check, ChevronRight, CircleEuro, Clock3, Download, ExternalLink, FileSpreadsheet, FileText, FileUp, Home, MapPin, Maximize2, Menu, MessageCircle, Minimize2, Pencil, Play, Plus, Search, Settings, ShieldCheck, Tag, TimerReset, Trash2, Trophy, UploadCloud, Users, Video, WalletCards, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";

type View = "inicio" | "importar" | "partidos" | "grabados" | "ganancias" | "arbitros" | "tarifas" | "ajustes";
type Match = { id: string; date: string; time: string; home: string; away: string; category: string; role: string; venue: string; gross: number; diets: number; retention: number; partners: string[]; video: boolean; status: "confirmado" | "pendiente" };
type Rate = { id: string; category: string; role: string; amount: number; retention: number };
type Contact = { id: string; name: string; phone: string; role: string };
type VideoAnnotation = { id: string; seconds: number; category: string; label: string; note: string; createdAt: string };
type RecordedGame = { id: string; title: string; youtubeUrl: string; youtubeId: string; createdAt: string; annotations: VideoAnnotation[] };
type AppData = { dataVersion: number; matches: Match[]; rates: Rate[]; contacts: Contact[]; recordedGames: RecordedGame[]; settings: { name: string; season: string } };
type Viewer = { userId: string; displayName: string; email: string; fullName: string | null };

const sampleData: AppData = {
  dataVersion: 1,
  matches: [
    { id: "p1", date: "2026-09-19", time: "18:30", home: "CB Toledo", away: "Baloncesto Talavera", category: "Junior Autonómico", role: "Árbitro auxiliar", venue: "Pabellón Javier Lozano Cid", gross: 32, diets: 8, retention: 2, partners: ["Álvaro Martín"], video: true, status: "confirmado" },
    { id: "p2", date: "2026-09-20", time: "12:00", home: "CEI Toledo", away: "CB La Sagra", category: "Infantil Regional", role: "Árbitro", venue: "Pabellón IES Universidad Laboral", gross: 24, diets: 0, retention: 2, partners: ["Lucía Gómez"], video: false, status: "confirmado" },
    { id: "p3", date: "2026-09-12", time: "17:00", home: "CB Mora", away: "Basket Azuqueca", category: "Cadete Regional", role: "Árbitro", venue: "Pabellón Municipal de Mora", gross: 27.5, diets: 6, retention: 2, partners: ["Álvaro Martín"], video: false, status: "confirmado" },
  ],
  rates: [
    { id: "t1", category: "Junior Autonómico", role: "Árbitro auxiliar", amount: 32, retention: 2 },
    { id: "t2", category: "Infantil Regional", role: "Árbitro", amount: 24, retention: 2 },
    { id: "t3", category: "Cadete Regional", role: "Árbitro", amount: 27.5, retention: 2 },
  ],
  contacts: [],
  recordedGames: [],
  settings: { name: "Árbitro", season: "2026/27" },
};
const emptyData = (name: string): AppData => ({ dataVersion: 1, matches: [], rates: [], contacts: [], recordedGames: [], settings: { name, season: "2026/27" } });

const nav: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "inicio", label: "Inicio", icon: Home }, { id: "importar", label: "Importar", icon: FileUp }, { id: "partidos", label: "Partidos", icon: CalendarDays }, { id: "grabados", label: "Partidos grabados", icon: Video },
  { id: "ganancias", label: "Ganancias", icon: BarChart3 }, { id: "arbitros", label: "Árbitros", icon: Users }, { id: "tarifas", label: "Tarifas", icon: CircleEuro }, { id: "ajustes", label: "Ajustes", icon: Settings },
];
const RETENTION_RATE = 2;
const CURRENT_DATA_VERSION = 1;
const SAMPLE_CONTACT_IDS = new Set(["a1", "a2"]);
const normalizeData = (state: AppData): AppData => {
  const removeSampleContacts = (state.dataVersion || 0) < CURRENT_DATA_VERSION;
  return {
    ...state,
    dataVersion: CURRENT_DATA_VERSION,
    matches: (state.matches || []).map((match) => ({ ...match, retention: RETENTION_RATE })),
    rates: (state.rates || []).map((rate) => ({ ...rate, retention: RETENTION_RATE })),
    contacts: removeSampleContacts ? (state.contacts || []).filter((contact) => !SAMPLE_CONTACT_IDS.has(contact.id)) : (state.contacts || []),
  };
};
const money = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
const net = (m: Match) => m.gross * (1 - RETENTION_RATE / 100) + m.diets;
const dateLabel = (iso: string) => new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00`));
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
function saveBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function assetDataUrl(path: string) { const response = await fetch(path); if (!response.ok) throw new Error("No se pudo cargar el recurso"); const blob = await response.blob(); return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }); }
function googleCalendar(m: Match) {
  const start = `${compact(m.date)}T${compact(m.time)}00`; const e = new Date(`${m.date}T${m.time}:00`); e.setHours(e.getHours() + 2);
  const end = `${compact(m.date)}T${String(e.getHours()).padStart(2, "0")}${String(e.getMinutes()).padStart(2, "0")}00`;
  const p = new URLSearchParams({ action: "TEMPLATE", text: `🏀 ${m.home} – ${m.away}`, dates: `${start}/${end}`, location: m.venue, details: `${m.category}\n${m.role}\nCompañeros: ${m.partners.join(", ") || "Sin indicar"}` });
  window.open(`https://calendar.google.com/calendar/render?${p}`, "_blank", "noopener,noreferrer");
}

function MatchDialog({ onAdd }: { onAdd: (m: Match) => void }) {
  const [open, setOpen] = useState(false); const [form, setForm] = useState({ date: "2026-09-26", time: "18:00", home: "", away: "", category: "", role: "Árbitro", venue: "", gross: "0" });
  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const submit = () => { if (!form.home.trim() || !form.away.trim()) return; onAdd({ id: makeId(), ...form, gross: Number(form.gross) || 0, diets: 0, retention: RETENTION_RATE, partners: [], video: false, status: "confirmado" }); setOpen(false); };
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="primary-btn"><Plus /> Nuevo partido</Button></DialogTrigger><DialogContent className="dialog-card"><DialogHeader><DialogTitle>Añadir partido</DialogTitle><DialogDescription>Regístralo manualmente si todavía no tienes el PDF.</DialogDescription></DialogHeader><div className="form-grid">
    <label>Fecha<Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></label><label>Hora<Input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} /></label>
    <label>Equipo local<Input placeholder="Equipo local" value={form.home} onChange={(e) => set("home", e.target.value)} /></label><label>Equipo visitante<Input placeholder="Equipo visitante" value={form.away} onChange={(e) => set("away", e.target.value)} /></label>
    <label>Categoría<Input placeholder="Junior Autonómico" value={form.category} onChange={(e) => set("category", e.target.value)} /></label><label>Función<Input value={form.role} onChange={(e) => set("role", e.target.value)} /></label>
    <label className="wide">Pabellón<Input placeholder="Pabellón" value={form.venue} onChange={(e) => set("venue", e.target.value)} /></label><label>Tarifa bruta<Input type="number" min="0" step="0.01" value={form.gross} onChange={(e) => set("gross", e.target.value)} /></label>
  </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button className="primary-btn" onClick={submit}>Guardar partido</Button></DialogFooter></DialogContent></Dialog>;
}

function EditMatchDialog({ match, onSave }: { match: Match; onSave: (match: Match) => void }) {
  const formFromMatch = (item: Match) => ({ date: item.date, time: item.time, home: item.home, away: item.away, category: item.category, role: item.role, venue: item.venue, gross: String(item.gross), diets: String(item.diets), partners: item.partners.join(", ") });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => formFromMatch(match));
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const changeOpen = (nextOpen: boolean) => { if (nextOpen) setForm(formFromMatch(match)); setOpen(nextOpen); };
  const submit = () => {
    if (!form.home.trim() || !form.away.trim()) return;
    onSave({
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
    });
    setOpen(false);
  };
  return <Dialog open={open} onOpenChange={changeOpen}><DialogTrigger asChild><button aria-label={`Editar ${match.home} contra ${match.away}`} title="Editar partido"><Pencil /></button></DialogTrigger><DialogContent className="dialog-card"><DialogHeader><DialogTitle>Editar partido</DialogTitle><DialogDescription>Actualiza la designación y añade los compañeros separados por comas.</DialogDescription></DialogHeader><div className="form-grid">
    <label>Fecha<Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></label><label>Hora<Input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} /></label>
    <label>Equipo local<Input value={form.home} onChange={(e) => set("home", e.target.value)} /></label><label>Equipo visitante<Input value={form.away} onChange={(e) => set("away", e.target.value)} /></label>
    <label>Categoría<Input value={form.category} onChange={(e) => set("category", e.target.value)} /></label><label>Función<Input value={form.role} onChange={(e) => set("role", e.target.value)} /></label>
    <label className="wide">Pabellón<Input value={form.venue} onChange={(e) => set("venue", e.target.value)} /></label>
    <label>Tarifa bruta<Input type="number" min="0" step="0.01" value={form.gross} onChange={(e) => set("gross", e.target.value)} /></label><label>Dietas<Input type="number" min="0" step="0.01" value={form.diets} onChange={(e) => set("diets", e.target.value)} /></label>
    <label className="wide">Compañeros · separados por comas<Input value={form.partners} onChange={(e) => set("partners", e.target.value)} placeholder="Ana López, Carlos Ruiz" /></label>
  </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button className="primary-btn" onClick={submit}>Guardar cambios</Button></DialogFooter></DialogContent></Dialog>;
}

function VideoDialog({ onAdd }: { onAdd: (game: RecordedGame) => void }) {
  const [open, setOpen] = useState(false); const [title, setTitle] = useState(""); const [url, setUrl] = useState(""); const [error, setError] = useState("");
  const submit = () => { const youtubeId = parseYouTubeId(url); if (!youtubeId) { setError("Introduce un enlace válido de YouTube."); return; } onAdd({ id: makeId(), title: title.trim() || "Partido grabado", youtubeUrl: url.trim(), youtubeId, createdAt: new Date().toISOString(), annotations: [] }); setTitle(""); setUrl(""); setError(""); setOpen(false); };
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="primary-btn"><Plus /> Añadir vídeo</Button></DialogTrigger><DialogContent className="dialog-card"><DialogHeader><DialogTitle>Añadir partido grabado</DialogTitle><DialogDescription>Pega el enlace de YouTube del partido para analizarlo dentro de RefFlow.</DialogDescription></DialogHeader><div className="video-form"><label>Título del partido<Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="CB Toledo – Baloncesto Talavera" /></label><label>Enlace de YouTube<Input value={url} onChange={(e) => { setUrl(e.target.value); setError(""); }} placeholder="https://www.youtube.com/watch?v=…" /></label>{error && <p className="form-error">{error}</p>}</div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button className="primary-btn" onClick={submit}>Añadir y analizar</Button></DialogFooter></DialogContent></Dialog>;
}

type YouTubePlayer = { getCurrentTime: () => number; seekTo: (seconds: number, allowSeekAhead: boolean) => void; destroy: () => void };
type YouTubeWindow = Window & { YT?: { Player: new (element: HTMLElement, options: { videoId: string; playerVars: Record<string, number>; events: { onReady: () => void } }) => YouTubePlayer }; onYouTubeIframeAPIReady?: () => void };

export default function RefFlow() {
  const [view, setView] = useState<View>("inicio"); const [data, setData] = useState<AppData>(sampleData); const [loaded, setLoaded] = useState(false);
  const [viewer, setViewer] = useState<Viewer | null>(null); const [authState, setAuthState] = useState<"loading" | "authenticated" | "anonymous">("loading");
  const [legacyMigrationNeeded, setLegacyMigrationNeeded] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login"); const [authEmail, setAuthEmail] = useState(""); const [authPassword, setAuthPassword] = useState(""); const [authName, setAuthName] = useState(""); const [authBusy, setAuthBusy] = useState(false); const [authMessage, setAuthMessage] = useState("");
  const [saveState, setSaveState] = useState<"guardando" | "guardado" | "error">("guardando"); const [menuOpen, setMenuOpen] = useState(false); const [search, setSearch] = useState("");
  const [pdfState, setPdfState] = useState<"idle" | "reading" | "ready" | "error">("idle"); const [pdfText, setPdfText] = useState(""); const [notice, setNotice] = useState(""); const fileRef = useRef<HTMLInputElement>(null);
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
        const { data: stored, error: readError } = await supabase.from("user_states").select("payload").eq("user_id", user.id).maybeSingle();
        if (readError) throw readError;

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
    setSaveState("guardando");
    const t = setTimeout(() => {
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
  useEffect(() => { const context = (document as unknown as { modelContext?: { registerTool: (tool: unknown, options?: { signal: AbortSignal }) => void | Promise<void> } }).modelContext; if (!context?.registerTool) return; const lifecycle = new AbortController(); void Promise.resolve(context.registerTool({ name: "list_matches", title: "Ver partidos", description: "Devuelve los partidos registrados en RefFlow.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => ({ matches: data.matches.map(({ id, date, time, home, away, category }) => ({ id, date, time, home, away, category })) }) }, { signal: lifecycle.signal })).catch(() => undefined); return () => lifecycle.abort(); }, [data.matches]);

  const now = new Date("2026-09-17T12:00:00"); const nextMatches = useMemo(() => data.matches.filter((m) => new Date(`${m.date}T${m.time}`) >= now).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)), [data.matches]);
  const total = data.matches.reduce((s, m) => s + net(m), 0); const monthTotal = data.matches.filter((m) => m.date.startsWith("2026-09")).reduce((s, m) => s + net(m), 0); const weekTotal = data.matches.filter((m) => m.date >= "2026-09-14" && m.date <= "2026-09-20").reduce((s, m) => s + net(m), 0);
  const filtered = data.matches.filter((m) => `${m.home} ${m.away} ${m.category} ${m.venue}`.toLowerCase().includes(search.toLowerCase()));
  const updateMatch = (id: string, patch: Partial<Match>) => setData((d) => ({ ...d, matches: d.matches.map((m) => m.id === id ? { ...m, ...patch } : m) }));
  const recordedGames = data.recordedGames || []; const selectedGame = recordedGames.find((game) => game.id === selectedGameId) || recordedGames[0];

  useEffect(() => { if (!selectedGame && selectedGameId) setSelectedGameId(""); if (selectedGame && !selectedGameId) setSelectedGameId(selectedGame.id); }, [selectedGame, selectedGameId]);
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

  const importPdf = async (file?: File) => { if (!file || file.type !== "application/pdf") { setPdfState("error"); return; } setPdfState("reading"); setPdfText(""); try { const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"); pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString(); const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise; let text = ""; for (let i = 1; i <= pdf.numPages; i++) { const c = await (await pdf.getPage(i)).getTextContent(); text += c.items.map((item) => "str" in item ? item.str : "").join(" ") + "\n"; } setPdfText(text.trim()); setPdfState("ready"); } catch { setPdfState("error"); } };
  const createDraft = () => { const date = pdfText.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/); const time = pdfText.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/); const d = date ? `${date[3]}-${date[2].padStart(2, "0")}-${date[1].padStart(2, "0")}` : "2026-09-26"; setData((old) => ({ ...old, matches: [{ id: makeId(), date: d, time: time?.[0] || "18:00", home: "Revisar equipo local", away: "Revisar equipo visitante", category: "Pendiente de calibrar", role: "Árbitro", venue: "Revisar pabellón", gross: 0, diets: 0, retention: RETENTION_RATE, partners: [], video: false, status: "pendiente" }, ...old.matches] })); setView("partidos"); setNotice("He creado un borrador. Revísalo: adaptaré la detección exacta cuando tengamos el primer PDF real."); };

  const exportExcel = async () => { const ExcelJS = await import("exceljs"); const wb = new ExcelJS.Workbook(); wb.creator = "RefFlow"; const months = ["SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE", "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO"]; const nums = [9,10,11,12,1,2,3,4,5,6]; months.forEach((month, index) => { const ws = wb.addWorksheet(month, { views: [{ state: "frozen", ySplit: 3 }] }); ws.mergeCells("A1:K1"); const title = ws.getCell("A1"); title.value = `${month} · TEMPORADA ${data.settings.season}`; title.font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } }; title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B5CFF" } }; title.alignment = { horizontal: "center", vertical: "middle" }; ws.getRow(1).height = 34; ws.addRow([]); ws.addRow(["FECHA", "HORA", "LOCAL", "VISITANTE", "CATEGORÍA", "FUNCIÓN", "TARIFA", "DIETAS", "TOTAL BRUTO", "TOTAL NETO", "VÍDEO"]); const year = nums[index] >= 9 ? 2026 : 2027; data.matches.filter((m) => Number(m.date.slice(0,4)) === year && Number(m.date.slice(5,7)) === nums[index]).forEach((m) => ws.addRow([m.date, m.time, m.home, m.away, m.category, m.role, m.gross, m.diets, m.gross + m.diets, net(m), m.video ? "Sí" : "No"])); const header = ws.getRow(3); header.font = { bold: true, color: { argb: "FFFFFFFF" } }; header.height = 28; header.eachCell((cell, col) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col <= 2 ? "FF29415F" : col <= 6 ? "FF0B5CFF" : col <= 8 ? "FFFF8A1D" : "FF16A085" } }; cell.alignment = { horizontal: "center", vertical: "middle" }; }); const last = Math.max(4, ws.rowCount); const totalRow = ws.addRow(["", "", "", "", "", "TOTAL", "", "", { formula: `SUM(I4:I${last})` }, { formula: `SUM(J4:J${last})` }, ""]); totalRow.font = { bold: true }; totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F0FF" } }; [7,8,9,10].forEach((col) => { ws.getColumn(col).numFmt = '#,##0.00 [$€-es-ES]'; }); ws.columns = [{ width: 13 }, { width: 9 }, { width: 23 }, { width: 23 }, { width: 22 }, { width: 20 }, { width: 12 }, { width: 12 }, { width: 15 }, { width: 15 }, { width: 10 }]; }); const summary = wb.addWorksheet("RESUMEN"); summary.columns = [{ width: 28 }, { width: 18 }]; summary.addRow(["REFFLOW · RESUMEN", `Temporada ${data.settings.season}`]); summary.addRow([]); summary.addRow(["Esta semana", weekTotal]); summary.addRow(["Este mes", monthTotal]); summary.addRow(["Toda la temporada", total]); summary.addRow(["Partidos", data.matches.length]); summary.getRow(1).font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } }; summary.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF07152D" } }; [3,4,5].forEach((r) => summary.getCell(r,2).numFmt = '#,##0.00 [$€-es-ES]'); const buffer = await wb.xlsx.writeBuffer(); saveBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `RefFlow_Temporada_${data.settings.season.replace("/", "-")}.xlsx`); };

  const currentLabel = nav.find((item) => item.id === view)?.label;
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
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "No se pudo completar el acceso.");
    } finally {
      setAuthBusy(false);
    }
  };

  if (!loaded || authState === "loading") return <main className="auth-screen"><div className="auth-card loading-card"><img className="auth-logo" src="/favicon.svg" alt="RefFlow" /><h1>Cargando RefFlow…</h1><p>Preparando tu espacio privado.</p></div></main>;
  if (authState === "anonymous") return <main className="auth-screen"><section className="auth-card"><img className="auth-logo" src="/favicon.svg" alt="RefFlow" /><p className="auth-kicker">REFFLOW</p><h1>Tu arbitraje, organizado</h1><p className="auth-copy">Tus designaciones, ganancias y análisis estarán sincronizados en cualquier versión de RefFlow.</p><div className="auth-tabs"><button type="button" className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setAuthMessage(""); }}>Iniciar sesión</button><button type="button" className={authMode === "signup" ? "active" : ""} onClick={() => { setAuthMode("signup"); setAuthMessage(""); }}>Crear cuenta</button></div><form className="auth-form" onSubmit={submitAuth}>{authMode === "signup" && <label>Nombre completo<Input value={authName} onChange={(event) => setAuthName(event.target.value)} autoComplete="name" required /></label>}<label>Correo electrónico<Input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} autoComplete="email" required /></label><label>Contraseña<Input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength={6} required /></label>{authMessage && <p className="auth-message">{authMessage}</p>}<button className="auth-button" type="submit" disabled={authBusy}>{authBusy ? "Comprobando…" : authMode === "signup" ? "Crear mi cuenta" : "Entrar"} <ChevronRight /></button></form><small>Acceso gratuito mediante Supabase. Cada árbitro solo puede consultar sus propios datos.</small></section></main>;
  const greetingName = (data.settings.name || viewer?.fullName || viewer?.displayName || "Árbitro").trim().split(/\s+/)[0];
  const initials = data.settings.name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "AP";
  return <div className="app-shell"><aside className={`sidebar ${menuOpen ? "open" : ""}`}><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X /></button><div className="brand"><img className="ball-logo" src="/favicon.svg" alt="" /><div><strong>RefFlow</strong><small>Temporada {data.settings.season}</small></div></div><nav>{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setMenuOpen(false); }}><Icon /><span>{label}</span>{view === id && <ChevronRight className="chev" />}</button>)}</nav><div className="sync-card"><span className={saveState === "error" ? "sync-dot error" : "sync-dot"} /><div><strong>{saveState === "guardando" ? "Guardando…" : saveState === "error" ? "Sin conexión" : "Todo guardado"}</strong><small>Sincronizado con Supabase</small></div></div><div className="profile"><span>{initials}</span><div><strong>{data.settings.name}</strong><small>{viewer?.email}</small></div><button type="button" onClick={() => void supabase.auth.signOut()} aria-label="Cerrar sesión">Salir</button></div></aside>{menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" />}
    <main className="main-panel"><header className="topbar"><button className="menu-btn" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu /></button><div><p>RefFlow</p><h1>{currentLabel}</h1></div><div className="top-actions"><div className="search"><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar partido…" /></div>{view === "grabados" ? <VideoDialog onAdd={(game) => { setData((d) => ({ ...d, recordedGames: [...(d.recordedGames || []), game] })); setSelectedGameId(game.id); }} /> : <MatchDialog onAdd={(m) => setData((d) => ({ ...d, matches: [m, ...d.matches] }))} />}</div></header>{notice && <div className="notice"><ShieldCheck /><span>{notice}</span><button onClick={() => setNotice("")}><X /></button></div>}{legacyMigrationNeeded && <div className="notice legacy-notice"><ShieldCheck /><span>¿Ya usabas RefFlow? Conecta una vez tu acceso anterior para recuperar tus datos.</span><a href="/signin-with-chatgpt?return_to=%2F" target="_top">Recuperar datos</a><button onClick={() => setLegacyMigrationNeeded(false)}>Empezar sin datos anteriores</button></div>}

      {view === "inicio" && <section className="content dashboard"><div className="welcome"><div><p>Jueves, 17 de septiembre</p><h2>Hola, {greetingName} <span>👋</span></h2><small>Tienes {nextMatches.length} designaciones próximas.</small></div><button onClick={() => setView("importar")}><UploadCloud /> Importar designaciones</button></div><div className="kpi-grid"><article className="kpi primary"><div><span>ESTA SEMANA</span><strong>{money(weekTotal)}</strong><small>2 partidos</small></div><div className="kpi-icon"><WalletCards /></div></article><article className="kpi"><div><span>ESTE MES</span><strong>{money(monthTotal)}</strong><small>Septiembre</small></div><div className="kpi-icon orange"><BarChart3 /></div></article><article className="kpi"><div><span>TEMPORADA</span><strong>{money(total)}</strong><small>{data.matches.length} partidos</small></div><div className="kpi-icon green"><Trophy /></div></article></div><div className="dashboard-grid"><section className="panel upcoming"><div className="panel-heading"><div><p>PRÓXIMAS DESIGNACIONES</p><h3>Tu fin de semana</h3></div><button onClick={() => setView("partidos")}>Ver todos <ChevronRight /></button></div>{nextMatches.slice(0,3).map((m, i) => <article className={`match-row ${i === 0 ? "featured" : ""}`} key={m.id}><div className="date-box"><strong>{new Date(`${m.date}T12:00`).getDate()}</strong><span>{new Intl.DateTimeFormat("es-ES", { month: "short" }).format(new Date(`${m.date}T12:00`)).toUpperCase()}</span></div><div className="match-main"><span className="category">{m.category}</span><h4>{m.home} <em>vs</em> {m.away}</h4><p><Clock3 /> {m.time} <MapPin /> {m.venue}</p></div><div className="match-side"><strong>{money(net(m))}</strong><span>Neto estimado</span><button onClick={() => googleCalendar(m)}><CalendarDays /> Calendario</button></div></article>)}</section><aside className="side-stack"><section className="panel earnings"><div className="panel-heading"><div><p>GANANCIAS</p><h3>Septiembre</h3></div><CircleEuro /></div><div className="ring"><div><strong>{Math.round(monthTotal / 250 * 100)}%</strong><span>del objetivo</span></div></div><div className="earn-row"><span>Cobrado</span><strong>{money(monthTotal)}</strong></div><div className="earn-row"><span>Objetivo</span><strong>250,00 €</strong></div><button onClick={() => setView("ganancias")}>Ver desglose <ChevronRight /></button></section><section className="excel-card"><div className="excel-icon"><FileSpreadsheet /></div><div><h3>Excel de temporada</h3><p>Genera tu hoja actualizada con todos los meses.</p><button onClick={exportExcel}><Download /> Descargar .xlsx</button></div></section></aside></div></section>}

      {view === "importar" && <section className="content narrow"><div className="section-intro"><p>IMPORTAR DESIGNACIONES</p><h2>Sube el PDF de la federación</h2><span>RefFlow extraerá el texto y preparará tus partidos para revisarlos antes de guardar.</span></div><input ref={fileRef} hidden type="file" accept="application/pdf" onChange={(e) => importPdf(e.target.files?.[0])} /><button className={`drop-zone ${pdfState}`} onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); importPdf(e.dataTransfer.files[0]); }}><span className="drop-icon"><FileUp /></span><strong>{pdfState === "reading" ? "Analizando el PDF…" : pdfState === "ready" ? "PDF leído correctamente" : pdfState === "error" ? "No se pudo leer ese archivo" : "Arrastra aquí el PDF de designaciones"}</strong><small>{pdfState === "ready" ? "Comprueba el texto detectado antes de crear el borrador" : "o pulsa para seleccionarlo · máximo 20 MB"}</small><span className="fake-button">Seleccionar PDF</span></button>{pdfState === "ready" && <div className="panel pdf-result"><div className="panel-heading"><div><p>TEXTO DETECTADO</p><h3>Resultado del análisis</h3></div><Check /></div><pre>{pdfText.slice(0, 3000) || "El PDF no contiene texto seleccionable."}</pre><div className="pdf-actions"><Button variant="outline" onClick={() => { setPdfState("idle"); setPdfText(""); }}>Descartar</Button><Button className="primary-btn" onClick={createDraft}>Crear borrador para revisar</Button></div></div>}<div className="info-strip"><ShieldCheck /><div><strong>Tú tienes siempre la última palabra</strong><span>Ningún partido se guarda ni se añade al calendario sin que antes lo revises.</span></div></div></section>}

      {view === "partidos" && <section className="content"><div className="page-heading"><div><p>MIS PARTIDOS</p><h2>Temporada {data.settings.season}</h2></div><MatchDialog onAdd={(m) => setData((d) => ({ ...d, matches: [m, ...d.matches] }))} /></div><div className="panel table-wrap"><table><thead><tr><th>Fecha</th><th>Partido</th><th>Categoría / función</th><th>Lugar</th><th>Neto</th><th>Acciones</th></tr></thead><tbody>{filtered.sort((a,b) => b.date.localeCompare(a.date)).map((m) => <tr key={m.id}><td><strong>{dateLabel(m.date)}</strong><small>{m.time}</small></td><td><strong>{m.home}</strong><small>vs {m.away}</small></td><td><span className="pill">{m.category}</span><small>{m.role}</small></td><td><span>{m.venue}</span><small>{m.partners.join(", ") || "Sin compañeros"}</small></td><td><strong>{money(net(m))}</strong><small>{money(m.gross + m.diets)} bruto</small></td><td><div className="row-actions"><button onClick={() => googleCalendar(m)} aria-label="Añadir a Google Calendar" title="Añadir a Google Calendar"><CalendarDays /></button><EditMatchDialog match={m} onSave={(updated) => updateMatch(m.id, updated)} /><button onClick={() => updateMatch(m.id, { video: !m.video })} className={m.video ? "selected" : ""} aria-label="Marcar vídeo disponible" title="Marcar vídeo disponible"><Check /></button><button onClick={() => setData((d) => ({ ...d, matches: d.matches.filter((x) => x.id !== m.id) }))} aria-label="Eliminar partido" title="Eliminar partido"><X /></button></div></td></tr>)}</tbody></table></div></section>}

      {view === "grabados" && <section className="content video-analysis-page"><div className="page-heading"><div><p>ANÁLISIS DE VÍDEO</p><h2>Partidos grabados</h2></div><VideoDialog onAdd={(game) => { setData((d) => ({ ...d, recordedGames: [...(d.recordedGames || []), game] })); setSelectedGameId(game.id); }} /></div>
        {recordedGames.length === 0 ? <div className="panel video-empty"><span><Video /></span><h3>Añade tu primer partido</h3><p>Pega un enlace de YouTube y podrás guardar acciones en el minuto y segundo exactos.</p><VideoDialog onAdd={(game) => { setData((d) => ({ ...d, recordedGames: [game] })); setSelectedGameId(game.id); }} /></div> : <div className="video-workspace">
          <aside className="panel video-library"><div className="video-library-title"><div><p>VÍDEOS</p><strong>{recordedGames.length} {recordedGames.length === 1 ? "partido" : "partidos"}</strong></div><Video /></div>{recordedGames.map((game) => <button key={game.id} className={selectedGame?.id === game.id ? "active" : ""} onClick={() => setSelectedGameId(game.id)}><span className="video-list-icon"><Play /></span><span><strong>{game.title}</strong><small>{game.annotations.length} anotaciones</small></span><ChevronRight /></button>)}</aside>
          {selectedGame && <div className="analyzer-main"><div ref={analysisStageRef} className={`analysis-stage ${analysisFullscreen ? "analysis-fullscreen" : ""}`}><section className="panel player-panel"><div className="player-heading"><div><p>ANALIZANDO</p><h3>{selectedGame.title}</h3></div><div className="player-heading-actions"><button className="fullscreen-toggle" onClick={toggleAnalysisFullscreen} aria-label={analysisFullscreen ? "Salir de pantalla completa" : "Analizar a pantalla completa"}>{analysisFullscreen ? <Minimize2 /> : <Maximize2 />}<span>{analysisFullscreen ? "Salir" : "Pantalla completa"}</span></button><a href={selectedGame.youtubeUrl} target="_blank" rel="noreferrer">Abrir en YouTube <ExternalLink /></a></div></div><div className="youtube-frame"><div ref={playerMountRef} /></div><div className="capture-bar"><div className="time-inputs"><TimerReset /><label>Min<input type="number" min="0" value={manualMinute} onChange={(e) => setManualMinute(Math.max(0, Number(e.target.value)))} /></label><span>:</span><label>Seg<input type="number" min="0" max="59" value={manualSecond} onChange={(e) => setManualSecond(Math.min(59, Math.max(0, Number(e.target.value))))} /></label></div><button onClick={() => { const seconds = currentSeconds(); setManualMinute(Math.floor(seconds / 60)); setManualSecond(seconds % 60); }}><Clock3 /> Capturar instante actual</button><strong>{timeLabel(currentSeconds())}</strong></div><div className="note-box"><textarea value={annotationNote} onChange={(e) => setAnnotationNote(e.target.value)} placeholder="Nota opcional: qué ocurrió, posición, decisión…" /><button disabled={!annotationNote.trim()} onClick={() => addAnnotation("Nota libre", "Anotación")}>Guardar nota</button></div></section>
            <section className="panel quick-tags"><div className="panel-heading"><div><p>ANOTACIONES RÁPIDAS</p><h3>Pulsa para guardar en {playerReady ? "el instante actual" : timeLabel(manualMinute * 60 + manualSecond)}</h3></div><div className="quick-tags-tools"><Tag /><button className="quick-tags-exit" onClick={toggleAnalysisFullscreen} aria-label="Salir de pantalla completa"><Minimize2 /></button></div></div><div className="tag-groups">{annotationGroups.map((group) => <div className="tag-group" key={group.name} style={{ borderLeftColor: group.color }}><div className="tag-group-title"><span style={{ background: group.color }} /><strong>{group.name}</strong></div><div className="tag-buttons">{group.items.map((item) => <button key={item} onClick={() => addAnnotation(group.name, item)}><span style={{ background: group.color }} />{item}</button>)}</div></div>)}</div></section></div>
            <section className="panel annotations-panel"><div className="panel-heading"><div><p>LÍNEA DE TIEMPO</p><h3>{selectedGame.annotations.length} anotaciones</h3></div><div className="timeline-actions"><button className="report-button" onClick={exportVideoReport} disabled={selectedGame.annotations.length === 0}><FileText /> Finalizar y descargar PDF</button><Clock3 /></div></div>{selectedGame.annotations.length === 0 ? <div className="annotation-empty">Reproduce el vídeo y pulsa una etiqueta rápida para crear la primera anotación.</div> : <div className="annotation-list">{[...selectedGame.annotations].sort((a,b) => a.seconds - b.seconds).map((annotation) => <div className="annotation-row" key={annotation.id}><button className="timestamp" onClick={() => seekTo(annotation.seconds)} title="Reproducir desde 3 segundos antes" aria-label={`Reproducir ${annotation.label} desde 3 segundos antes`}><Play /> {timeLabel(annotation.seconds)}</button><span className="annotation-color" style={{ background: annotationGroups.find((group) => group.name === annotation.category)?.color || "#0b5cff" }} /><div><strong>{annotation.label}</strong><small>{annotation.category}{annotation.note ? ` · ${annotation.note}` : ""}</small></div><button className="annotation-delete" onClick={() => setData((d) => ({ ...d, recordedGames: (d.recordedGames || []).map((game) => game.id === selectedGame.id ? { ...game, annotations: game.annotations.filter((item) => item.id !== annotation.id) } : game) }))} aria-label="Eliminar anotación"><Trash2 /></button></div>)}</div>}</section>
          </div>}
        </div>}
      </section>}

      {view === "ganancias" && <section className="content"><div className="page-heading"><div><p>GANANCIAS</p><h2>Resumen económico</h2></div><Button className="primary-btn" onClick={exportExcel}><FileSpreadsheet /> Exportar Excel</Button></div><div className="kpi-grid"><article className="kpi primary"><div><span>ESTA SEMANA</span><strong>{money(weekTotal)}</strong><small>Neto estimado</small></div><WalletCards /></article><article className="kpi"><div><span>ESTE MES</span><strong>{money(monthTotal)}</strong><small>Septiembre</small></div><BarChart3 /></article><article className="kpi"><div><span>TEMPORADA</span><strong>{money(total)}</strong><small>{data.matches.length} designaciones</small></div><Trophy /></article></div><div className="panel finance-list"><div className="panel-heading"><div><p>DESGLOSE</p><h3>Ingresos por partido</h3></div></div>{data.matches.map((m) => <div className="finance-row" key={m.id}><div><strong>{m.home} – {m.away}</strong><small>{dateLabel(m.date)} · {m.category}</small></div><span>{money(m.gross)} tarifa + {money(m.diets)} dietas</span><strong>{money(net(m))}</strong></div>)}</div></section>}

      {view === "arbitros" && <section className="content"><div className="page-heading"><div><p>AGENDA</p><h2>Compañeros</h2></div><Button className="primary-btn" onClick={() => { const name = prompt("Nombre del árbitro"); if (name) setData((d) => ({ ...d, contacts: [...d.contacts, { id: makeId(), name, phone: "", role: "Árbitro" }] })); }}><Plus /> Añadir árbitro</Button></div><div className="contact-grid">{data.contacts.map((c) => <article className="contact-card" key={c.id}><span className="avatar">{c.name.split(" ").map((x) => x[0]).slice(0,2).join("")}</span><div><h3>{c.name}</h3><p>{c.role}</p><span>{c.phone || "Teléfono pendiente"}</span></div><div className="contact-actions"><button onClick={() => { const phone = prompt("Número de teléfono", c.phone); if (phone !== null) setData((d) => ({ ...d, contacts: d.contacts.map((x) => x.id === c.id ? { ...x, phone } : x) })); }}><Pencil /></button><button disabled={!c.phone} onClick={() => window.open(`https://wa.me/34${c.phone.replace(/\D/g, "")}`, "_blank")}><MessageCircle /> WhatsApp</button></div></article>)}</div></section>}

      {view === "tarifas" && <section className="content"><div className="page-heading"><div><p>TARIFAS</p><h2>Temporada {data.settings.season}</h2></div><Button className="primary-btn" onClick={() => setData((d) => ({ ...d, rates: [...d.rates, { id: makeId(), category: "Nueva categoría", role: "Árbitro", amount: 0, retention: RETENTION_RATE }] }))}><Plus /> Nueva tarifa</Button></div><div className="panel table-wrap"><table><thead><tr><th>Competición</th><th>Función</th><th>Tarifa</th><th>Retención</th><th>Neto</th><th></th></tr></thead><tbody>{data.rates.map((r) => <tr key={r.id}><td><Input value={r.category} onChange={(e) => setData((d) => ({ ...d, rates: d.rates.map((x) => x.id === r.id ? { ...x, category: e.target.value } : x) }))} /></td><td><Input value={r.role} onChange={(e) => setData((d) => ({ ...d, rates: d.rates.map((x) => x.id === r.id ? { ...x, role: e.target.value } : x) }))} /></td><td><Input type="number" step="0.01" value={r.amount} onChange={(e) => setData((d) => ({ ...d, rates: d.rates.map((x) => x.id === r.id ? { ...x, amount: Number(e.target.value) } : x) }))} /></td><td><Input type="number" value={RETENTION_RATE} readOnly aria-label="Retención fija del 2 por ciento" /></td><td><strong>{money(r.amount * (1 - RETENTION_RATE / 100))}</strong></td><td><button className="icon-delete" onClick={() => setData((d) => ({ ...d, rates: d.rates.filter((x) => x.id !== r.id) }))}><X /></button></td></tr>)}</tbody></table></div></section>}

      {view === "ajustes" && <section className="content narrow"><div className="section-intro"><p>AJUSTES</p><h2>Personaliza RefFlow</h2><span>Estos datos ayudan a identificarte en las designaciones y organizar la temporada.</span></div><div className="panel settings-form"><label>Nombre tal como aparece en las designaciones<Input value={data.settings.name} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, name: e.target.value } }))} /></label><label>Temporada<Input value={data.settings.season} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, season: e.target.value } }))} /></label><div className="setting-row"><div><strong>Google Calendar</strong><span>Los botones de cada partido abren el evento listo para confirmar.</span></div><span className="status-ready"><Check /> Disponible</span></div><div className="setting-row"><div><strong>Instalar la aplicación</strong><span>En Android usa “Añadir a pantalla de inicio”; en Windows, “Instalar aplicación”.</span></div><span className="status-ready"><Check /> PWA lista</span></div></div></section>}
    </main><nav className="bottom-nav">{nav.slice(0,5).map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon /><span>{label}</span></button>)}</nav>
  </div>;
}
