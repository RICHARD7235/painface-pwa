"use client";

/**
 * CameraView -- Écran unifié caméra + monitoring PSPI.
 *
 * Layout clinical : zone caméra plein cadre (sombre) + dashboard ivoire en dock.
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

const PSPI_GREEN = "#4C7C5B";
const PSPI_AMBER = "#B67A1F";
const PSPI_ROSE = "#B04447";
const ACCENT = "#2F4B8A";

function pspiColor(score: number): string {
  if (score <= 4) return PSPI_GREEN;
  if (score <= 8) return PSPI_AMBER;
  return PSPI_ROSE;
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
    case "loading": return "Chargement";
    case "no_face": return "Aucun visage";
    case "detected": return "Détection stable";
    case "partial": return "Partiellement visible";
    case "too_far": return "Trop loin";
    case "rotated": return "Tête tournée";
    case "error": return "Erreur";
  }
}

function getStatusTint(status: DetectionStatus): string {
  switch (status) {
    case "detected": return PSPI_GREEN;
    case "no_face": case "error": return PSPI_ROSE;
    case "partial": case "too_far": case "rotated": return PSPI_AMBER;
    case "loading": return "#94a3b8";
  }
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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

// ---- AU overlay (glass chip over camera) ------------------------------------

const AU_ROWS: { key: keyof Omit<ActionUnitsResult, "timestamp">; label: string }[] = [
  { key: "au4", label: "AU4" },
  { key: "au6", label: "AU6" },
  { key: "au7", label: "AU7" },
  { key: "au9", label: "AU9" },
  { key: "au10", label: "AU10" },
  { key: "au43", label: "AU43" },
];

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
  if (score === 0) return "#2a3040";
  if (score <= 2) return PSPI_GREEN;
  if (score === 3) return PSPI_AMBER;
  return PSPI_ROSE;
}

function AUBarsPanel({ aus }: { aus: ActionUnitsResult }) {
  return (
    <div
      className="w-[128px] rounded-[12px] px-3 py-2.5"
      style={{
        background: "rgba(11,14,18,0.72)",
        backdropFilter: "blur(14px)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        className="mb-2 text-[9px] uppercase"
        style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em" }}
      >
        Action units
      </div>
      {AU_ROWS.map(({ key, label }) => {
        const score = aus[key].score;
        const color = auBarColor(score);
        return (
          <div key={key} className="flex items-center gap-2 mb-[5px]">
            <span
              className="w-[26px] text-[10px]"
              style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.7)" }}
            >
              {label}
            </span>
            <div className="flex-1 overflow-hidden rounded-sm" style={{ height: 3, background: "rgba(255,255,255,0.08)" }}>
              <div style={{ width: `${(score / 5) * 100}%`, height: "100%", background: color }} />
            </div>
            <span
              className="w-2 text-right text-[10px]"
              style={{ fontFamily: "var(--font-mono)", color: "#fff" }}
            >
              {score}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---- Glass pill badges -------------------------------------------------------

function StatusBadge({ status }: { status: DetectionStatus }) {
  if (status === "loading") return null;
  const tint = getStatusTint(status);
  return (
    <div
      className="px-3.5 py-1.5 rounded-full"
      style={{
        background: `${tint}26`,
        backdropFilter: "blur(12px)",
        border: `1px solid ${tint}59`,
      }}
    >
      <span
        className="text-[10.5px] uppercase"
        style={{ fontFamily: "var(--font-mono)", color: tint === "#94a3b8" ? "#fff" : tint, letterSpacing: "0.06em" }}
      >
        ● {getStatusText(status)}
      </span>
    </div>
  );
}

function RecChip({ seconds }: { seconds: number }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-full"
      style={{
        background: "rgba(11,14,18,0.55)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <span
        className="inline-block h-[7px] w-[7px] rounded-full animate-pulse"
        style={{ background: "#E74848", boxShadow: "0 0 8px #E74848" }}
      />
      <span className="text-[11px] text-white" style={{ fontFamily: "var(--font-mono)" }}>
        REC · {formatTime(seconds)}
      </span>
    </div>
  );
}

function FpsChip({ fps }: { fps: number }) {
  return (
    <div
      className="px-3 py-1.5 rounded-full"
      style={{
        background: "rgba(11,14,18,0.55)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <span className="text-[11px]" style={{ fontFamily: "var(--font-mono)", color: "#9FB9E6" }}>
        {fps}
        <span className="ml-[3px]" style={{ color: "rgba(255,255,255,0.4)" }}>fps</span>
      </span>
    </div>
  );
}

// ---- PainHistoryChart (dashboard) -------------------------------------------

function PainHistoryChart({
  data, annotations, currentSec, chartWidth,
}: {
  data: PainDataPoint[];
  annotations: SessionAnnotation[];
  currentSec: number;
  chartWidth: number;
}) {
  const W = chartWidth;
  const H = 88;
  const maxSec = currentSec;
  const minSec = maxSec - HISTORY_SEC;
  const toX = (sec: number) => ((sec - minSec) / HISTORY_SEC) * W;
  const toY = (s: number) => H - (s / PSPI_MAX) * (H - 4) - 2;

  const visible = data.filter((d) => d.sessionSec >= minSec - 1);
  if (W < 10) return null;
  const points = visible.map((d) => `${toX(d.sessionSec).toFixed(1)},${toY(d.score).toFixed(1)}`).join(" ");
  const visibleAnnots = annotations.filter((a) => a.sessionSec >= minSec && a.sessionSec <= maxSec);

  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      {/* Color bands */}
      <rect x="0" y="0" width={W} height={H * 0.25} fill={PSPI_ROSE} opacity={0.04} />
      <rect x="0" y={H * 0.25} width={W} height={H * 0.25} fill={PSPI_AMBER} opacity={0.05} />
      <rect x="0" y={H * 0.5} width={W} height={H * 0.5} fill={PSPI_GREEN} opacity={0.04} />
      {/* Grid */}
      {[0.25, 0.5, 0.75].map((r) => (
        <line key={r} x1="0" y1={H * r} x2={W} y2={H * r} stroke="var(--color-ink-15)" strokeDasharray="2 3" strokeWidth={0.5} />
      ))}
      {/* Line */}
      {visible.length >= 2 && (
        <polyline points={points} fill="none" stroke={ACCENT} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {/* Annotation ticks */}
      {visibleAnnots.map((a) => (
        <line key={a.id} x1={toX(a.sessionSec)} y1="0" x2={toX(a.sessionSec)} y2={H} stroke="var(--color-ink-30)" strokeDasharray="1 2" strokeWidth={0.5} />
      ))}
    </svg>
  );
}

// ---- Annotation modal (clinical light) ---------------------------------------

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E12]/60 backdrop-blur-sm">
      <div className="w-[90%] max-w-md rounded-[20px] bg-[var(--color-ivory)] p-5" style={{ border: "1px solid var(--color-ink-08)" }}>
        <div className="flex items-center justify-between mb-3">
          <h3
            className="text-[var(--color-ink)]"
            style={{ fontFamily: "var(--font-serif)", fontSize: 22, letterSpacing: "-0.3px" }}
          >
            Marquer un événement
          </h3>
          <span
            className="px-2.5 py-0.5 rounded-full text-[11px]"
            style={{
              fontFamily: "var(--font-mono)",
              color: pspiColor(currentPspi),
              background: `${pspiColor(currentPspi)}14`,
              border: `1px solid ${pspiColor(currentPspi)}33`,
            }}
          >
            PSPI {currentPspi.toFixed(1)}
          </span>
        </div>
        <div className="flex gap-2 mb-3">
          {(["text", "voice"] as const).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                className="flex-1 rounded-[10px] py-2 text-[13px]"
                style={{
                  background: active ? "var(--color-ink)" : "var(--color-paper)",
                  color: active ? "var(--color-ivory)" : "var(--color-ink-70)",
                  border: active ? "1px solid var(--color-ink)" : "1px solid var(--color-ink-15)",
                  fontWeight: 500,
                }}
                onClick={() => setMode(m)}
              >
                {m === "text" ? "Texte" : "Voix"}
              </button>
            );
          })}
        </div>
        {mode === "text" ? (
          <>
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2">
              {QUICK_LABELS.map((lbl) => {
                const active = text === lbl;
                return (
                  <button
                    key={lbl}
                    className="whitespace-nowrap rounded-full px-3 py-1 text-[12px]"
                    style={{
                      background: active ? "var(--color-ink)" : "transparent",
                      color: active ? "var(--color-ivory)" : "var(--color-ink-70)",
                      border: `1px solid ${active ? "var(--color-ink)" : "var(--color-ink-15)"}`,
                    }}
                    onClick={() => setText(lbl)}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
            <textarea
              className="w-full rounded-[12px] border border-[var(--color-ink-15)] bg-[var(--color-paper)] p-3 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-50)] focus:border-[var(--color-accent)] focus:outline-none"
              placeholder="Ou saisissez une note libre..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
              rows={2}
            />
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4">
            {!recording && !audioBlob && (
              <button
                className="flex items-center gap-2 rounded-full bg-[var(--color-paper)] px-5 py-2.5 text-[13px] text-[var(--color-ink)]"
                style={{ border: "1px solid var(--color-ink-15)" }}
                onClick={handleStartRecording}
              >
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PSPI_ROSE }} />
                Appuyez pour enregistrer
              </button>
            )}
            {recording && (
              <button
                className="flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] animate-pulse"
                style={{
                  background: `${PSPI_ROSE}14`,
                  color: PSPI_ROSE,
                  border: `1px solid ${PSPI_ROSE}33`,
                }}
                onClick={handleStopRecording}
              >
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PSPI_ROSE }} />
                Enregistrement... {formatTime(recDuration)}
              </button>
            )}
            {!recording && audioBlob && (
              <div className="flex items-center gap-3 text-[13px] text-[var(--color-ink-70)]">
                <span>Note vocale · {formatTime(recDuration)}</span>
                <button className="underline" style={{ color: ACCENT }} onClick={() => { setAudioBlob(null); setRecDuration(0); }}>
                  Refaire
                </button>
              </div>
            )}
          </div>
        )}
        <div className="mt-4 flex gap-3">
          <button
            className="flex-1 rounded-[12px] border border-[var(--color-ink-15)] py-2.5 text-[13px] font-medium text-[var(--color-ink)]"
            onClick={onCancel}
          >
            Annuler
          </button>
          <button
            className="flex-1 rounded-[12px] py-2.5 text-[13px] font-medium text-[var(--color-ivory)] transition-all"
            style={{
              background: canSave ? "var(--color-ink)" : "var(--color-ink-30)",
              cursor: canSave ? "pointer" : "not-allowed",
            }}
            onClick={handleSave}
            disabled={!canSave}
          >
            Enregistrer
          </button>
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

  // Session timer
  const sessionStartRef = useRef(Date.now());
  const [sessionSec, setSessionSec] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSessionSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // History buffers
  const historyRef = useRef<PainDataPoint[]>([]);
  const fullHistoryRef = useRef<PainDataPoint[]>([]);
  const lastSampleRef = useRef(0);
  const [chartData, setChartData] = useState<PainDataPoint[]>([]);

  useEffect(() => {
    if (currentScore === null || !calibrationComplete) return;
    if (Math.abs(sessionSec - lastSampleRef.current) < 1 / SAMPLE_RATE) return;
    lastSampleRef.current = sessionSec;
    const point: PainDataPoint = { sessionSec, score: currentScore };
    fullHistoryRef.current = [...fullHistoryRef.current, point];
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

  // Video dimensions
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
  const [chartWidth, setChartWidth] = useState(340);
  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setChartWidth(entry.contentRect.width - 20);
    });
    if (dashRef.current) ro.observe(dashRef.current);
    return () => ro.disconnect();
  }, []);

  // Save session + navigate
  const handleStop = useCallback(async () => {
    stopDetection();
    stopCamera();
    if (sessionSec >= 5 && fullHistoryRef.current.length > 0) {
      try {
        const scores = fullHistoryRef.current;
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
  const smoothedPspi = smoothedScore ?? 0;
  const scoreReady = calibrationComplete;
  const { width, height } = dimensions;

  const heroColor = scoreReady ? pspiColor(smoothedPspi) : "var(--color-ink-30)";

  return (
    <div className="flex flex-1 min-h-0 flex-col" style={{ background: "#0B0E12" }}>
      {/* ── Camera zone (dark, full bleed) ───────────────────────────────────── */}
      <div className="relative flex-[6] overflow-hidden" style={{ background: "#0B0E12" }}>
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover -scale-x-100"
          autoPlay
          playsInline
          muted
          onPlaying={handleVideoPlaying}
        />

        {/* Permission prompts */}
        {permission === "prompt" && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4" style={{ background: "#0B0E12", color: "#fff" }}>
            <p className="px-8 text-center text-[14px]">L&apos;accès à la caméra est requis pour l&apos;analyse faciale.</p>
            <button
              className="rounded-[12px] px-6 py-3 text-[14px] font-medium"
              style={{ background: "var(--color-ivory)", color: "var(--color-ink)" }}
              onClick={() => startCamera("user").then(startDetection)}
            >
              Autoriser la caméra
            </button>
            <button className="text-[13px] text-[#9FB9E6] underline" onClick={() => router.push("/")}>Retour</button>
          </div>
        )}

        {(permission === "denied" || cameraError) && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4" style={{ background: "#0B0E12", color: "#fff" }}>
            <p className="px-8 text-center text-[14px]">Accès caméra refusé. Autorisez la caméra dans les paramètres du navigateur.</p>
            <button className="text-[13px] text-[#9FB9E6] underline" onClick={() => router.push("/")}>Retour</button>
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

        {/* Top HUD — REC left, FPS right */}
        <div className="absolute left-5 right-5 top-5 flex items-start justify-between pointer-events-none">
          <RecChip seconds={sessionSec} />
          {mediaReady && <FpsChip fps={fps} />}
        </div>

        {/* Center status */}
        <div className="absolute left-1/2 top-5 -translate-x-1/2 pointer-events-none">
          <StatusBadge status={status} />
        </div>

        {/* AU panel — right side */}
        {mediaReady && (
          <div className="absolute right-3 top-[86px] z-20 flex flex-col items-end gap-1.5">
            <button
              className="px-2.5 py-1 rounded-full text-[10px] font-medium"
              style={{
                background: showAU ? "rgba(47,75,138,0.35)" : "rgba(11,14,18,0.55)",
                color: showAU ? "#D6E2F5" : "rgba(255,255,255,0.7)",
                border: `1px solid ${showAU ? "rgba(159,185,230,0.3)" : "rgba(255,255,255,0.1)"}`,
                backdropFilter: "blur(12px)",
                fontFamily: "var(--font-mono)",
              }}
              onClick={() => setShowAU((v) => !v)}
            >
              AU
            </button>
            {showAU && <AUBarsPanel aus={displayAUs} />}
          </div>
        )}

        {/* Loading / error */}
        {(status === "loading" || status === "error") && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(11,14,18,0.7)" }}>
            <p className="px-4 text-center text-[14px] text-white">
              {status === "error" ? "Erreur de chargement" : loadingMessage || "Initialisation de l'IA..."}
            </p>
          </div>
        )}

        {/* Calibration overlay */}
        {isCalibrating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: "rgba(11,14,18,0.72)" }}>
            <p
              className="text-white"
              style={{ fontFamily: "var(--font-serif)", fontSize: 26, letterSpacing: "-0.3px" }}
            >
              Calibration en cours
            </p>
            <p className="px-8 text-center text-[13px] text-[#9FB9E6]">
              Regardez la caméra et gardez une expression neutre
            </p>
            <div className="h-[3px] w-48 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.15)" }}>
              <div className="h-full rounded-full transition-all duration-200" style={{ width: `${Math.round(calibrationProgress * 100)}%`, background: "#9FB9E6" }} />
            </div>
            <p className="text-[13px]" style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.8)" }}>
              {Math.max(0, Math.ceil((1 - calibrationProgress) * settings.calibrationDurationSec))} s
            </p>
          </div>
        )}

        {/* Calibration done */}
        {showCalibDone && !isCalibrating && (
          <div
            className="absolute left-1/2 bottom-20 -translate-x-1/2 rounded-full px-4 py-1.5 pointer-events-none"
            style={{ background: `${PSPI_GREEN}CC`, color: "#fff", backdropFilter: "blur(10px)" }}
          >
            <span className="text-[12.5px] font-medium">Calibration terminée</span>
          </div>
        )}

        {/* Bottom controls — flip / marquer */}
        {mediaReady && (
          <div className="absolute left-5 right-5 bottom-4 flex items-center justify-between">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full text-white"
              style={{
                background: "rgba(11,14,18,0.55)",
                border: "1px solid rgba(255,255,255,0.12)",
                backdropFilter: "blur(12px)",
              }}
              onClick={switchCamera}
              aria-label="Changer de caméra"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7h11a5 5 0 015 5" />
                <path d="M20 17H9a5 5 0 01-5-5" />
                <path d="M7 4L4 7l3 3" />
                <path d="M17 20l3-3-3-3" />
              </svg>
            </button>
            <button
              className="flex items-center gap-2 rounded-full px-4 py-2"
              style={{
                background: "rgba(47,75,138,0.35)",
                border: "1px solid rgba(159,185,230,0.3)",
                color: "#D6E2F5",
                backdropFilter: "blur(12px)",
              }}
              onClick={() => setShowAnnotModal(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12V4h8l9 9-8 8-9-9z" />
                <circle cx="8" cy="8" r="1.2" fill="currentColor" />
              </svg>
              <span className="text-[12px] font-medium">Marquer</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Dashboard dock — ivory ──────────────────────────────────────────── */}
      <div
        ref={dashRef}
        className="flex-[4] min-h-0 flex flex-col overflow-hidden px-6 pt-4 pb-3"
        style={{
          background: "var(--color-ivory)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          color: "var(--color-ink)",
          marginTop: -12,
          position: "relative",
          zIndex: 5,
        }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: "var(--color-ink-15)" }} />

        {/* Hero score + stats row */}
        <div className="flex items-end justify-between mb-3">
          <div>
            <span className="text-[10px] uppercase text-[var(--color-ink-50)]" style={{ letterSpacing: "0.12em", fontWeight: 500 }}>
              PSPI lissé
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 60,
                  color: heroColor,
                  lineHeight: 0.9,
                  letterSpacing: "-0.02em",
                  transition: "color 200ms",
                }}
              >
                {scoreReady ? smoothedPspi.toFixed(1) : "--"}
              </span>
              <span className="text-[13px] text-[var(--color-ink-50)]" style={{ fontFamily: "var(--font-mono)" }}>
                /{PSPI_MAX}
              </span>
            </div>
            {scoreReady && (
              <div className="mt-0.5 text-[12.5px]" style={{ color: heroColor }}>
                {pspiLabel(smoothedPspi)} · brut {rawPspi.toFixed(1)}
              </div>
            )}
          </div>

          <div className="flex gap-4 mb-1">
            <div className="text-right">
              <span className="text-[10px] uppercase text-[var(--color-ink-50)]" style={{ letterSpacing: "0.12em", fontWeight: 500 }}>
                Pics
              </span>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, color: spikeCount > 0 ? PSPI_ROSE : "var(--color-ink-30)", lineHeight: 1 }}>
                {scoreReady ? spikeCount : "--"}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase text-[var(--color-ink-50)]" style={{ letterSpacing: "0.12em", fontWeight: 500 }}>
                Notes
              </span>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, color: "var(--color-accent-ink)", lineHeight: 1 }}>
                {annotations.length}
              </div>
            </div>
          </div>
        </div>

        {/* Chart panel or calibration banner */}
        {!scoreReady ? (
          <div className="rounded-[14px] px-4 py-3" style={{ background: "var(--color-paper)", border: "1px solid var(--color-ink-08)" }}>
            <p className="text-[12.5px] text-[var(--color-ink-70)]">
              {isCalibrating
                ? `Calibration en cours · ${Math.round(calibrationProgress * 100)}% — Gardez une expression neutre`
                : status === "detected"
                  ? "Visage détecté — appuyez sur « Calibrer » pour démarrer l'analyse"
                  : "En attente de détection du visage..."}
            </p>
          </div>
        ) : (
          <div className="rounded-[14px] px-3 py-2" style={{ background: "var(--color-paper)", border: "1px solid var(--color-ink-08)" }}>
            <div className="flex justify-between mb-1">
              <span className="text-[9px] uppercase" style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-50)", letterSpacing: "0.08em" }}>
                {HISTORY_SEC} s · temps réel
              </span>
              <span className="text-[9px] uppercase" style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-50)", letterSpacing: "0.08em" }}>
                PSPI 0–{PSPI_MAX}
              </span>
            </div>
            <PainHistoryChart
              data={chartData}
              annotations={annotations}
              currentSec={sessionSec}
              chartWidth={chartWidth}
            />
          </div>
        )}

        {/* Bottom action bar — Arrêter + Re-calibrer */}
        <div className="mt-auto pt-3 flex gap-2.5">
          <button
            className="flex-1 rounded-[12px] py-3 text-[13.5px] font-medium transition-colors"
            style={{
              background: `${PSPI_ROSE}0d`,
              color: PSPI_ROSE,
              border: `1px solid ${PSPI_ROSE}33`,
            }}
            onClick={handleStop}
          >
            Arrêter
          </button>
          {mediaReady && !isCalibrating && (
            <button
              className="flex-[2] rounded-[12px] py-3 text-[13.5px] font-medium text-[var(--color-ivory)] transition-colors"
              style={{ background: "var(--color-ink)" }}
              onClick={startCalibration}
            >
              {calibrationComplete ? "Re-calibrer" : `Calibrer ${settings.calibrationDurationSec} s`}
            </button>
          )}
        </div>
      </div>

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
