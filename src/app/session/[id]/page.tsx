"use client";

/**
 * SessionDetailPage – Détail d'une séance : courbe de douleur, annotations,
 * spikes et export PDF. Clinical / éditorial theme.
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

// ─── Color tokens ─────────────────────────────────────────────────────────────

const PSPI_GREEN = "#4C7C5B";
const PSPI_AMBER = "#B67A1F";
const PSPI_ROSE = "#B04447";
const ACCENT = "#2F4B8A";

function pspiHex(score: number): string {
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

// ─── PDF export (kept, styled ivory) ──────────────────────────────────────────

async function exportPdf(session: Session, patient: Patient | null): Promise<void> {
  const html2pdf = (await import("html2pdf.js")).default;

  const patientName = patient ? `${patient.prenom} ${patient.nom}` : "Anonyme";
  const dateStr = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(session.date));

  const chartSvg = buildChartSvg(session, 520, 150);

  const html = `
    <div style="font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; color: #14171C; padding: 28px; max-width: 560px; background: #FBF9F4;">
      <div style="text-align: left; padding-bottom: 18px; border-bottom: 1px solid #14171C14; margin-bottom: 18px;">
        <h1 style="font-family: 'Instrument Serif', Georgia, serif; font-size: 28px; font-weight: 400; margin: 0; letter-spacing: -0.5px;">Painface</h1>
        <p style="font-size: 10px; color: #14171C80; text-transform: uppercase; letter-spacing: 1.4px; margin: 4px 0 0; font-family: 'JetBrains Mono', monospace;">Rapport · ${dateStr}</p>
      </div>

      <p style="font-size: 13px; margin: 0 0 4px; font-weight: 500;">${patientName}</p>
      <p style="font-size: 12px; color: #14171C80; margin: 0 0 18px;">Durée : ${formatDuration(session.duree)}</p>

      <div style="display: flex; gap: 8px; margin-bottom: 18px;">
        <div style="flex: 1; padding: 14px; border: 1px solid #14171C14; border-radius: 12px;">
          <p style="font-size: 10px; color: #14171C80; text-transform: uppercase; letter-spacing: 1.3px; margin: 0;">PSPI moyen</p>
          <p style="font-family: 'Instrument Serif', Georgia, serif; font-size: 28px; color: ${pspiHex(session.moyennePSPI)}; margin: 4px 0 0;">${session.moyennePSPI.toFixed(1)}</p>
        </div>
        <div style="flex: 1; padding: 14px; border: 1px solid #14171C14; border-radius: 12px;">
          <p style="font-size: 10px; color: #14171C80; text-transform: uppercase; letter-spacing: 1.3px; margin: 0;">Maximum</p>
          <p style="font-family: 'Instrument Serif', Georgia, serif; font-size: 28px; color: ${pspiHex(session.maxPSPI)}; margin: 4px 0 0;">${session.maxPSPI.toFixed(1)}</p>
        </div>
        <div style="flex: 1; padding: 14px; border: 1px solid #14171C14; border-radius: 12px;">
          <p style="font-size: 10px; color: #14171C80; text-transform: uppercase; letter-spacing: 1.3px; margin: 0;">Pics</p>
          <p style="font-family: 'Instrument Serif', Georgia, serif; font-size: 28px; color: ${session.painEvents.length > 0 ? PSPI_ROSE : "#14171C80"}; margin: 4px 0 0;">${session.painEvents.length}</p>
        </div>
      </div>

      <p style="font-size: 10px; color: #14171C80; text-transform: uppercase; letter-spacing: 1.3px; margin: 0 0 8px;">Courbe PSPI</p>
      ${chartSvg}

      ${session.annotations.length > 0 ? `
        <p style="font-size: 10px; color: #14171C80; text-transform: uppercase; letter-spacing: 1.3px; margin: 18px 0 6px;">Annotations (${session.annotations.length})</p>
        ${session.annotations.map(a => `
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-top: 1px solid #14171C0d;">
            <div>
              <span style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #14171C80;">${formatDuration(a.sessionSec)}</span>
              <span style="font-size: 12px; color: #14171C; margin-left: 8px;">${a.label}</span>
            </div>
            <span style="font-family: 'Instrument Serif', Georgia, serif; font-size: 14px; color: ${pspiHex(a.pspi)};">${a.pspi.toFixed(1)}</span>
          </div>
        `).join("")}
      ` : ""}

      <p style="margin-top: 22px; padding-top: 12px; border-top: 1px solid #14171C14; font-size: 9px; color: #14171C80; text-align: center;">
        Outil d'aide à l'observation FACS · PSPI (Prkachin &amp; Solomon, 2008). Non certifié dispositif médical.
      </p>
    </div>
  `;

  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename: `Painface_${patientName.replace(/\s+/g, "_")}_${new Date(session.date).toISOString().slice(0, 10)}.pdf`,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(container.firstElementChild as HTMLElement)
      .save();
  } finally {
    document.body.removeChild(container);
  }
}

function buildChartSvg(session: Session, W: number, H: number): string {
  if (session.painScores.length < 2) {
    return `<p style="text-align:center;color:#14171C80;font-size:12px;">Pas de données</p>`;
  }
  const PL = 28, PR = 12, PT = 10, PB = 22;
  const CW = W - PL - PR;
  const CH = H - PT - PB;
  const maxSec = Math.max(...session.painScores.map(d => d.sessionSec), 1);
  const toX = (sec: number) => PL + (sec / maxSec) * CW;
  const toY = (v: number) => PT + CH - (v / 16) * CH;
  const points = session.painScores.map(d => `${toX(d.sessionSec).toFixed(1)},${toY(d.score).toFixed(1)}`).join(" ");
  const yG = toY(4), yM = toY(8), yT = PT, yB = PT + CH;
  return `
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${PL}" y="${yT}" width="${CW}" height="${yM - yT}" fill="${PSPI_ROSE}" fill-opacity="0.05"/>
      <rect x="${PL}" y="${yM}" width="${CW}" height="${yG - yM}" fill="${PSPI_AMBER}" fill-opacity="0.06"/>
      <rect x="${PL}" y="${yG}" width="${CW}" height="${yB - yG}" fill="${PSPI_GREEN}" fill-opacity="0.05"/>
      ${[4, 8, 12].map(v => `<line x1="${PL}" y1="${toY(v)}" x2="${PL + CW}" y2="${toY(v)}" stroke="#14171C14" stroke-width="0.6" stroke-dasharray="2,3"/>`).join("")}
      ${[0, 4, 8, 12, 16].map(v => `<text x="${PL - 4}" y="${toY(v) + 3}" text-anchor="end" font-size="8" fill="#14171C80" font-family="'JetBrains Mono',monospace">${v}</text>`).join("")}
      <line x1="${PL}" y1="${yB}" x2="${PL + CW}" y2="${yB}" stroke="#14171C14" stroke-width="0.6"/>
      <polyline points="${points}" fill="none" stroke="${ACCENT}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
  `;
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
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── PainCurveChart (SVG, clinical) ──────────────────────────────────────────

function PainCurveChart({ session, width }: { session: Session; width: number }) {
  const W = width;
  const H = 160;
  const PL = 30;
  const PR = 6;
  const PT = 2;
  const PB = 14;
  const CW = W - PL - PR;
  const CH = H - PT - PB;

  if (session.painScores.length < 2) {
    return (
      <div className="py-6 text-center">
        <p className="text-[13px] text-[var(--color-ink-50)]">Pas de données de courbe</p>
      </div>
    );
  }

  const maxSec = Math.max(...session.painScores.map((d) => d.sessionSec), 1);
  const toX = (sec: number) => PL + (sec / maxSec) * CW;
  const toY = (v: number) => PT + CH - (v / PSPI_MAX) * CH;

  const points = session.painScores
    .map((d) => `${toX(d.sessionSec).toFixed(1)},${toY(d.score).toFixed(1)}`)
    .join(" ");

  const yG = toY(4);
  const yM = toY(8);
  const yT = PT;
  const yB = PT + CH;

  // Spikes (high + positions)
  const spikes = session.painEvents.slice(0, 20).map((e) => {
    const timeFromStart = (e.timestamp - session.date) / 1000;
    return { x: toX(Math.max(0, Math.min(maxSec, timeFromStart))), y: toY(e.scoreAfter) };
  });

  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <rect x={PL} y={yT} width={CW} height={yM - yT} fill={PSPI_ROSE} opacity={0.05} />
      <rect x={PL} y={yM} width={CW} height={yG - yM} fill={PSPI_AMBER} opacity={0.06} />
      <rect x={PL} y={yG} width={CW} height={yB - yG} fill={PSPI_GREEN} opacity={0.04} />

      {[4, 8, 12].map((v) => (
        <line key={v} x1={PL} y1={toY(v)} x2={PL + CW} y2={toY(v)} stroke="var(--color-ink-15)" strokeWidth={0.6} strokeDasharray="2 3" />
      ))}
      {[0, 4, 8, 12, 16].map((v) => (
        <text key={v} x={PL - 4} y={toY(v) + 3} textAnchor="end" fontSize={8} fill="var(--color-ink-50)" style={{ fontFamily: "var(--font-mono)" }}>
          {v}
        </text>
      ))}

      <line x1={PL} y1={yB} x2={PL + CW} y2={yB} stroke="var(--color-ink-15)" strokeWidth={0.6} />

      {/* Annotation markers */}
      {session.annotations.map((a) => (
        <g key={a.id}>
          <line x1={toX(a.sessionSec)} y1={yT} x2={toX(a.sessionSec)} y2={yB} stroke="var(--color-ink-30)" strokeDasharray="2 3" strokeWidth={0.5} />
        </g>
      ))}

      {/* Curve */}
      <polyline points={points} fill="none" stroke={ACCENT} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />

      {/* Spike dots */}
      {spikes.map((s, i) => (
        <g key={i}>
          <circle cx={s.x} cy={s.y} r={6} fill={PSPI_ROSE} opacity={0.15} />
          <circle cx={s.x} cy={s.y} r={2.5} fill={PSPI_ROSE} />
        </g>
      ))}
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

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) setChartWidth(entry.contentRect.width - 40);
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
      window.alert("Impossible de générer le rapport PDF.");
      console.error(e);
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (!session) return;
    const ok = window.confirm("Supprimer la séance ?\nCette action est irréversible.");
    if (!ok) return;
    try {
      await deleteSession(session.id);
      router.back();
    } catch (e) {
      window.alert("Impossible de supprimer la séance.");
      console.error(e);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[var(--color-ivory)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-ink-15)] border-t-[var(--color-ink)]" />
      </div>
    );
  }

  if (!session) return null;

  const name = patient ? `${patient.prenom} ${patient.nom}` : "Séance anonyme";

  return (
    <div ref={containerRef} className="flex flex-1 flex-col overflow-auto bg-[var(--color-ivory)]">
      {/* Top bar */}
      <div className="px-5 pt-3 pb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1 text-[var(--color-ink-70)] text-[14px]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Retour
        </button>
        <div className="flex gap-4 text-[var(--color-ink-70)]">
          <button type="button" aria-label="Partager">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v13" />
              <path d="M7 8l5-5 5 5" />
              <path d="M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5" />
            </svg>
          </button>
          <button type="button" aria-label="Exporter PDF" onClick={handleExport} disabled={exporting}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
              <path d="M14 3v5h5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="px-5 pt-2 pb-3">
        <h1 className="text-[var(--color-ink)]" style={{ fontFamily: "var(--font-serif)", fontSize: 32, letterSpacing: "-0.4px", lineHeight: 1 }}>
          {formatDateTime(session.date)}
        </h1>
        <p className="mt-1.5 text-[12.5px] text-[var(--color-ink-50)]">
          {name} · {formatDuration(session.duree)}
        </p>
      </div>

      {/* Stats row */}
      <div className="px-5 pb-3 flex gap-2.5">
        {(
          [
            ["PSPI moyen", session.moyennePSPI.toFixed(1), pspiHex(session.moyennePSPI), pspiLabel(session.moyennePSPI), true],
            ["Maximum", session.maxPSPI.toFixed(1), pspiHex(session.maxPSPI), pspiLabel(session.maxPSPI), true],
            ["Pics", String(session.painEvents.length), session.painEvents.length > 0 ? PSPI_ROSE : "var(--color-ink-30)", "", false],
          ] as const
        ).map(([label, value, color, sublabel, showUnit], i) => (
          <div
            key={i}
            className="flex-1 rounded-[12px] bg-[var(--color-paper)] p-3"
            style={{ border: "1px solid var(--color-ink-08)" }}
          >
            <span className="text-[10px] uppercase text-[var(--color-ink-50)]" style={{ letterSpacing: "0.12em", fontWeight: 500 }}>
              {label}
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 22, color, lineHeight: 1 }}>{value}</span>
              {showUnit && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-ink-30)" }}>/16</span>}
            </div>
            {sublabel && (
              <div className="mt-0.5 text-[10px]" style={{ color }}>{sublabel}</div>
            )}
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="mx-5 mb-3 rounded-[14px] bg-[var(--color-paper)] p-3" style={{ border: "1px solid var(--color-ink-08)" }}>
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-[10px] uppercase text-[var(--color-ink-50)]" style={{ letterSpacing: "0.12em", fontWeight: 500 }}>
            Courbe PSPI · {formatDuration(session.duree)}
          </span>
          <span className="text-[9.5px] uppercase text-[var(--color-ink-30)]" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>
            ◆ annotation · ● pic
          </span>
        </div>
        {chartWidth > 0 && <PainCurveChart session={session} width={chartWidth} />}
      </div>

      {/* Annotations */}
      <div className="mx-5 mb-3">
        <div className="py-2">
          <span className="text-[10px] uppercase text-[var(--color-ink-50)]" style={{ letterSpacing: "0.12em", fontWeight: 500 }}>
            Annotations ({session.annotations.length})
          </span>
        </div>
        {session.annotations.length === 0 ? (
          <p className="text-[13px] text-[var(--color-ink-50)]">Aucune annotation.</p>
        ) : (
          session.annotations.map((a, i) => (
            <div
              key={a.id}
              className="flex items-center gap-3 py-2.5"
              style={{ borderBottom: i < session.annotations.length - 1 ? "1px solid var(--color-ink-rule)" : "none" }}
            >
              <span className="w-[44px] text-[11px] text-[var(--color-ink-50)]" style={{ fontFamily: "var(--font-mono)" }}>
                {formatDuration(a.sessionSec)}
              </span>
              {a.type === "voice" ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0014 0M12 18v3" />
                </svg>
              ) : (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: pspiHex(a.pspi) }}
                />
              )}
              <p className="flex-1 text-[13px] text-[var(--color-ink)]">{a.label}</p>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 14, color: pspiHex(a.pspi), lineHeight: 1 }}>
                {a.pspi.toFixed(1)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Spikes */}
      {session.painEvents.length > 0 && (
        <div className="mx-5 mb-3">
          <div className="py-2">
            <span className="text-[10px] uppercase text-[var(--color-ink-50)]" style={{ letterSpacing: "0.12em", fontWeight: 500 }}>
              Pics de douleur ({session.painEvents.length})
            </span>
          </div>
          {session.painEvents.map((e, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-2.5"
              style={{ borderBottom: i < session.painEvents.length - 1 ? "1px solid var(--color-ink-rule)" : "none" }}
            >
              <span className="w-[56px] text-[11px] text-[var(--color-ink-50)]" style={{ fontFamily: "var(--font-mono)" }}>
                {new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(e.timestamp))}
              </span>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: PSPI_ROSE }} />
              <p className="flex-1 text-[13px] text-[var(--color-ink)]" style={{ fontFamily: "var(--font-mono)" }}>
                {e.scoreBefore.toFixed(1)} → {e.scoreAfter.toFixed(1)}
              </p>
              <span className="text-[11.5px] text-[var(--color-ink-50)]" style={{ fontFamily: "var(--font-mono)" }}>
                {e.deltaMs} ms
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="px-5 pt-2 pb-8 flex gap-2.5">
        <button
          type="button"
          onClick={handleDelete}
          className="flex-1 rounded-[14px] py-3.5 text-[13.5px] font-medium transition-colors"
          style={{
            background: `rgba(176,68,71,0.05)`,
            color: PSPI_ROSE,
            border: `1px solid rgba(176,68,71,0.28)`,
          }}
        >
          Supprimer
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="flex-[2] rounded-[14px] py-3.5 text-[13.5px] font-medium text-[var(--color-ivory)] transition-all disabled:opacity-50"
          style={{ background: "var(--color-ink)" }}
        >
          {exporting ? "Export en cours..." : "Exporter PDF"}
        </button>
      </div>
    </div>
  );
}
