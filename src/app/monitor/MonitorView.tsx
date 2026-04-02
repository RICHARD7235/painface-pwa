"use client";

/**
 * MonitorView -- Ecran de monitoring de douleur faciale (PWA).
 *
 * Layout :
 *   60% (haut) -> Flux camera avec overlay landmarks + cadre de guidage
 *   40% (bas)  -> Dashboard : jauge circulaire PSPI, stats, sparkline 60s
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
import { getStatusColor, getStatusText } from "../../utils/faceMeshUtils";
import type { DetectionStatus } from "../../types/facemesh";
import type { SessionAnnotation, PainDataPoint, Session } from "../../types/patient";

// ---- Constants ---------------------------------------------------------------

const HISTORY_SEC = 60;
const HISTORY_MAX = 300;
const SAMPLE_RATE = 5;

const QUICK_LABELS = [
  "Debut traitement",
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
  if (score <= 4) return "Leger";
  if (score <= 8) return "Modere";
  if (score <= 12) return "Intense";
  return "Severe";
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
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, durationMs);
  } catch {
    /* AudioContext may not be available */
  }
}

function playDoubleBip(frequency: number, durationMs: number) {
  playBeep(frequency, durationMs);
  setTimeout(() => playBeep(frequency, durationMs), durationMs + 80);
}

/** Spike beep frequency proportional to PSPI score. */
function spikeBeepFreq(score: number): number {
  return 440 + (score / PSPI_MAX) * 660;
}

// ---- SVG arc helpers ---------------------------------------------------------

function polarToXY(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const s = polarToXY(cx, cy, r, startDeg);
  const e = polarToXY(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

// ---- CircularGauge -----------------------------------------------------------

function CircularGauge({ score }: { score: number }) {
  const SIZE = 140;
  const CX = SIZE / 2;
  const CY = SIZE / 2 + 8;
  const R = 50;
  const STROKE = 11;

  const START_DEG = 135;
  const TOTAL_DEG = 270;
  const progress = Math.min(score / PSPI_MAX, 0.9999);
  const endDeg = START_DEG + progress * TOTAL_DEG;

  const bgPath = arcPath(CX, CY, R, START_DEG, START_DEG + TOTAL_DEG * 0.9999);
  const fgPath =
    progress > 0.005 ? arcPath(CX, CY, R, START_DEG, endDeg) : null;
  const color = pspiColor(score);

  const ticks = [0, 4, 8, 12, 16].map((val) => {
    const p = val / PSPI_MAX;
    const deg = START_DEG + p * TOTAL_DEG * 0.9999;
    const inner = polarToXY(CX, CY, R - 7, deg);
    const outer = polarToXY(CX, CY, R + 2, deg);
    return { key: val, inner, outer };
  });

  return (
    <svg width={SIZE} height={SIZE} className="flex-shrink-0">
      <path
        d={bgPath}
        stroke="#1e3a5f"
        strokeWidth={STROKE}
        fill="none"
        strokeLinecap="round"
      />
      {fgPath && (
        <path
          d={fgPath}
          stroke={color}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          className="transition-all duration-300"
        />
      )}
      {ticks.map((t) => (
        <line
          key={t.key}
          x1={t.inner.x}
          y1={t.inner.y}
          x2={t.outer.x}
          y2={t.outer.y}
          stroke="#1e3a5f"
          strokeWidth={1.5}
        />
      ))}
      <text
        x={CX}
        y={CY - 6}
        textAnchor="middle"
        fontSize={28}
        fontWeight="700"
        fill={color}
      >
        {score.toFixed(1)}
      </text>
      <text
        x={CX}
        y={CY + 10}
        textAnchor="middle"
        fontSize={10}
        fill="#64748b"
      >
        / {PSPI_MAX}
      </text>
      <text
        x={CX}
        y={CY + 26}
        textAnchor="middle"
        fontSize={10}
        fontWeight="600"
        fill={color}
      >
        {pspiLabel(score)}
      </text>
    </svg>
  );
}

// ---- PainHistoryChart (sparkline SVG) ----------------------------------------

function PainHistoryChart({
  data,
  annotations,
  currentSec,
  chartWidth,
}: {
  data: PainDataPoint[];
  annotations: SessionAnnotation[];
  currentSec: number;
  chartWidth: number;
}) {
  const W = chartWidth;
  const H = 72;
  const PL = 22;
  const PR = 4;
  const PT = 6;
  const PB = 14;
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
      {/* Pain zone backgrounds */}
      <rect
        x={PL}
        y={yTop}
        width={CW}
        height={yZoneMid - yTop}
        fill="rgba(239,68,68,0.07)"
      />
      <rect
        x={PL}
        y={yZoneMid}
        width={CW}
        height={yZoneGreen - yZoneMid}
        fill="rgba(245,158,11,0.07)"
      />
      <rect
        x={PL}
        y={yZoneGreen}
        width={CW}
        height={yBottom - yZoneGreen}
        fill="rgba(34,197,94,0.07)"
      />

      {/* Horizontal grid */}
      {[4, 8, 12].map((v) => (
        <line
          key={v}
          x1={PL}
          y1={toY(v)}
          x2={PL + CW}
          y2={toY(v)}
          stroke="#1e3a5f"
          strokeWidth={0.5}
          strokeDasharray="3,4"
        />
      ))}

      {/* Y labels */}
      {[0, 8, 16].map((v) => (
        <text
          key={v}
          x={PL - 3}
          y={toY(v) + 4}
          textAnchor="end"
          fontSize={8}
          fill="#64748b"
        >
          {v}
        </text>
      ))}

      {/* X axis */}
      <line
        x1={PL}
        y1={yBottom}
        x2={PL + CW}
        y2={yBottom}
        stroke="#1e3a5f"
        strokeWidth={0.5}
      />
      <text x={PL} y={H - 2} fontSize={7} fill="#64748b">
        -{HISTORY_SEC}s
      </text>
      <text
        x={PL + CW}
        y={H - 2}
        textAnchor="end"
        fontSize={7}
        fill="#64748b"
      >
        maintenant
      </text>

      {/* Score polyline */}
      {visible.length >= 2 && (
        <polyline
          points={points}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1.8}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* Annotation markers */}
      {visibleAnnots.map((a) => (
        <line
          key={a.id}
          x1={toX(a.sessionSec)}
          y1={PT}
          x2={toX(a.sessionSec)}
          y2={yBottom}
          stroke="#f8fafc"
          strokeWidth={1}
          strokeDasharray="2,3"
          opacity={0.6}
        />
      ))}
    </svg>
  );
}

// ---- StatusBadge -------------------------------------------------------------

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

// ---- AnnotationModal ---------------------------------------------------------

function AnnotationModal({
  visible,
  currentSec,
  currentPspi,
  onSave,
  onCancel,
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

  // Reset on open
  useEffect(() => {
    if (visible) {
      setText("");
      setAudioBlob(null);
      setRecording(false);
      setRecDuration(0);
      setMode("text");
    }
  }, [visible]);

  // Recording timer
  useEffect(() => {
    if (recording) {
      recTimerRef.current = setInterval(
        () => setRecDuration((d) => d + 1),
        1000,
      );
    } else if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
    }
    return () => {
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    };
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
    try {
      mediaRecorderRef.current?.stop();
      setRecording(false);
    } catch (e) {
      console.warn("[AnnotationModal] Stop error:", e);
      setRecording(false);
    }
  }

  function handleSave() {
    const label =
      mode === "text"
        ? text.trim() || "Evenement"
        : audioBlob
          ? `Note vocale ${formatTime(recDuration)}`
          : "Note vocale";

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
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-100">
            Marquer un evenement
          </h3>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-bold"
            style={{ color: pspiColor(currentPspi), backgroundColor: "#1e3a5f" }}
          >
            PSPI {currentPspi.toFixed(1)}
          </span>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-3">
          {(["text", "voice"] as const).map((m) => (
            <button
              key={m}
              className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${
                mode === m
                  ? "bg-indigo-600 text-white"
                  : "bg-[#1e3a5f] text-slate-400"
              }`}
              onClick={() => setMode(m)}
            >
              {m === "text" ? "Texte" : "Voix"}
            </button>
          ))}
        </div>

        {mode === "text" ? (
          <>
            {/* Quick labels */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 scrollbar-hide">
              {QUICK_LABELS.map((lbl) => (
                <button
                  key={lbl}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-xs transition ${
                    text === lbl
                      ? "bg-indigo-600 text-white"
                      : "bg-[#1e3a5f] text-slate-400"
                  }`}
                  onClick={() => setText(lbl)}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <textarea
              className="w-full rounded-lg border border-[#1e3a5f] bg-[#0b1628] p-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
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
                className="flex items-center gap-2 rounded-full bg-[#1e3a5f] px-5 py-2.5 text-sm text-slate-200 transition hover:bg-[#2a4a6f]"
                onClick={handleStartRecording}
              >
                <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
                Appuyez pour enregistrer
              </button>
            )}
            {recording && (
              <button
                className="flex items-center gap-2 rounded-full bg-red-600/30 px-5 py-2.5 text-sm text-red-300 animate-pulse transition"
                onClick={handleStopRecording}
              >
                <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
                Enregistrement... {formatTime(recDuration)}
              </button>
            )}
            {!recording && audioBlob && (
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <span>Note vocale - {formatTime(recDuration)}</span>
                <button
                  className="text-indigo-400 underline"
                  onClick={() => {
                    setAudioBlob(null);
                    setRecDuration(0);
                  }}
                >
                  Refaire
                </button>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex gap-3">
          <button
            className="flex-1 rounded-lg border border-[#1e3a5f] py-2 text-sm text-slate-400 transition hover:bg-[#1e3a5f]"
            onClick={onCancel}
          >
            Annuler
          </button>
          <button
            className={`flex-1 rounded-lg py-2 text-sm font-medium text-white transition ${
              canSave
                ? "bg-indigo-600 hover:bg-indigo-700"
                : "bg-indigo-600/40 cursor-not-allowed"
            }`}
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

// ---- MonitorView (main) ------------------------------------------------------

export default function MonitorView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patientId");

  // Camera
  const { videoRef, stream, permission, startCamera, stopCamera, error } =
    useCamera();

  // Settings (reload on visibility change, like useFocusEffect)
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") {
        setSettings(loadSettings());
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  // Face mesh
  const {
    landmarks,
    status,
    fps,
    loadingMessage,
    actionUnits,
    calibrationProgress,
    isCalibrating,
    calibrationComplete,
    startCalibration,
    startDetection,
    stopDetection,
  } = useFaceMesh(videoRef);

  // Pain score with EMA + spikes
  const { smoothedScore, currentScore, painEvents } = usePainScoreFromAUs(
    actionUnits,
    {
      smoothingWindowMs: settings.smoothingWindowMs,
      spikeLowThreshold: settings.spikeLowThreshold,
      spikeHighThreshold: settings.spikeHighThreshold,
    },
    calibrationComplete,
  );

  // Gauge animation via CSS transition (replacing Animated)
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
    if (!calibrationComplete) {
      prevEventLenRef.current = painEvents.length;
      return;
    }
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

  // Auto-start camera on mount
  useEffect(() => {
    startCamera("user").then(() => {
      // Start detection once camera is ready
      startDetection();
    });
    return () => {
      stopDetection();
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Container ref for responsive chart width
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
        const moyenne =
          scores.reduce((s, p) => s + p.score, 0) / scores.length;
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
        console.warn("[MonitorView] insertSession failed:", e);
      }
    }
    router.push("/");
  }, [
    sessionSec,
    patientId,
    painEvents,
    annotations,
    stopDetection,
    stopCamera,
    router,
  ]);

  const mediaReady = permission === "granted" && status !== "loading" && status !== "error";
  const rawPspi = currentScore ?? 0;
  const scoreReady = calibrationComplete;

  return (
    <div className="flex h-[100dvh] flex-col bg-[#0b1628]">
      {/* ── Camera zone 60% ─────────────────────────────────────────────────── */}
      <div className="relative flex-[6] overflow-hidden bg-black">
        {/* Video always rendered so videoRef is available */}
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover -scale-x-100"
          autoPlay
          playsInline
          muted
        />

        {/* Permission: prompt overlay */}
        {permission === "prompt" && !stream && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#0b1628] text-slate-100">
            <p className="text-center px-8">
              L&apos;accès à la caméra est requis pour l&apos;analyse faciale.
            </p>
            <button
              className="rounded-xl bg-indigo-600 px-6 py-3 font-medium text-white"
              onClick={() => startCamera("user").then(startDetection)}
            >
              Autoriser la caméra
            </button>
            <button
              className="text-sm text-slate-400 underline"
              onClick={() => router.push("/")}
            >
              Retour
            </button>
          </div>
        )}

        {/* Permission: denied overlay */}
        {permission === "denied" && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#0b1628] text-slate-100">
            <p className="text-center px-8">
              Accès caméra refusé. Autorisez la caméra dans les paramètres du
              navigateur.
            </p>
            <button
              className="text-sm text-slate-400 underline"
              onClick={() => router.push("/")}
            >
              Retour
            </button>
          </div>
        )}

        {/* Landmark overlay */}
        <div className="absolute inset-0 pointer-events-none">
          <FaceMeshOverlay
            landmarks={landmarks}
            width={typeof window !== "undefined" ? window.innerWidth : 400}
            height={
              typeof window !== "undefined"
                ? Math.round(window.innerHeight * 0.6)
                : 480
            }
            imageWidth={videoRef.current?.videoWidth ?? 640}
            imageHeight={videoRef.current?.videoHeight ?? 480}
          />
        </div>

        {/* Timer -- top left */}
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 pointer-events-none">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-mono text-white">
            {formatTime(sessionSec)}
          </span>
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

        {/* Loading / error overlay */}
        {(status === "loading" || status === "error") && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <p className="text-sm text-white px-4 text-center">
              {status === "error"
                ? "Erreur de chargement"
                : loadingMessage || "Initialisation de l'IA..."}
            </p>
          </div>
        )}

        {/* Calibration overlay */}
        {isCalibrating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            <p className="text-base font-semibold text-white">
              Calibration en cours
            </p>
            <p className="text-sm text-slate-300 text-center px-8">
              Regardez la camera{"\n"}et gardez une expression neutre
            </p>
            <div className="h-2 w-48 overflow-hidden rounded-full bg-[#1e3a5f]">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-200"
                style={{
                  width: `${Math.round(calibrationProgress * 100)}%`,
                }}
              />
            </div>
            <p className="text-sm font-mono text-slate-300">
              {Math.max(
                0,
                Math.ceil(
                  (1 - calibrationProgress) * settings.calibrationDurationSec,
                ),
              )}{" "}
              s
            </p>
          </div>
        )}

        {/* Calibration done badge */}
        {showCalibDone && !isCalibrating && (
          <div className="absolute left-1/2 bottom-16 -translate-x-1/2 rounded-full bg-green-600/90 px-4 py-1.5 pointer-events-none">
            <span className="text-sm font-medium text-white">
              Calibration terminee
            </span>
          </div>
        )}

        {/* Mark event button -- bottom right */}
        {mediaReady && (
          <button
            className="absolute right-3 bottom-3 rounded-full bg-indigo-600/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg transition hover:bg-indigo-700"
            onClick={() => setShowAnnotModal(true)}
          >
            + Marquer
          </button>
        )}
      </div>

      {/* ── Dashboard 40% ───────────────────────────────────────────────────── */}
      <div
        ref={dashRef}
        className="flex flex-[4] flex-col gap-2 overflow-y-auto bg-[#0b1628] px-3 pt-3 pb-2"
      >
        {/* Row 1: Gauge + Stats */}
        <div className="flex gap-3">
          {/* Gauge */}
          <div className="flex items-center justify-center">
            <CircularGauge score={gaugeScore} />
          </div>

          {/* Stats */}
          <div className="flex flex-1 flex-col justify-center gap-1.5">
            {/* Smoothed PSPI */}
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                PSPI lisse
              </span>
              <p
                className="text-lg font-bold leading-tight transition-colors duration-300"
                style={{
                  color: scoreReady ? pspiColor(rawPspi) : "#64748b",
                }}
              >
                {scoreReady ? (smoothedScore ?? 0).toFixed(1) : "--"}
                {scoreReady && (
                  <span className="text-xs font-normal text-slate-500">
                    {" "}
                    / {PSPI_MAX}
                  </span>
                )}
              </p>
            </div>

            <hr className="border-[#1e3a5f]" />

            {/* Spikes */}
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Spikes douleur
              </span>
              <p
                className="text-lg font-bold leading-tight"
                style={{
                  color:
                    scoreReady && spikeCount > 0 ? "#ef4444" : "#64748b",
                }}
              >
                {scoreReady ? spikeCount : "--"}
              </p>
            </div>

            <hr className="border-[#1e3a5f]" />

            {/* Annotations count */}
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Annotations
              </span>
              <p className="text-lg font-bold leading-tight text-blue-400">
                {annotations.length}
              </p>
            </div>
          </div>
        </div>

        {/* Calibration banner */}
        {!scoreReady && (
          <div className="rounded-lg bg-[#13243d] px-3 py-2">
            <p className="text-xs text-slate-400">
              {isCalibrating
                ? `Calibration... ${Math.round(calibrationProgress * 100)} % -- Gardez une expression neutre`
                : status === "detected"
                  ? 'Visage detecte -- appuyez sur "Calibrer" apres avoir demande au patient une expression neutre'
                  : "En attente de detection du visage..."}
            </p>
          </div>
        )}

        {/* Row 2: Sparkline chart */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs font-medium text-slate-300">
              Historique PSPI
            </span>
            <span className="text-[10px] text-slate-500">
              {HISTORY_SEC} dernieres secondes
            </span>
          </div>
          <PainHistoryChart
            data={chartData}
            annotations={annotations}
            currentSec={sessionSec}
            chartWidth={chartWidth}
          />
        </div>

        {/* Controls bar */}
        <div className="flex gap-2 mt-auto pt-2 pb-1">
          <button
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
            onClick={handleStop}
          >
            Arreter
          </button>

          {mediaReady && !isCalibrating && (
            <button
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition ${
                calibrationComplete
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
              onClick={startCalibration}
            >
              {calibrationComplete
                ? "Re-calibrer"
                : `Calibrer ${settings.calibrationDurationSec} s`}
            </button>
          )}
        </div>
      </div>

      {/* ── Annotation modal ────────────────────────────────────────────────── */}
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
