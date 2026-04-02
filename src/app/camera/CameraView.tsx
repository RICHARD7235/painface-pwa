"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useCamera } from "../../hooks/useCamera";
import { useFaceMesh } from "../../hooks/useFaceMesh";
import { FaceMeshOverlay } from "../../components/FaceMeshOverlay";
import type { ActionUnitsResult, PainLevel, PainScore } from "../../types/actionUnits";
import type { DetectionStatus } from "../../types/facemesh";

// ---- Helpers ----------------------------------------------------------------

function getStatusText(status: DetectionStatus): string {
  switch (status) {
    case "loading":
      return "Chargement...";
    case "no_face":
      return "Aucun visage";
    case "detected":
      return "Visage détecté";
    case "partial":
      return "Partiellement visible";
    case "too_far":
      return "Trop loin";
    case "rotated":
      return "Tête tournée";
    case "error":
      return "Erreur";
  }
}

function getStatusColor(status: DetectionStatus): string {
  switch (status) {
    case "detected":
      return "#22c55e";
    case "no_face":
    case "error":
      return "#ef4444";
    case "partial":
    case "too_far":
    case "rotated":
      return "#f59e0b";
    case "loading":
      return "#6b7280";
  }
}

function barColor(score: number): string {
  if (score === 0) return "#374151";
  if (score <= 2) return "#22c55e";
  if (score === 3) return "#f59e0b";
  return "#ef4444";
}

function painLevelColor(level: PainLevel): string {
  switch (level) {
    case "absent":
      return "#374151";
    case "léger":
      return "#22c55e";
    case "modéré":
      return "#f59e0b";
    case "intense":
      return "#ef4444";
    case "sévère":
      return "#7c3aed";
  }
}

// ---- Sub-components ---------------------------------------------------------

const AU_ROWS: { key: keyof Omit<ActionUnitsResult, "timestamp">; label: string }[] = [
  { key: "au4", label: "AU4" },
  { key: "au6", label: "AU6" },
  { key: "au7", label: "AU7" },
  { key: "au9", label: "AU9" },
  { key: "au10", label: "AU10" },
  { key: "au43", label: "AU43" },
];

const BAR_W = 48;
const PAIN_BAR_W = 80;

const ZERO_AU: ActionUnitsResult = {
  au4: { au: 4, score: 0, intensity: null, raw: 0 },
  au6: { au: 6, score: 0, intensity: null, raw: 0 },
  au7: { au: 7, score: 0, intensity: null, raw: 0 },
  au9: { au: 9, score: 0, intensity: null, raw: 0 },
  au10: { au: 10, score: 0, intensity: null, raw: 0 },
  au43: { au: 43, score: 0, intensity: null, raw: 0 },
  timestamp: 0,
};

function StatusBadge({ status }: { status: DetectionStatus }) {
  if (status === "loading") return null;
  const text = getStatusText(status);
  const color = getStatusColor(status);
  return (
    <span
      className="rounded-full px-4 py-1.5 text-sm font-semibold text-white"
      style={{ backgroundColor: color + "CC" }}
    >
      {text}
    </span>
  );
}

function LoadingOverlay({
  message,
  isError,
}: {
  message: string;
  isError?: boolean;
}) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 px-8">
      {isError ? (
        <span className="text-4xl">{"\u26A0\uFE0F"}</span>
      ) : (
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
      )}
      <p
        className={`mt-4 mb-2 text-lg font-bold ${isError ? "text-red-400" : "text-white"}`}
      >
        {isError ? "Erreur de chargement" : "Initialisation de l\u2019IA"}
      </p>
      <p className="text-center text-sm leading-relaxed text-gray-400">
        {message || "Chargement du modele MediaPipe...\n(10-30 s au premier lancement)"}
      </p>
      {isError && (
        <p className="mt-3 text-center text-sm text-red-300">
          {"Verifiez votre connexion internet\npuis rechargez la page."}
        </p>
      )}
    </div>
  );
}

function AUBarsPanel({ aus }: { aus: ActionUnitsResult }) {
  return (
    <div
      className="absolute top-24 right-2.5 z-20 rounded-lg px-2.5 py-2"
      style={{ backgroundColor: "rgba(0,0,0,0.60)" }}
    >
      {AU_ROWS.map(({ key, label }) => {
        const score = aus[key].score;
        const fill = (score / 5) * BAR_W;
        const color = barColor(score);
        return (
          <div key={key} className="my-0.5 flex items-center gap-1">
            <span className="w-8 font-mono text-xs text-gray-300">{label}</span>
            <div
              className="overflow-hidden rounded-sm"
              style={{ width: BAR_W, height: 6, backgroundColor: "#1f2937" }}
            >
              <div
                className="rounded-sm"
                style={{ width: fill, height: 6, backgroundColor: color }}
              />
            </div>
            <span
              className="w-3 text-right font-mono text-xs font-bold"
              style={{ color }}
            >
              {score}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PainScorePanel({ pain }: { pain: PainScore }) {
  const color = painLevelColor(pain.level);
  const fill = (pain.normalized / 10) * PAIN_BAR_W;
  const label = pain.level.charAt(0).toUpperCase() + pain.level.slice(1);
  return (
    <div
      className="absolute top-24 left-2.5 z-20 min-w-[110px] rounded-lg px-2.5 py-2"
      style={{ backgroundColor: "rgba(0,0,0,0.60)" }}
    >
      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-gray-400">
        Douleur
      </p>
      <div className="mb-1.5 flex items-baseline gap-0.5">
        <span className="font-mono text-2xl font-bold leading-none" style={{ color }}>
          {pain.normalized.toFixed(1)}
        </span>
        <span className="font-mono text-sm text-gray-500">/10</span>
        <span className="ml-1.5 text-xs font-semibold" style={{ color }}>
          {label}
        </span>
      </div>
      <div
        className="overflow-hidden rounded-sm"
        style={{ width: PAIN_BAR_W, height: 5, backgroundColor: "#1f2937" }}
      >
        <div
          className="rounded-sm"
          style={{ width: fill, height: 5, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function CalibrationOverlay({ progress }: { progress: number }) {
  const secondsLeft = Math.max(0, Math.ceil((1 - progress) * 15));
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/85 px-10">
      <p className="mb-2.5 text-xl font-bold text-white">Calibration en cours</p>
      <p className="mb-7 text-center text-sm leading-relaxed text-gray-400">
        {"Regardez la camera\net gardez une expression neutre"}
      </p>
      <div className="h-2 w-full overflow-hidden rounded bg-gray-800">
        <div
          className="h-2 rounded bg-indigo-500 transition-all"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <p className="mt-4 font-mono text-3xl font-bold text-white">{secondsLeft} s</p>
    </div>
  );
}

function CalibrationDoneBadge() {
  return (
    <div className="absolute top-14 left-1/2 z-40 -translate-x-1/2 rounded-full px-4 py-2 bg-green-600/80">
      <span className="text-sm font-bold text-white">
        {"Calibration terminee \u2713"}
      </span>
    </div>
  );
}

// ---- Main CameraView --------------------------------------------------------

export default function CameraView() {
  const {
    videoRef,
    permission,
    startCamera,
    stopCamera,
    error: cameraError,
  } = useCamera();

  const {
    landmarks,
    status,
    fps,
    loadingMessage,
    actionUnits,
    painScore,
    calibrationProgress,
    isCalibrating,
    calibrationComplete,
    startCalibration,
    startDetection,
    stopDetection,
  } = useFaceMesh(videoRef);

  const [showCalibDone, setShowCalibDone] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Start camera on mount
  useEffect(() => {
    startCamera("user");
    return () => {
      stopCamera();
      stopDetection();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start detection once camera is ready
  const handleVideoPlaying = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      setDimensions({ width: v.clientWidth, height: v.clientHeight });
    }
    startDetection();
  }, [startDetection, videoRef]);

  // Track resize
  useEffect(() => {
    const handleResize = () => {
      const v = videoRef.current;
      if (v) {
        setDimensions({ width: v.clientWidth, height: v.clientHeight });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [videoRef]);

  // Calibration done badge (2.5s)
  useEffect(() => {
    if (!calibrationComplete) return;
    setShowCalibDone(true);
    const t = setTimeout(() => setShowCalibDone(false), 2500);
    return () => clearTimeout(t);
  }, [calibrationComplete]);

  // Permission: prompt
  if (permission === "prompt") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
      </div>
    );
  }

  // Permission: denied
  if (permission === "denied" || cameraError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 px-6">
        <p className="mb-4 text-center text-lg text-white">
          {"L\u2019acces a la camera est necessaire pour l\u2019analyse faciale"}
        </p>
        <button
          className="rounded-xl bg-indigo-600 px-8 py-3 text-base font-semibold text-white hover:bg-indigo-700"
          onClick={() => startCamera("user")}
        >
          Autoriser la Camera
        </button>
        <Link href="/" className="mt-4 px-8 py-3 text-base text-gray-400 hover:text-white">
          Retour
        </Link>
      </div>
    );
  }

  const mediaReady = status !== "loading" && status !== "error";
  const displayAUs = actionUnits ?? ZERO_AU;
  const { width, height } = dimensions;

  return (
    <div className="relative flex h-screen w-screen flex-col bg-black">
      {/* Video feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onPlaying={handleVideoPlaying}
        className="h-full w-full object-cover"
        style={{ transform: "scaleX(-1)" }}
      />

      {/* Face mesh overlay (468 green dots) */}
      {width > 0 && height > 0 && (
        <FaceMeshOverlay
          landmarks={landmarks}
          width={width}
          height={height}
          imageWidth={videoRef.current?.videoWidth ?? width}
          imageHeight={videoRef.current?.videoHeight ?? height}
        />
      )}

      {/* Status badge (top center) */}
      <div className="absolute top-14 left-0 right-0 z-20 flex justify-center pointer-events-none">
        <StatusBadge status={status} />
      </div>

      {/* FPS counter (top right) */}
      {mediaReady && (
        <div className="absolute top-14 right-4 z-20 pointer-events-none">
          <span className="font-mono text-sm font-semibold text-green-400">
            {fps} FPS
          </span>
        </div>
      )}

      {/* AU bars panel (right) */}
      {mediaReady && <AUBarsPanel aus={displayAUs} />}

      {/* Pain score panel (left) */}
      {mediaReady && painScore && <PainScorePanel pain={painScore} />}

      {/* Loading / error overlay */}
      {(status === "loading" || status === "error") && (
        <LoadingOverlay message={loadingMessage} isError={status === "error"} />
      )}

      {/* Calibration overlay */}
      {isCalibrating && <CalibrationOverlay progress={calibrationProgress} />}

      {/* Calibration success badge (2.5s) */}
      {showCalibDone && !isCalibrating && <CalibrationDoneBadge />}

      {/* Bottom control bar */}
      <div className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-between gap-3 bg-black/55 px-6 pb-10 pt-4">
        <Link
          href="/"
          className="rounded-xl bg-red-600 px-8 py-3 text-center text-base font-semibold text-white hover:bg-red-700"
        >
          Arreter
        </Link>

        {mediaReady && !isCalibrating && (
          <button
            className={`flex-1 rounded-xl py-3 text-center text-sm font-semibold text-white ${
              calibrationComplete
                ? "bg-green-700 hover:bg-green-800"
                : "bg-indigo-600 hover:bg-indigo-700"
            }`}
            onClick={startCalibration}
          >
            {calibrationComplete ? "Re-calibrer" : "Calibrer (15\u00A0s)"}
          </button>
        )}
      </div>
    </div>
  );
}
