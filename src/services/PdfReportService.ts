/**
 * PdfReportService – Génération de rapport PDF via html2pdf.js (PWA).
 *
 * Flux :
 *   buildHtml(session, patient?) → chaîne HTML complète
 *   exportPdf(session, patient?) → télécharge le PDF
 *   shareReport(session, patient?) → Web Share API ou fallback PDF
 */

import type { Session, Patient } from '../types/patient';
import { PSPI_MAX } from './PainScoreEngine';

// ─── Types pour les annotations (inline, pas d'import circulaire) ────────────

interface SessionAnnotation {
  sessionSec: number;
  label: string;
  type: 'text' | 'voice';
  pspi: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  if (score <= 4) return '#16a34a';
  if (score <= 8) return '#d97706';
  return '#dc2626';
}

function pspiLabel(score: number): string {
  if (score === 0) return 'Absent';
  if (score <= 4) return 'Léger';
  if (score <= 8) return 'Modéré';
  if (score <= 12) return 'Intense';
  return 'Sévère';
}

// ─── SVG mini-courbe ─────────────────────────────────────────────────────────

function buildSparklineSvg(session: Session): string {
  const W = 540, H = 120, PL = 30, PR = 8, PT = 8, PB = 20;
  const CW = W - PL - PR;
  const CH = H - PT - PB;

  if (session.painScores.length < 2) return '';

  const maxSec = Math.max(
    ...session.painScores.map((d: { sessionSec: number }) => d.sessionSec),
    1,
  );

  const toX = (sec: number) => PL + (sec / maxSec) * CW;
  const toY = (s: number) => PT + CH - (s / PSPI_MAX) * CH;

  const points = session.painScores
    .map(
      (d: { sessionSec: number; score: number }) =>
        `${toX(d.sessionSec).toFixed(1)},${toY(d.score).toFixed(1)}`,
    )
    .join(' ');

  const gridLines = [4, 8, 12]
    .map(
      (v) =>
        `<line x1="${PL}" y1="${toY(v).toFixed(1)}"
           x2="${PL + CW}" y2="${toY(v).toFixed(1)}"
           stroke="#e2e8f0" stroke-width="0.5" stroke-dasharray="3,4"/>
     <text x="${PL - 3}" y="${(toY(v) + 4).toFixed(1)}"
           text-anchor="end" font-size="8" fill="#94a3b8">${v}</text>`,
    )
    .join('');

  const annotLines = session.annotations
    .map((a: SessionAnnotation) => {
      const x = toX(a.sessionSec).toFixed(1);
      return `<line x1="${x}" y1="${PT}" x2="${x}" y2="${PT + CH}"
                  stroke="#3b82f6" stroke-width="1" stroke-dasharray="2,3" opacity="0.7"/>`;
    })
    .join('');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"
         style="display:block;margin:0 auto">
      <rect x="${PL}" y="${PT}" width="${CW}" height="${CH}"
            fill="#f8fafc" rx="3"/>
      ${gridLines}
      ${annotLines}
      <polyline points="${points}"
                fill="none" stroke="#2563eb" stroke-width="2"
                stroke-linejoin="round" stroke-linecap="round"/>
      <text x="${PL}" y="${H - 2}" font-size="8" fill="#94a3b8">0s</text>
      <text x="${PL + CW}" y="${H - 2}" text-anchor="end"
            font-size="8" fill="#94a3b8">${formatDuration(maxSec)}</text>
    </svg>`;
}

// ─── HTML complet ─────────────────────────────────────────────────────────────

export function buildHtml(session: Session, patient?: Patient | null): string {
  const patientName = patient
    ? `${patient.prenom} ${patient.nom}`
    : 'Séance anonyme';

  const dob = patient?.dateNaissance
    ? `<p><strong>Date de naissance :</strong> ${patient.dateNaissance}</p>`
    : '';

  const notes = patient?.notes
    ? `<p><strong>Notes :</strong> ${patient.notes}</p>`
    : '';

  const sparklingSvg = buildSparklineSvg(session);

  const annotRows =
    session.annotations.length === 0
      ? '<tr><td colspan="3" style="color:#94a3b8;text-align:center">Aucune annotation</td></tr>'
      : session.annotations
          .map(
            (a: SessionAnnotation) => `
        <tr>
          <td>${formatDuration(a.sessionSec)}</td>
          <td>${a.type === 'voice' ? '🎙 Note vocale' : '📝 ' + a.label}</td>
          <td style="color:${pspiColor(a.pspi)};font-weight:600">
            ${a.pspi.toFixed(1)}
          </td>
        </tr>`,
          )
          .join('');

  const spikeRows =
    session.painEvents.length === 0
      ? '<tr><td colspan="3" style="color:#94a3b8;text-align:center">Aucun spike</td></tr>'
      : session.painEvents
          .map(
            (e: { timestamp: number; scoreBefore: number; scoreAfter: number; deltaMs: number }) => `
        <tr>
          <td>${new Date(e.timestamp).toLocaleTimeString('fr-FR')}</td>
          <td>${e.scoreBefore.toFixed(1)} → ${e.scoreAfter.toFixed(1)}</td>
          <td>${e.deltaMs} ms</td>
        </tr>`,
          )
          .join('');

  const avgColor = pspiColor(session.moyennePSPI);
  const maxColor = pspiColor(session.maxPSPI);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Rapport PainFace – ${patientName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif;
           color: #1e293b; background: #fff; padding: 32px; font-size: 13px; }
    h1  { font-size: 22px; color: #1e3a5f; margin-bottom: 4px; }
    h2  { font-size: 15px; color: #1e3a5f; margin: 20px 0 8px;
          border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .subtitle { color: #64748b; font-size: 12px; margin-bottom: 20px; }
    .header-row { display: flex; justify-content: space-between; align-items: flex-start; }
    .logo { font-size: 28px; font-weight: 800; color: #2563eb; }
    .stats-grid { display: flex; gap: 16px; margin: 12px 0; }
    .stat-card { flex: 1; background: #f1f5f9; border-radius: 8px;
                 padding: 12px; text-align: center; }
    .stat-val  { font-size: 24px; font-weight: 700; }
    .stat-lbl  { font-size: 10px; color: #64748b; text-transform: uppercase;
                 letter-spacing: 0.5px; margin-top: 2px; }
    .chart-box { border: 1px solid #e2e8f0; border-radius: 8px;
                 padding: 8px; margin: 8px 0; background: #fafafa; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th    { background: #1e3a5f; color: #fff; padding: 6px 10px;
            font-size: 11px; text-align: left; }
    td    { padding: 5px 10px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
    tr:nth-child(even) td { background: #f8fafc; }
    .footer { margin-top: 32px; font-size: 10px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="header-row">
    <div>
      <h1>Rapport de séance</h1>
      <p class="subtitle">Généré le ${formatTs(Date.now())} · PainFace</p>
    </div>
    <div class="logo">PainFace</div>
  </div>

  <h2>Patient</h2>
  <p><strong>Nom :</strong> ${patientName}</p>
  ${dob}
  ${notes}

  <h2>Séance du ${formatTs(session.date)}</h2>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-val" style="color:#1e3a5f">${formatDuration(session.duree)}</div>
      <div class="stat-lbl">Durée</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" style="color:${avgColor}">${session.moyennePSPI.toFixed(1)}</div>
      <div class="stat-lbl">PSPI moyen – ${pspiLabel(session.moyennePSPI)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" style="color:${maxColor}">${session.maxPSPI.toFixed(1)}</div>
      <div class="stat-lbl">PSPI max – ${pspiLabel(session.maxPSPI)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" style="color:#2563eb">${session.painEvents.length}</div>
      <div class="stat-lbl">Spikes douleur</div>
    </div>
  </div>

  <h2>Courbe PSPI</h2>
  <div class="chart-box">${sparklingSvg}</div>

  <h2>Annotations (${session.annotations.length})</h2>
  <table>
    <thead><tr><th>Temps</th><th>Note</th><th>PSPI</th></tr></thead>
    <tbody>${annotRows}</tbody>
  </table>

  <h2>Spikes de douleur (${session.painEvents.length})</h2>
  <table>
    <thead><tr><th>Heure</th><th>Score avant → après</th><th>Montée</th></tr></thead>
    <tbody>${spikeRows}</tbody>
  </table>

  <p class="footer">
    Rapport généré par PainFace · Analyse PSPI (Prkachin &amp; Solomon, 2008)
  </p>
</body>
</html>`;
}

// ─── Export PDF (html2pdf.js) ────────────────────────────────────────────────

export async function exportPdf(
  session: Session,
  patient?: Patient | null,
): Promise<void> {
  const html = buildHtml(session, patient);
  const { default: html2pdf } = await import('html2pdf.js');

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  await html2pdf()
    .from(container)
    .set({
      margin: 10,
      filename: `PainFace_Session_${session.id}.pdf`,
      html2canvas: { scale: 2 },
      jsPDF: { format: 'a4' },
    })
    .save();

  document.body.removeChild(container);
}

// ─── Partage (Web Share API + fallback PDF) ──────────────────────────────────

export async function shareReport(
  session: Session,
  patient?: Patient | null,
): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Rapport PainFace',
        text: `Session du ${formatTs(session.date)} — Score moyen: ${session.moyennePSPI.toFixed(1)}`,
      });
      return;
    } catch {
      // User cancelled or share failed → fallback to PDF
    }
  }
  await exportPdf(session, patient);
}
