/**
 * PainScoreEngine – Score de douleur PSPI avec lissage EMA et détection de spikes.
 *
 * Formule PSPI originale (Prkachin & Solomon, 2008) :
 *   score = AU4 + min(AU6, AU7) + AU9 + AU10
 *
 * Chaque AU est plafonnée à 4 pour respecter la plage originale 0–16
 * (Prkachin & Solomon, 2008 — codage FACS 0–4 par AU).
 *
 * AU43 (yeux fermés) est volontairement exclu : il n'est pas dans le PSPI validé
 * et capte la fatigue/somnolence autant que la douleur, ce qui gonfle le score
 * à tort.
 *
 * Fonctionnalités :
 *   - Lissage temporel EMA (moyenne glissante exponentielle) paramétrable
 *   - Détection de « spikes » : montée rapide de <3 à >8 en < 500 ms
 *   - Calcul de tendance (increasing / stable / decreasing) sur fenêtre glissante
 */

import type { ActionUnitsResult } from '../types/actionUnits';

// ─── Types publics ────────────────────────────────────────────────────────────

/** Événement de douleur soudaine détecté par le moteur. */
export interface PainSpikeEvent {
  type: 'pain_spike';
  /** Timestamp (ms) au moment du pic */
  timestamp: number;
  /** Score juste avant la montée (< spikeLowThreshold) */
  scoreBefore: number;
  /** Score au moment du pic (> spikeHighThreshold) */
  scoreAfter: number;
  /** Durée de la montée en ms */
  deltaMs: number;
}

/** Direction de l'évolution du score lissé. */
export type ScoreTrend = 'increasing' | 'decreasing' | 'stable';

/** Options de configuration du moteur. */
export interface PainEngineOptions {
  /** Constante de temps EMA en ms (défaut : 2000). */
  smoothingWindowMs?: number;
  /** Durée maximale de la montée pour qualifier un spike (défaut : 500). */
  spikeWindowMs?: number;
  /** Seuil bas déclenchant l'alerte de spike (défaut : 3). */
  spikeLowThreshold?: number;
  /** Seuil haut déclenchant l'alerte de spike (défaut : 8). */
  spikeHighThreshold?: number;
  /**
   * Delta minimum sur la fenêtre de tendance pour ne pas rester « stable »
   * (défaut : 0.5). Comparaison sur les derniers TREND_WINDOW_SAMPLES.
   */
  trendThreshold?: number;
}

/** Résultat produit à chaque appel à addSample(). */
export interface PainEngineState {
  /** Score PSPI brut, plage 0–16. */
  currentScore: number;
  /** Score lissé par EMA, plage 0–16, arrondi à 1 décimale. */
  smoothedScore: number;
  /** Direction d'évolution du score lissé. */
  trend: ScoreTrend;
  /** Nouveaux événements pain_spike générés lors de ce sample. */
  newEvents: PainSpikeEvent[];
}

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Score PSPI maximum (4 AU × score max 4). */
export const PSPI_MAX = 16;

/** Nombre de valeurs EMA conservées pour le calcul de tendance. */
const TREND_WINDOW_SAMPLES = 5;

const DEFAULT_OPTIONS = {
  smoothingWindowMs:  2000,
  spikeWindowMs:      500,
  spikeLowThreshold:  3,
  spikeHighThreshold: 8,
  trendThreshold:     0.5,
} satisfies Required<PainEngineOptions>;

// ─── Calcul PSPI ──────────────────────────────────────────────────────────────

/**
 * Calcule le score PSPI brut à partir des Action Units.
 *
 * Formule : AU4 + min(AU6, AU7) + AU9 + AU10
 *
 * Les scores AU sont plafonnés à 4 pour rester dans la plage 0–16 définie
 * par Prkachin & Solomon (2008), où chaque AU est codée sur une échelle 0–4.
 * Plage théorique : 0–16 (4 termes × 4 max) → PSPI_MAX = 16.
 */
export function computeRawPSPI(aus: ActionUnitsResult): number {
  const cap = (s: number) => Math.min(s, 4);
  const au4  = cap(aus.au4.score);
  const au6  = cap(aus.au6.score);
  const au7  = cap(aus.au7.score);
  const au9  = cap(aus.au9.score);
  const au10 = cap(aus.au10.score);
  // Formule originale Prkachin & Solomon (2008) :
  //   AU4 + min(AU6, AU7) + AU9 + AU10
  // min(AU6, AU7) : les deux AUs oculaires doivent être co-actives pour compter.
  // max() gonflait le score ; sum(AU9,AU10) capture mieux les composantes naso-labiales.
  return au4 + Math.min(au6, au7) + au9 + au10;
}

// ─── PainScoreEngine ──────────────────────────────────────────────────────────

/**
 * Moteur de score de douleur temporel.
 *
 * Accepte des samples AU horodatés et produit à chaque appel :
 *   - Le score brut PSPI (0–16)
 *   - Le score lissé par EMA adaptative au temps écoulé
 *   - La tendance courante (increasing / stable / decreasing)
 *   - Les nouveaux événements pain_spike
 *
 * Exemple :
 *   const engine = new PainScoreEngine({ smoothingWindowMs: 2000 });
 *   const state  = engine.addSample(aus, Date.now());
 *   console.log(state.smoothedScore, state.trend);
 */
export class PainScoreEngine {
  private readonly opts: Required<PainEngineOptions>;

  // EMA
  private ema: number | null = null;
  private lastTimestamp: number | null = null;

  // Tendance : ring-buffer des dernières valeurs EMA
  private emaHistory: number[] = [];

  // Spike : historique glissant (score, ts) sur spikeWindowMs
  private scoreHistory: Array<{ score: number; timestamp: number }> = [];

  // Tous les événements depuis le dernier reset()
  private allEvents: PainSpikeEvent[] = [];

  constructor(options?: PainEngineOptions) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
  }

  // ── API principale ──────────────────────────────────────────────────────────

  /**
   * Intègre un nouveau sample AU.
   *
   * @param aus  Résultat du calculateur AU
   * @param now  Horodatage en ms (Date.now() par défaut — injectez-le dans les tests)
   */
  addSample(aus: ActionUnitsResult, now: number = Date.now()): PainEngineState {
    const rawScore = computeRawPSPI(aus);

    // ── EMA adaptative au temps ─────────────────────────────────────────────
    // α = 1 − exp(−3·Δt / T) → après 1 fenêtre complète (T ms), 95 % du poids
    // vient des samples récents (e^−3 ≈ 0.05).
    if (this.ema === null || this.lastTimestamp === null) {
      this.ema = rawScore;
    } else {
      const dt    = Math.max(0, now - this.lastTimestamp);
      const alpha = 1 - Math.exp(-3 * dt / this.opts.smoothingWindowMs);
      this.ema    = alpha * rawScore + (1 - alpha) * this.ema;
    }
    this.lastTimestamp = now;

    // ── Tendance ────────────────────────────────────────────────────────────
    this.emaHistory.push(this.ema);
    if (this.emaHistory.length > TREND_WINDOW_SAMPLES) {
      this.emaHistory.shift();
    }
    const trend = this._computeTrend();

    // ── Détection de spikes ─────────────────────────────────────────────────
    const newEvents = this._detectSpike(rawScore, now);

    // Ajout du point courant à l'historique de spike (après détection pour
    // éviter qu'un point déjà >8 serve lui-même de déclencheur bas)
    this.scoreHistory.push({ score: rawScore, timestamp: now });

    return {
      currentScore:  rawScore,
      smoothedScore: Math.round((this.ema) * 10) / 10,
      trend,
      newEvents,
    };
  }

  /** Remet l'état interne à zéro (EMA, historique, événements). */
  reset(): void {
    this.ema          = null;
    this.lastTimestamp = null;
    this.emaHistory   = [];
    this.scoreHistory = [];
    this.allEvents    = [];
  }

  /**
   * Met à jour les options sans recréer l'engine ni perdre l'historique.
   * Appelé quand les réglages changent en cours de séance.
   */
  updateOptions(opts: PainEngineOptions): void {
    Object.assign(this.opts, opts);
  }

  /** Tous les événements pain_spike accumulés depuis le dernier reset(). */
  getAllEvents(): PainSpikeEvent[] {
    return [...this.allEvents];
  }

  /** Score brut PSPI du dernier sample (null si aucun). */
  getCurrentScore(): number | null {
    if (this.scoreHistory.length === 0) return null;
    return this.scoreHistory[this.scoreHistory.length - 1].score;
  }

  /** Score lissé EMA du dernier sample (null si aucun). */
  getSmoothedScore(): number | null {
    return this.ema !== null ? Math.round(this.ema * 10) / 10 : null;
  }

  // ── Méthodes privées ────────────────────────────────────────────────────────

  private _computeTrend(): ScoreTrend {
    if (this.emaHistory.length < 2) return 'stable';
    const oldest = this.emaHistory[0];
    const newest = this.emaHistory[this.emaHistory.length - 1];
    const delta  = newest - oldest;
    if (delta >  this.opts.trendThreshold) return 'increasing';
    if (delta < -this.opts.trendThreshold) return 'decreasing';
    return 'stable';
  }

  private _detectSpike(rawScore: number, now: number): PainSpikeEvent[] {
    // Purge des entrées hors fenêtre
    const cutoff = now - this.opts.spikeWindowMs;
    this.scoreHistory = this.scoreHistory.filter(e => e.timestamp >= cutoff);

    if (rawScore <= this.opts.spikeHighThreshold) return [];

    // Cherche un point bas dans la fenêtre courante
    const lowEntry = this.scoreHistory.find(
      e => e.score < this.opts.spikeLowThreshold,
    );
    if (!lowEntry) return [];

    const event: PainSpikeEvent = {
      type:        'pain_spike',
      timestamp:   now,
      scoreBefore: lowEntry.score,
      scoreAfter:  rawScore,
      deltaMs:     now - lowEntry.timestamp,
    };
    this.allEvents.push(event);

    // Réinitialise l'historique pour éviter les duplicates consécutifs
    this.scoreHistory = [];

    return [event];
  }
}
