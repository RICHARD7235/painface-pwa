/**
 * AdaptiveFrameScheduler – Adapte dynamiquement le taux de traitement des frames
 * selon la stabilité du score PSPI.
 *
 * Règle :
 *   - Score **stable** (variation ≤ stableThreshold sur stableWindowSize frames)
 *     → mode LOW (15 fps, toutes les ~67 ms) pour économiser CPU/batterie.
 *   - Score **instable** (variation > stableThreshold)
 *     → mode HIGH (30 fps, toutes les ~33 ms) pour ne rater aucun épisode douloureux.
 *
 * La transition est déclenchée par `shouldProcess()` qui :
 *   1. Met à jour l'historique de stabilité avec le score courant.
 *   2. Évalue si un changement de mode est nécessaire.
 *   3. Décide si la frame courante doit être traitée selon l'intervalle du mode actuel.
 *
 * Usage avec la boucle de capture (setInterval 200 ms ou requestAnimationFrame) :
 *
 *   const scheduler = new AdaptiveFrameScheduler();
 *
 *   // Dans la boucle de capture :
 *   const pspi = engine.getCurrentScore() ?? 0;
 *   if (scheduler.shouldProcess(pspi)) {
 *     const aus = calc.compute(landmarks);
 *     if (aus) engine.addSample(aus);
 *   }
 *
 *   // Rapport :
 *   console.log('Mode:', scheduler.getMode(), scheduler.getCurrentFps(), 'fps');
 */

// ─── Types publics ─────────────────────────────────────────────────────────────

/** 'high' = 30 fps nominal · 'low' = 15 fps économie */
export type SchedulerMode = 'high' | 'low';

export interface AdaptiveSchedulerOptions {
  /**
   * FPS en mode nominal (score instable).
   * Défaut : 30 fps (intervalle ~33 ms).
   */
  highFps?: number;
  /**
   * FPS en mode économie (score stable).
   * Défaut : 15 fps (intervalle ~67 ms).
   */
  lowFps?: number;
  /**
   * Variation maximale du score PSPI (0–16) pour être considéré « stable ».
   * Défaut : 0.5 — correspond à une variation < 3 % de la plage totale.
   */
  stableThreshold?: number;
  /**
   * Nombre de frames consécutives à observer avant de déclarer la stabilité.
   * Défaut : 5 — environ 1 s à 5 fps réels sur Expo Go.
   */
  stableWindowSize?: number;
  /**
   * Callback déclenché lors de chaque changement de mode.
   * Peut être utilisé pour loguer ou ajuster d'autres composants.
   */
  onModeChange?: (mode: SchedulerMode, newFps: number) => void;
}

// ─── AdaptiveFrameScheduler ────────────────────────────────────────────────────

export class AdaptiveFrameScheduler {
  static readonly DEFAULT_HIGH_FPS          = 30;
  static readonly DEFAULT_LOW_FPS           = 15;
  static readonly DEFAULT_STABLE_THRESHOLD  = 0.5;
  static readonly DEFAULT_STABLE_WINDOW     = 5;

  private readonly opts: Required<AdaptiveSchedulerOptions>;

  /** Fenêtre glissante des derniers scores reçus. */
  private scoreHistory: number[] = [];
  /** Mode actuel. */
  private mode: SchedulerMode = 'high';
  /** Timestamp (ms) de la dernière frame effectivement traitée. */
  private lastProcessedTs = 0;

  constructor(options?: AdaptiveSchedulerOptions) {
    this.opts = {
      highFps:          options?.highFps          ?? AdaptiveFrameScheduler.DEFAULT_HIGH_FPS,
      lowFps:           options?.lowFps           ?? AdaptiveFrameScheduler.DEFAULT_LOW_FPS,
      stableThreshold:  options?.stableThreshold  ?? AdaptiveFrameScheduler.DEFAULT_STABLE_THRESHOLD,
      stableWindowSize: options?.stableWindowSize ?? AdaptiveFrameScheduler.DEFAULT_STABLE_WINDOW,
      onModeChange:     options?.onModeChange      ?? (() => {}),
    };
  }

  // ── API principale ──────────────────────────────────────────────────────────

  /**
   * Décide si la frame associée au score courant doit être traitée.
   *
   * @param currentScore Score PSPI courant (0–16).
   * @param now          Timestamp courant en ms (par défaut `Date.now()`).
   *                     Injectez-le dans les tests pour un contrôle exact.
   * @returns `true` si la frame doit passer dans le pipeline AU/PSPI.
   */
  shouldProcess(currentScore: number, now: number = Date.now()): boolean {
    this._push(currentScore);
    this._maybeSwitch();

    const intervalMs = 1_000 / (this.mode === 'high' ? this.opts.highFps : this.opts.lowFps);
    if (now - this.lastProcessedTs < intervalMs) return false;

    this.lastProcessedTs = now;
    return true;
  }

  // ── Lecture de l'état ───────────────────────────────────────────────────────

  /** Mode actuel ('high' ou 'low'). */
  getMode(): SchedulerMode {
    return this.mode;
  }

  /** FPS nominal du mode actuel. */
  getCurrentFps(): number {
    return this.mode === 'high' ? this.opts.highFps : this.opts.lowFps;
  }

  /** Intervalle cible en ms pour le mode actuel. */
  getIntervalMs(): number {
    return 1_000 / this.getCurrentFps();
  }

  /**
   * `true` si la fenêtre de stabilité est pleine ET la variation ≤ stableThreshold.
   * Utile pour afficher un indicateur « mode économie » dans l'UI.
   */
  isStable(): boolean {
    return this._stable();
  }

  // ── Reset ───────────────────────────────────────────────────────────────────

  /**
   * Remet le scheduler à son état initial (mode high, historique vide).
   * Typiquement appelé lors d'un changement de patient ou après une pause.
   */
  reset(): void {
    const prev          = this.mode;
    this.scoreHistory   = [];
    this.lastProcessedTs = 0;
    this.mode           = 'high';
    if (prev !== 'high') {
      this.opts.onModeChange('high', this.opts.highFps);
    }
  }

  // ── Privé ───────────────────────────────────────────────────────────────────

  private _push(score: number): void {
    this.scoreHistory.push(score);
    if (this.scoreHistory.length > this.opts.stableWindowSize) {
      this.scoreHistory.shift();
    }
  }

  private _stable(): boolean {
    if (this.scoreHistory.length < this.opts.stableWindowSize) return false;
    const min = Math.min(...this.scoreHistory);
    const max = Math.max(...this.scoreHistory);
    return (max - min) <= this.opts.stableThreshold;
  }

  private _maybeSwitch(): void {
    const stable = this._stable();
    const prev   = this.mode;

    if (stable && this.mode === 'high') {
      this.mode = 'low';
    } else if (!stable && this.mode === 'low') {
      this.mode = 'high';
    }

    if (this.mode !== prev) {
      this.opts.onModeChange(this.mode, this.getCurrentFps());
    }
  }
}
