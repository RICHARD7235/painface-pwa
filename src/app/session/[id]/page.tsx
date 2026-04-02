"use client";

/**
 * SessionDetailPage – Detail d'une seance : courbe de douleur, annotations,
 * spikes et export PDF.
 */

import { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getSessionById,
  getPatientById,
  deleteSession,
} from "../../../services/DatabaseService";
import { PSPI_MAX } from "../../../services/PainScoreEngine";
import type { Session, Patient } from "../../../types/patient";

// ─── Placeholder PDF export ──────────────────────────────────────────────────

async function exportPdf(_session: Session, _patient: Patient | null): Promise<void> {
  // TODO: implémenter le service PdfReportService pour la PWA
  window.alert("Export PDF : fonctionnalite en cours de developpement.");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(ts: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}min ${s}s`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

function pspiColor(score: number): string {
  if (score <= 4) return "text-green-600";
  if (score <= 8) return "text-amber-600";
  return "text-red-600";
}

function pspiColorHex(score: number): string {
  if (score <= 4) return "#16a34a";
  if (score <= 8) return "#d97706";
  return "#dc2626";
}

function pspiLabel(score: number): string {
  if (score === 0) return "Absent";
  if (score <= 4) return "Leger";
  if (score <= 8) return "Modere";
  if (score <= 12) return "Intense";
  return "Severe";
}

// ─── PainCurveChart (SVG) ────────────────────────────────────────────────────

function PainCurveChart({ session, width }: { session: Session; width: number }) {
  const W = width;
  const H = 140;
  const PL = 28;
  const PR = 12;
  const PT = 10;
  const PB = 22;
  const CW = W - PL - PR;
  const CH = H - PT - PB;

  if (session.painScores.length < 2) {
    return (
      <div className="text-center py-7">
        <p className="text-slate-400 text-[13px]">Pas de donnees de courbe</p>
      </div>
    );
  }

  const maxSec = Math.max(...session.painScores.map((d) => d.sessionSec), 1);

  const toX = (sec: number) => PL + (sec / maxSec) * CW;
  const toY = (v: number) => PT + CH - (v / PSPI_MAX) * CH;

  const points = session.painScores
    .map((d) => `${toX(d.sessionSec).toFixed(1)},${toY(d.score).toFixed(1)}`)
    .join(" ");

  const yZoneGreen = toY(4);
  const yZoneMid = toY(8);
  const yTop = PT;
  const yBottom = PT + CH;

  return (
    <svg width={W} height={H}>
      {/* Background zones */}
      <rect x={PL} y={yTop} width={CW} height={yZoneMid - yTop} fill="rgba(220,38,38,0.06)" />
      <rect x={PL} y={yZoneMid} width={CW} height={yZoneGreen - yZoneMid} fill="rgba(217,119,6,0.06)" />
      <rect x={PL} y={yZoneGreen} width={CW} height={yBottom - yZoneGreen} fill="rgba(22,163,74,0.06)" />

      {/* Grid */}
      {[4, 8, 12].map((v) => (
        <line
          key={v}
          x1={PL} y1={toY(v)} x2={PL + CW} y2={toY(v)}
          stroke="#e2e8f0" strokeWidth={0.8} strokeDasharray="3,4"
        />
      ))}

      {/* Y labels */}
      {[0, 4, 8, 12, 16].map((v) => (
        <text key={v} x={PL - 3} y={toY(v) + 4} textAnchor="end" fontSize={8} fill="#94a3b8">
          {v}
        </text>
      ))}

      {/* Baseline */}
      <line x1={PL} y1={yBottom} x2={PL + CW} y2={yBottom} stroke="#e2e8f0" strokeWidth={0.8} />

      {/* Annotation markers */}
      {session.annotations.map((a) => (
        <line
          key={a.id}
          x1={toX(a.sessionSec)} y1={PT}
          x2={toX(a.sessionSec)} y2={yBottom}
          stroke="#3b82f6" strokeWidth={1} strokeDasharray="2,3" opacity={0.7}
        />
      ))}

      {/* Curve */}
      <polyline
        points={points}
        fill="none" stroke="#2563eb" strokeWidth={2}
        strokeLinejoin="round" strokeLinecap="round"
      />

      {/* X labels */}
      <text x={PL} y={H - 4} fontSize={8} fill="#94a3b8">0</text>
      <text x={PL + CW} y={H - 4} textAnchor="end" fontSize={8} fill="#94a3b8">
        {formatDuration(maxSec)}
      </text>
    </svg>
  );
}

// ─── SessionDetailPage ───────────────────────────────────────────────────────

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [session, setSession] = useState<Session | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);

  // Load session data
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const s = await getSessionById(id);
        if (!s) {
          router.back();
          return;
        }
        setSession(s);
        if (s.patientId) {
          const p = await getPatientById(s.patientId);
          setPatient(p);
        }
      } catch (e) {
        console.error("[SessionDetailPage]", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  // Measure container width for chart
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartWidth(entry.contentRect.width - 16); // padding
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  async function handleExport() {
    if (!session) return;
    setExporting(true);
    try {
      await exportPdf(session, patient);
    } catch (e) {
      window.alert("Impossible de generer le rapport PDF.");
      console.error(e);
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (!session) return;
    const ok = window.confirm(
      "Supprimer la seance ?\nCette action est irreversible."
    );
    if (!ok) return;
    try {
      await deleteSession(session.id);
      router.back();
    } catch (e) {
      window.alert("Impossible de supprimer la seance.");
      console.error(e);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-slate-400 text-sm">Chargement...</p>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto">
        {/* ── En-tete ───────────────────────────────────────────── */}
        <div className="bg-white p-5 border-b border-slate-200">
          <button
            onClick={() => router.back()}
            className="text-sm text-indigo-600 hover:text-indigo-800 mb-2"
          >
            &larr; Retour
          </button>
          <h1 className="text-lg font-bold text-slate-800">
            {formatDateTime(session.date)}
          </h1>
          {patient && (
            <p className="text-sm font-semibold text-indigo-600 mt-1">
              {patient.prenom} {patient.nom}
            </p>
          )}
          {!session.patientId && (
            <p className="text-sm text-slate-400 mt-1">Seance anonyme</p>
          )}
        </div>

        {/* ── Stats ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2.5 p-3 bg-white border-b border-slate-200">
          <div className="flex-1 min-w-[40%] bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-slate-800">
              {formatDuration(session.duree)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Duree</p>
          </div>
          <div className="flex-1 min-w-[40%] bg-slate-50 rounded-xl p-3 text-center">
            <p
              className="text-xl font-bold"
              style={{ color: pspiColorHex(session.moyennePSPI) }}
            >
              {session.moyennePSPI.toFixed(1)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              PSPI moy &middot; {pspiLabel(session.moyennePSPI)}
            </p>
          </div>
          <div className="flex-1 min-w-[40%] bg-slate-50 rounded-xl p-3 text-center">
            <p
              className="text-xl font-bold"
              style={{ color: pspiColorHex(session.maxPSPI) }}
            >
              {session.maxPSPI.toFixed(1)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              PSPI max &middot; {pspiLabel(session.maxPSPI)}
            </p>
          </div>
          <div className="flex-1 min-w-[40%] bg-slate-50 rounded-xl p-3 text-center">
            <p
              className="text-xl font-bold"
              style={{
                color: session.painEvents.length > 0 ? "#dc2626" : "#64748b",
              }}
            >
              {session.painEvents.length}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Spikes</p>
          </div>
        </div>

        {/* ── Courbe PSPI ───────────────────────────────────────── */}
        <div className="mt-2 bg-white border-y border-slate-200">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide px-4 pt-3.5 pb-2">
            Courbe PSPI
          </h2>
          <div className="px-2 pb-3">
            {chartWidth > 0 && (
              <PainCurveChart session={session} width={chartWidth} />
            )}
          </div>
        </div>

        {/* ── Annotations ───────────────────────────────────────── */}
        <div className="mt-2 bg-white border-y border-slate-200">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide px-4 pt-3.5 pb-2">
            Annotations ({session.annotations.length})
          </h2>
          {session.annotations.length === 0 ? (
            <p className="text-[13px] text-slate-400 px-4 pb-4">
              Aucune annotation
            </p>
          ) : (
            session.annotations.map((a) => (
              <div
                key={a.id}
                className="flex items-center px-4 py-2.5 border-t border-slate-100"
              >
                <div className="flex-1">
                  <p className="text-xs text-slate-400 tabular-nums">
                    {formatDuration(a.sessionSec)}
                  </p>
                  <p className="text-sm text-slate-800 mt-0.5">
                    {a.type === "voice" ? `\uD83C\uDF99 ${a.label}` : `\uD83D\uDCDD ${a.label}`}
                  </p>
                </div>
                <span
                  className="text-[15px] font-bold"
                  style={{ color: pspiColorHex(a.pspi) }}
                >
                  {a.pspi.toFixed(1)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* ── Spikes ────────────────────────────────────────────── */}
        {session.painEvents.length > 0 && (
          <div className="mt-2 bg-white border-y border-slate-200">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide px-4 pt-3.5 pb-2">
              Spikes de douleur ({session.painEvents.length})
            </h2>
            {session.painEvents.map((e, i) => (
              <div
                key={i}
                className="flex items-center px-4 py-2.5 border-t border-slate-100"
              >
                <div className="flex-1">
                  <p className="text-xs text-slate-400 tabular-nums">
                    {new Intl.DateTimeFormat("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    }).format(new Date(e.timestamp))}
                  </p>
                  <p className="text-sm text-slate-800 mt-0.5">
                    {e.scoreBefore.toFixed(1)} &rarr; {e.scoreAfter.toFixed(1)}
                  </p>
                </div>
                <span className="text-[15px] font-bold text-slate-600">
                  {e.deltaMs} ms
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Actions ───────────────────────────────────────────── */}
        <div className="p-4 space-y-2.5">
          <button
            onClick={handleExport}
            disabled={exporting}
            className={`w-full py-4 rounded-xl text-base font-bold text-white transition-colors ${
              exporting
                ? "bg-blue-300 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/30"
            }`}
          >
            {exporting ? "Export en cours..." : "\uD83D\uDCC4  Exporter PDF"}
          </button>
          <button
            onClick={handleDelete}
            className="w-full py-3.5 rounded-xl text-[15px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
          >
            Supprimer
          </button>
        </div>

        {/* Espace bas */}
        <div className="h-8" />
      </div>
    </div>
  );
}
