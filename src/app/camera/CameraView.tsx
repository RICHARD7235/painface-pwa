"use client";

/**
 * CameraView -- Écran unifié caméra + monitoring PSPI.
 *
 * Layout : 60% caméra (haut) + 40% dashboard (bas).
 * Accepte ?patientId=xxx en query param pour lier la séance à un patient.
 * Sans patientId → séance anonyme.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCamera } from "../../hooks/useCamera";
import { useFaceMesh } from "../../hooks/useFaceMesh";
import { usePainScoreFromAUs } from "../../hooks/usePainScore";
import { FaceMeshOverlay } from "../../components/FaceMeshOverlay";
import { insertSession } from "../../services/DatabaseService";
import { loadSettings, type AppSettings } from "../../services/SettingsService";
import { PSPI_MAX } from "../../services/PainScoreEngine";
import type { ActionUnitsResult } from "../../types/actionUnits";
import type { DetectionStatus } from "../../types/facemesh";
import type { SessionAnnotation, PainDataPoint, Session } from "../../types/patient";

// ---- Constants ---------------------------------------------------------------

const HISTORY_SEC = 60;
const HISTORY_MAX = 300;
const SAMPLE_RATE = 5;

const QUICK_LABELS = [
  "Début traitement",
  "Fin traitement",
  "Exercice douloureux",
  "Positionnement",
  "Massage actif",
  "Repos",
];

// ---- Helpers -----------------------------------------------------------------

function pspiColor(score: number): string {
  if (score <= 4) return "#22c55e";
  if (score <= 8) return "#f59e0b";
  return "#ef4444";
}

function pspiLabel(score: number): string {
  if (score === 0) return "Absent";
  if (score <= 4) return "Léger";
  if (score <= 8) return "Modéré";
  if (score <= 12) return "Intense";
  return "Sévère";
}

function getStatusText(status: DetectionStatus): string {
  switch (status) {
    case "loading": return "Chargement...";
    case "no_face": return "Aucun visage";
    case "detected": return "Visage détecté";
    case "partial": return "Partiellement visible";
    case "too_far": return "Trop loin";
    case "rotated": return "Tête tournée";
    case "error": return "Erreur";
  }
}

function getStatusColor(status: DetectionStatus): string {
  switch (status) {
    case "detected": return "#22c55e";
    case "no_face": case "error": return "#ef4444";
    case "partial": case "too_far": case "rotated": return "#f59e0b";
    case "loading": return "#6b7280";
  }
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function playBeep(frequency: number, durationMs: number) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.value = 0.3;
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, durationMs);
  } catch { /* AudioContext may not be available */ }
}

function playDoubleBip(frequency: number, durationMs: number) {
  playBeep(frequency, durationMs);
  setTimeout(() => playBeep(frequency, durationMs), durationMs + 80);
}

function spikeBeepFreq(score: number): number {
  return 440 + (score / PSPI_MAX) * 660;
}

// ---- SVG arc helpers ---------------------------------------------------------

function polarToXY(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const s = polarToXY(cx, cy, r, startDeg);
  const e = polarToXY(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

// ---- AU overlay --------------------------------------------------------------

const AU_ROWS: { key: keyof Omit<ActionUnitsResult, "timestamp">; label: string }[] = [
  { key: "au4", label: "AU4" },
  { key: "au6", label: "AU6" },
  { key: "au7", label: "AU7" },
  { key: "au9", label: "AU9" },
  { key: "au10", label: "AU10" },
  { key: "au43", label: "AU43" },
];

const BAR_W = 48;

const ZERO_AU: ActionUnitsResult = {
  au4: { au: 4, score: 0, intensity: null, raw: 0 },
  au6: { au: 6, score: 0, intensity: null, raw: 0 },
  au7: { au: 7, score: 0, intensity: null, raw: 0 },
  au9: { au: 9, score: 0, intensity: null, raw: 0 },
  au10: { au: 10, score: 0, intensity: null, raw: 0 },
  au43: { au: 43, score: 0, intensity: null, raw: 0 },
  timestamp: 0,
};

function auBarColor(score: number): string {
  if (score === 0) return "#374151";
  if (score <= 2) return "#22c55e";
  if (score === 3) return "#f59e0b";
  return "#ef4444";
}

function AUBarsPanel({ aus }: { aus: ActionUnitsResult }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ backgroundColor: "rgba(0,0,0,0.60)" }}>
      {AU_ROWS.map(({ key, label }) => {
        const score = aus[key].score;
        const fill = (score / 5) * BAR_W;
        const color = auBarColor(score);
        return (
          <div key={key} className="my-0.5 flex items-center gap-1">
            <span className="w-8 font-mono text-xs text-gray-300">{label}</span>
            <div className="overflow-hidden rounded-sm" style={{ width: BAR_W, height: 6, backgroundColor: "#1f2937" }}>
              <div className="rounded-sm" style={{ width: fill, height: 6, backgroundColor: color }} />
            </div>
            <span className="w-3 text-right font-mono text-xs font-bold" style={{ color }}>{score}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---- Sub-components ----------------------------------------------------------

function StatusBadge({ status }: { status: DetectionStatus }) {
  if (status === "loading") return null;
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: getStatusColor(status) + "CC" }}
    >
      {getStatusText(status)}
    </span>
  );
}

function CircularGauge({ score }: { score: number }) {
  const SIZE = 120;
  const CX = SIZE / 2;
  const CY = SIZE / 2 + 6;
  const R = 42;
  const STROKE = 9;
  const START_DEG = 135;
  const TOTAL_DEG = 270;
  const progress = Math.min(score / PSPI_MAX, 0.9999);
  const endDeg = START_DEG + progress * TOTAL_DEG;

  const bgPath = arcPath(CX, CY, R, START_DEG, START_DEG + TOTAL_DEG * 0.9999);
  const fgPath = progress > 0.005 ? arcPath(CX, CY, R, START_DEG, endDeg) : null;
  const color = pspiColor(score);

  return (
    <svg width={SIZE} height={SIZE} className="flex-shrink-0">
      <path d={bgPath} stroke="#1e3a5f" strokeWidth={STROKE} fill="none" strokeLinecap="round" />
      {fgPath && (
        <path d={fgPath} stroke={color} strokeWidth={STROKE} fill="none" strokeLinecap="round" className="transition-all duration-300" />
      )}
      <text x={CX} y={CY - 4} textAnchor="middle" fontSize={24} fontWeight="700" fill={color}>
        {score.toFixed(1)}
      </text>
      <text x={CX} y={CY + 10} textAnchor="middle" fontSize={9} fill="#64748b">
        / {PSPI_MAX}
      </text>
      <text x={CX} y={CY + 22} textAnchor="middle" fontSize={9} fontWeight="600" fill={color}>
        {pspiLabel(score)}
      </text>
    </svg>
  );
}

function PainHistoryChart({
  data, annotations, currentSec, chartWidth,
}: {
  data: PainDataPoint[];
  annotations: SessionAnnotation[];
  currentSec: number;
  chartWidth: number;
}) {
  const W = chartWidth;
  const H = 60;
  const PL = 20;
  const PR = 4;
  const PT = 4;
  const PB = 12;
  const CW = W - PL - PR;
  const CH = H - PT - PB;

  if (data.length < 2 || W < 10) return null;

  const maxSec = currentSec;
  const minSec = maxSec - HISTORY_SEC;
  const toX = (sec: number) => PL + ((sec - minSec) / HISTORY_SEC) * CW;
  const toY = (s: number) => PT + CH - (s / PSPI_MAX) * CH;

  const visible = data.filter((d) => d.sessionSec >= minSec - 1);
  const points = visible
    .map((d) => `${toX(d.sessionSec).toFixed(1)},${toY(d.score).toFixed(1)}`)
    .join(" ");

  const yZoneGreen = toY(4);
  const yZoneMid = toY(8);
  const yTop = PT;
  const yBottom = PT + CH;

  const visibleAnnots = annotations.filter(
    (a) => a.sessionSec >= minSec && a.sessionSec <= maxSec,
  );

  return (
    <svg width={W} height={H} className="block">
      <rect x={PL} y={yTop} width={CW} height={yZoneMid - yTop} fill="rgba(239,68,68,0.07)" />
      <rect x={PL} y={yZoneMid} width={CW} height={yZoneGreen - yZoneMid} fill="rgba(245,158,11,0.07)" />
      <rect x={PL} y={yZoneGreen} width={CW} height={yBottom - yZoneGreen} fill="rgba(34,197,94,0.07)" />
      {[4, 8, 12].map((v) => (
        <line key={v} x1={PL} y1={toY(v)} x2={PL + CW} y2={toY(v)} stroke="#1e3a5f" strokeWidth={0.5} strokeDasharray="3,4" />
      ))}
      {[0, 8, 16].map((v) => (
        <text key={v} x={PL - 3} y={toY(v) + 4} textAnchor="end" fontSize={7} fill="#64748b">{v}</text>
      ))}
      <line x1={PL} y1={yBottom} x2={PL + CW} y2={yBottom} stroke="#1e3a5f" strokeWidth={0.5} />
      <text x={PL} y={H - 1} fontSize={6} fill="#64748b">-{HISTORY_SEC}s</text>
      <text x={PL + CW} y={H - 1} textAnchor="end" fontSize={6} fill="#64748b">now</text>
      {visible.length >= 2 && (
        <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {visibleAnnots.map((a) => (
        <line key={a.id} x1={toX(a.sessionSec)} y1={PT} x2={toX(a.sessionSec)} y2={yBottom} stroke="#f8fafc" strokeWidth={1} strokeDasharray="2,3" opacity={0.6} />
      ))}
    </svg>
  );
}

function AnnotationModal({
  visible, currentSec, currentPspi, onSave, onCancel,
}: {
  visible: boolean;
  currentSec: number;
  currentPspi: number;
  onSave: (a: SessionAnnotation) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recDuration, setRecDuration] = useState(0);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    if (visible) { setText(""); setAudioBlob(null); setRecording(false); setRecDuration(0); setMode("text"); }
  }, [visible]);

  useEffect(() => {
    if (recording) {
      recTimerRef.current = setInterval(() => setRecDuration((d) => d + 1), 1000);
    } else if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
    }
    return () => { if (recTimerRef.current) clearInterval(recTimerRef.current); };
  }, [recording]);

  async function handleStartRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecDuration(0);
      setAudioBlob(null);
    } catch (e) {
      console.warn("[AnnotationModal] Recording error:", e);
    }
  }

  function handleStopRecording() {
    try { mediaRecorderRef.current?.stop(); setRecording(false); }
    catch { setRecording(false); }
  }

  function handleSave() {
    const label = mode === "text"
      ? text.trim() || "Événement"
      : audioBlob ? `Note vocale ${formatTime(recDuration)}` : "Note vocale";
    onSave({
      id: crypto.randomUUID(),
      sessionSec: currentSec,
      timestamp: Date.now(),
      type: mode,
      label,
      audioUri: audioBlob ? URL.createObjectURL(audioBlob) : undefined,
      pspi: currentPspi,
    });
  }

  const canSave = mode === "text" ? text.trim().length > 0 : audioBlob !== null;
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[90%] max-w-md rounded-2xl bg-[#13243d] p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-100">Marquer un événement</h3>
          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: pspiColor(currentPspi), backgroundColor: "#1e3a5f" }}>
            PSPI {currentPspi.toFixed(1)}
          </span>
        </div>
        <div className="flex gap-2 mb-3">
          {(["text", "voice"] as const).map((m) => (
            <button key={m} className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${mode === m ? "bg-indigo-600 text-white" : "bg-[#1e3a5f] text-slate-400"}`} onClick={() => setMode(m)}>
              {m === "text" ? "Texte" : "Voix"}
            </button>
          ))}
        </div>
        {mode === "text" ? (
          <>
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 scrollbar-hide">
              {QUICK_LABELS.map((lbl) => (
                <button key={lbl} className={`whitespace-nowrap rounded-full px-3 py-1 text-xs transition ${text === lbl ? "bg-indigo-600 text-white" : "bg-[#1e3a5f] text-slate-400"}`} onClick={() => setText(lbl)}>
                  {lbl}
                </button>
              ))}
            </div>
            <textarea
              className="w-full rounded-lg border border-[#1e3a5f] bg-[#0b1628] p-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
              placeholder="Ou saisissez une note libre..."
              value={text} onChange={(e) => setText(e.target.value)} maxLength={200} rows={2}
            />
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4">
            {!recording && !audioBlob && (
              <button className="flex items-center gap-2 rounded-full bg-[#1e3a5f] px-5 py-2.5 text-sm text-slate-200 transition hover:bg-[#2a4a6f]" onClick={handleStartRecording}>
                <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
                Appuyez pour enregistrer
              </button>
            )}
            {recording && (
              <button className="flex items-center gap-2 rounded-full bg-red-600/30 px-5 py-2.5 text-sm text-red-300 animate-pulse transition" onClick={handleStopRecording}>
                <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
                Enregistrement... {formatTime(recDuration)}
              </button>
            )}
            {!recording && audioBlob && (
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <span>Note vocale - {formatTime(recDuration)}</span>
                <button className="text-indigo-400 underline" onClick={() => { setAudioBlob(null); setRecDuration(0); }}>Refaire</button>
              </div>
            )}
          </div>
        )}
        <div className="mt-4 flex gap-3">
          <button className="flex-1 rounded-lg border border-[#1e3a5f] py-2 text-sm text-slate-400 transition hover:bg-[#1e3a5f]" onClick={onCancel}>Annuler</button>
          <button className={`flex-1 rounded-lg py-2 text-sm font-medium text-white transition ${canSave ? "bg-indigo-600 hover:bg-indigo-700" : "bg-indigo-600/40 cursor-not-allowed"}`} onClick={handleSave} disabled={!canSave}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

// ---- Main CameraView ---------------------------------------------------------

export default function CameraView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patientId");

  // Camera
  const { videoRef, permission, startCamera, stopCamera, switchCamera, error: cameraError } = useCamera();

  // Settings
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const handler = () => { if (document.visibilityState === "visible") setSettings(loadSettings()); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  // Face mesh
  const {
    landmarks, status, fps, loadingMessage, actionUnits,
    calibrationProgress, isCalibrating, calibrationComplete,
    startCalibration, startDetection, stopDetection,
  } = useFaceMesh(videoRef);

  // Pain score
  const { smoothedScore, currentScore, painEvents } = usePainScoreFromAUs(
    actionUnits,
    { smoothingWindowMs: settings.smoothingWindowMs, spikeLowThreshold: settings.spikeLowThreshold, spikeHighThreshold: settings.spikeHighThreshold },
    calibrationComplete,
  );

  const gaugeScore = calibrationComplete ? (smoothedScore ?? 0) : 0;

  // Session timer
  const sessionStartRef = useRef(Date.now());
  const [sessionSec, setSessionSec] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSessionSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // History rolling buffer
  const historyRef = useRef<PainDataPoint[]>([]);
  const lastSampleRef = useRef(0);
  const [chartData, setChartData] = useState<PainDataPoint[]>([]);

  useEffect(() => {
    if (currentScore === null || !calibrationComplete) return;
    if (Math.abs(sessionSec - lastSampleRef.current) < 1 / SAMPLE_RATE) return;
    lastSampleRef.current = sessionSec;
    const point: PainDataPoint = { sessionSec, score: currentScore };
    historyRef.current = [...historyRef.current, point].slice(-HISTORY_MAX);
    setChartData([...historyRef.current]);
  }, [currentScore, sessionSec, calibrationComplete]);

  // Spike counter + audio beep
  const [spikeCount, setSpikeCount] = useState(0);
  const prevEventLenRef = useRef(0);

  useEffect(() => {
    if (!calibrationComplete) { prevEventLenRef.current = painEvents.length; return; }
    const newSpikes = painEvents.length - prevEventLenRef.current;
    if (newSpikes > 0) {
      setSpikeCount((c) => c + newSpikes);
      const lastSpike = painEvents[painEvents.length - 1];
      if (lastSpike) {
        navigator.vibrate?.(10);
        const freq = spikeBeepFreq(lastSpike.scoreAfter);
        if (lastSpike.scoreAfter >= settingsRef.current.pspiDoubleBipThreshold) {
          playDoubleBip(freq, 120);
        } else {
          playBeep(freq, 120);
        }
      }
      prevEventLenRef.current = painEvents.length;
    }
  }, [painEvents, calibrationComplete]);

  // AU overlay toggle
  const [showAU, setShowAU] = useState(true);
  const displayAUs = actionUnits ?? ZERO_AU;

  // Annotations
  const [annotations, setAnnotations] = useState<SessionAnnotation[]>([]);
  const [showAnnotModal, setShowAnnotModal] = useState(false);
  const handleSaveAnnot = useCallback((a: SessionAnnotation) => {
    setAnnotations((prev) => [...prev, a]);
    setShowAnnotModal(false);
  }, []);

  // Calibration done badge
  const [showCalibDone, setShowCalibDone] = useState(false);
  useEffect(() => {
    if (!calibrationComplete) return;
    setShowCalibDone(true);
    const t = setTimeout(() => setShowCalibDone(false), 2500);
    return () => clearTimeout(t);
  }, [calibrationComplete]);

  // Auto-start camera
  useEffect(() => {
    startCamera("user");
    return () => { stopDetection(); stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Video dimensions for overlay
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const handleVideoPlaying = useCallback(() => {
    const v = videoRef.current;
    if (v) setDimensions({ width: v.clientWidth, height: v.clientHeight });
    startDetection();
  }, [startDetection, videoRef]);

  useEffect(() => {
    const handleResize = () => {
      const v = videoRef.current;
      if (v) setDimensions({ width: v.clientWidth, height: v.clientHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [videoRef]);

  // Chart width
  const dashRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(360);
  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setChartWidth(entry.contentRect.width - 8);
    });
    if (dashRef.current) ro.observe(dashRef.current);
    return () => ro.disconnect();
  }, []);

  // Save session and navigate
  const handleStop = useCallback(async () => {
    stopDetection();
    stopCamera();
    if (sessionSec >= 5 && historyRef.current.length > 0) {
      try {
        const scores = historyRef.current;
        const moyenne = scores.reduce((s, p) => s + p.score, 0) / scores.length;
        const max = Math.max(...scores.map((p) => p.score));
        const session: Session = {
          id: crypto.randomUUID(),
          patientId: patientId ?? null,
          date: sessionStartRef.current,
          duree: sessionSec,
          painScores: scores,
          painEvents,
          annotations,
          moyennePSPI: Math.round(moyenne * 10) / 10,
          maxPSPI: Math.round(max * 10) / 10,
        };
        await insertSession(session);
      } catch (e) {
        console.warn("[CameraView] insertSession failed:", e);
      }
    }
    router.push("/");
  }, [sessionSec, patientId, painEvents, annotations, stopDetection, stopCamera, router]);

  const mediaReady = permission === "granted" && status !== "loading" && status !== "error";
  const rawPspi = currentScore ?? 0;
  const scoreReady = calibrationComplete;
  const { width, height } = dimensions;

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[#0b1628]">
      {/* ── Camera zone 60% ─────────────────────────────────────────────── */}
      <div className="relative flex-[6] overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover -scale-x-100"
          autoPlay playsInline muted
          onPlaying={handleVideoPlaying}
        />

        {/* Permission: prompt overlay */}
        {permission === "prompt" && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#0b1628] text-slate-100">
            <p className="text-center px-8">L&apos;accès à la caméra est requis pour l&apos;analyse faciale.</p>
            <button className="rounded-xl bg-indigo-600 px-6 py-3 font-medium text-white" onClick={() => startCamera("user").then(startDetection)}>
              Autoriser la caméra
            </button>
            <button className="text-sm text-slate-400 underline" onClick={() => router.push("/")}>Retour</button>
          </div>
        )}

        {/* Permission: denied overlay */}
        {(permission === "denied" || cameraError) && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#0b1628] text-slate-100">
            <p className="text-center px-8">Accès caméra refusé. Autorisez la caméra dans les paramètres du navigateur.</p>
            <button className="text-sm text-slate-400 underline" onClick={() => router.push("/")}>Retour</button>
          </div>
        )}

        {/* Landmark overlay */}
        {width > 0 && height > 0 && (
          <FaceMeshOverlay
            landmarks={landmarks}
            width={width} height={height}
            imageWidth={videoRef.current?.videoWidth ?? width}
            imageHeight={videoRef.current?.videoHeight ?? height}
          />
        )}

        {/* Timer -- top left */}
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 pointer-events-none">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-mono text-white">{formatTime(sessionSec)}</span>
        </div>

        {/* FPS -- top right */}
        {mediaReady && (
          <div className="absolute right-3 top-3 rounded-full bg-black/50 px-2.5 py-1 pointer-events-none">
            <span className="text-xs font-mono text-white">{fps} fps</span>
          </div>
        )}

        {/* Status badge -- top center */}
        <div className="absolute left-1/2 top-3 -translate-x-1/2 pointer-events-none">
          <StatusBadge status={status} />
        </div>

        {/* AU toggle + panel -- right side below FPS */}
        {mediaReady && (
          <div className="absolute right-2.5 top-10 z-20 flex flex-col items-end gap-1">
            <button
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${showAU ? "bg-indigo-600 text-white" : "bg-black/50 text-slate-300"}`}
              onClick={() => setShowAU((v) => !v)}
            >
              AU
            </button>
            {showAU && <AUBarsPanel aus={displayAUs} />}
          </div>
        )}

        {/* Loading / error overlay */}
        {(status === "loading" || status === "error") && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <p className="text-sm text-white px-4 text-center">
              {status === "error" ? "Erreur de chargement" : loadingMessage || "Initialisation de l'IA..."}
            </p>
          </div>
        )}

        {/* Calibration overlay */}
        {isCalibrating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            <p className="text-base font-semibold text-white">Calibration en cours</p>
            <p className="text-sm text-slate-300 text-center px-8">Regardez la caméra et gardez une expression neutre</p>
            <div className="h-2 w-48 overflow-hidden rounded-full bg-[#1e3a5f]">
              <div className="h-full rounded-full bg-indigo-500 transition-all duration-200" style={{ width: `${Math.round(calibrationProgress * 100)}%` }} />
            </div>
            <p className="text-sm font-mono text-slate-300">
              {Math.max(0, Math.ceil((1 - calibrationProgress) * settings.calibrationDurationSec))} s
            </p>
          </div>
        )}

        {/* Calibration done badge */}
        {showCalibDone && !isCalibrating && (
          <div className="absolute left-1/2 bottom-16 -translate-x-1/2 rounded-full bg-green-600/90 px-4 py-1.5 pointer-events-none">
            <span className="text-sm font-medium text-white">Calibration terminée</span>
          </div>
        )}

        {/* Switch camera -- bottom left */}
        {mediaReady && (
          <button
            className="absolute left-3 bottom-3 rounded-full bg-gray-700/90 p-2 text-white shadow-lg transition hover:bg-gray-600"
            onClick={switchCamera} aria-label="Changer de caméra"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}

        {/* Mark event -- bottom right */}
        {mediaReady && (
          <button
            className="absolute right-3 bottom-3 rounded-full bg-indigo-600/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg transition hover:bg-indigo-700"
            onClick={() => setShowAnnotModal(true)}
          >
            + Marquer
          </button>
        )}
      </div>

      {/* ── Dashboard 40% ───────────────────────────────────────────────── */}
      <div ref={dashRef} className="flex flex-[4] min-h-0 flex-col gap-1.5 overflow-hidden bg-[#0b1628] px-3 pt-2 pb-1">
        {/* Row 1: Gauge + Stats */}
        <div className="flex gap-3">
          <div className="flex items-center justify-center">
            <CircularGauge score={gaugeScore} />
          </div>
          <div className="flex flex-1 flex-col justify-center gap-1">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-500">PSPI lissé</span>
              <p className="text-lg font-bold leading-tight transition-colors duration-300" style={{ color: scoreReady ? pspiColor(rawPspi) : "#64748b" }}>
                {scoreReady ? (smoothedScore ?? 0).toFixed(1) : "--"}
                {scoreReady && <span className="text-xs font-normal text-slate-500"> / {PSPI_MAX}</span>}
              </p>
            </div>
            <hr className="border-[#1e3a5f]" />
            <div className="flex gap-4">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Spikes</span>
                <p className="text-base font-bold leading-tight" style={{ color: scoreReady && spikeCount > 0 ? "#ef4444" : "#64748b" }}>
                  {scoreReady ? spikeCount : "--"}
                </p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Annotations</span>
                <p className="text-base font-bold leading-tight text-blue-400">{annotations.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Calibration banner or sparkline */}
        {!scoreReady ? (
          <div className="rounded-lg bg-[#13243d] px-3 py-2">
            <p className="text-xs text-slate-400">
              {isCalibrating
                ? `Calibration... ${Math.round(calibrationProgress * 100)}% -- Gardez une expression neutre`
                : status === "detected"
                  ? "Visage détecté -- appuyez sur \"Calibrer\" pour démarrer l'analyse"
                  : "En attente de détection du visage..."}
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline justify-between mb-0.5">
              <span className="text-[10px] font-medium text-slate-300">Historique PSPI</span>
              <span className="text-[9px] text-slate-500">{HISTORY_SEC} dernières secondes</span>
            </div>
            <PainHistoryChart data={chartData} annotations={annotations} currentSec={sessionSec} chartWidth={chartWidth} />
          </div>
        )}

      </div>

      {/* ── iOS-style bottom bar ──────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex gap-3 border-t border-white/10 bg-[#0a1222] px-4 pt-2"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <button className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white transition active:bg-red-700" onClick={handleStop}>
          Arrêter
        </button>
        {mediaReady && !isCalibrating && (
          <button
            className={`flex-1 rounded-xl py-3 text-sm font-semibold text-white transition ${calibrationComplete ? "bg-green-600 active:bg-green-700" : "bg-indigo-600 active:bg-indigo-700"}`}
            onClick={startCalibration}
          >
            {calibrationComplete ? "Re-calibrer" : `Calibrer ${settings.calibrationDurationSec} s`}
          </button>
        )}
      </div>

      {/* ── Annotation modal ────────────────────────────────────────────── */}
      <AnnotationModal
        visible={showAnnotModal}
        currentSec={sessionSec}
        currentPspi={rawPspi}
        onSave={handleSaveAnnot}
        onCancel={() => setShowAnnotModal(false)}
      />
    </div>
  );
}
