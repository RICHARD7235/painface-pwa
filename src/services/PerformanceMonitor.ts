/**
 * PerformanceMonitor – Mesure et journalise les métriques de performance
 * du pipeline landmarks → AU → PSPI en temps réel.
 *
 * Métriques surveillées :
 *   - Temps de traitement par frame (objectif < 30 ms)
 *   - FPS effectif (basé sur les timestamps réels des frames)
 *   - Utilisation mémoire heap JS (performance.memory — Chrome/V8 uniquement)
 *
 * Alertes configurables par callback `onAlert` (debounce 1 s par catégorie).
 *
 * Usage :
 *   const monitor = new PerformanceMonitor({ targetFrameMs: 30, verbose: true });
 *   const stopFrame = monitor.startFrame();
 *   // … ActionUnitCalculator.compute() + PainScoreEngine.addSample() …
 *   stopFrame();
 *   console.log(monitor.getReport('iphone-12-mini'));
 */

// ─── Profils device ────────────────────────────────────────────────────────────

/**
 * Profils de référence pour les tests de performance sur device cible.
 * Les budgets sont plus larges sur les appareils faibles (iPhone 12 mini,
 * Pixel 6a) pour refléter leur puissance CPU réelle.
 */
export const DEVICE_PROFILES = {
  'iphone-12-mini': {
    name: 'iPhone 12 mini',
    /** Budget frame : A14 Bionic, JS bridge RN → 50 ms est réaliste */
    targetFrameMs: 50,
    minFps: 15,
    note: 'A14 Bionic, 4 GB RAM – baseline basse',
  },
  'pixel-6a': {
    name: 'Pixel 6a',
    /** Budget frame : Tensor G1, moins de RAM que flagships → 45 ms */
    targetFrameMs: 45,
    minFps: 15,
    note: 'Google Tensor G1, 6 GB RAM – baseline basse',
  },
  default: {
    name: 'Mid-range (défaut)',
    targetFrameMs: 33, // 30 fps
    minFps: 15,
    note: 'Appareil moyen-gamme de référence',
  },
} as const;

export type DeviceProfileName = keyof typeof DEVICE_PROFILES;

// ─── Types publics ─────────────────────────────────────────────────────────────

export interface FrameTimingSample {
  /** Durée du traitement de la frame en ms */
  duration: number;
  /** Timestamp de fin de frame (ms, Date.now()) */
  timestamp: number;
  /** Utilisation heap JS en Mo (performance.memory — V8 uniquement) */
  memoryMB?: number;
}

export interface PerfStats {
  /** Nombre total de frames enregistrées depuis le dernier reset() */
  frameCount: number;
  /** Moyenne des durées (ms) sur la fenêtre courante */
  avgFrameMs: number;
  /** 95e percentile des durées (ms) */
  p95FrameMs: number;
  /** Durée maximale observée (ms) */
  maxFrameMs: number;
  /** Durée minimale observée (ms) */
  minFrameMs: number;
  /** FPS moyen estimé depuis les timestamps réels des frames */
  avgFps: number;
  /** Utilisation mémoire moyenne en Mo (null si non disponible) */
  avgMemoryMB: number | null;
  /** Pourcentage de frames dépassant targetFrameMs */
  overBudgetPct: number;
  /** true si overBudgetPct < 5 % */
  withinBudget: boolean;
}

export interface PerfAlert {
  type: 'frame_over_budget' | 'memory_high';
  /** Valeur mesurée */
  value: number;
  /** Seuil dépassé */
  threshold: number;
  timestamp: number;
  /** Index de la frame concernée */
  frameIndex: number;
}

export interface PerformanceMonitorOptions {
  /**
   * Budget de temps par frame en ms (défaut : 33 ≈ 30 fps).
   * Dépasse ce budget → alerte `frame_over_budget`.
   */
  targetFrameMs?: number;
  /** FPS minimum acceptable — utilisé uniquement dans le rapport textuel. */
  minFps?: number;
  /**
   * Taille du ring buffer de samples (défaut : 120 = ~4 s à 30 fps).
   * Seules les WINDOW_SIZE dernières frames sont utilisées pour les stats.
   */
  windowSize?: number;
  /**
   * Seuil d'alerte mémoire en Mo (défaut : 200).
   * Déclenche `memory_high` si performance.memory le dépasse.
   */
  memoryAlertMB?: number;
  /** Callback déclenché à chaque alerte (debounce 1 s/catégorie). */
  onAlert?: (alert: PerfAlert) => void;
  /** Logge chaque frame en console si true (défaut : false). */
  verbose?: boolean;
}

// ─── PerformanceMonitor ────────────────────────────────────────────────────────

export class PerformanceMonitor {
  static readonly DEFAULT_TARGET_FRAME_MS = 33;
  static readonly DEFAULT_MIN_FPS         = 15;
  static readonly DEFAULT_WINDOW_SIZE     = 120;
  static readonly DEFAULT_MEMORY_ALERT_MB = 200;

  private readonly opts: Required<PerformanceMonitorOptions>;
  private samples: FrameTimingSample[] = [];
  private frameCount = 0;
  private lastAlertTs: Partial<Record<PerfAlert['type'], number>> = {};

  constructor(options?: PerformanceMonitorOptions) {
    this.opts = {
      targetFrameMs:  options?.targetFrameMs  ?? PerformanceMonitor.DEFAULT_TARGET_FRAME_MS,
      minFps:         options?.minFps         ?? PerformanceMonitor.DEFAULT_MIN_FPS,
      windowSize:     options?.windowSize     ?? PerformanceMonitor.DEFAULT_WINDOW_SIZE,
      memoryAlertMB:  options?.memoryAlertMB  ?? PerformanceMonitor.DEFAULT_MEMORY_ALERT_MB,
      onAlert:        options?.onAlert        ?? (() => {}),
      verbose:        options?.verbose        ?? false,
    };
  }

  // ── API principale ────────────────────────────────────────────────────────

  /**
   * Démarre une mesure de frame.
   * Retourne une fonction `stop()` à appeler dès la fin du traitement.
   *
   * @example
   *   const stop = monitor.startFrame();
   *   const aus  = calc.compute(landmarks);
   *   const state = engine.addSample(aus!);
   *   stop();
   */
  startFrame(): () => void {
    const t0 = this._now();
    return () => {
      this._record(this._now() - t0);
    };
  }

  /**
   * Enregistre manuellement une durée de frame (utile dans les tests
   * où le timing est simulé).
   */
  recordFrameDuration(durationMs: number): void {
    this._record(durationMs);
  }

  // ── Stats & rapport ───────────────────────────────────────────────────────

  /** Statistiques sur le ring buffer courant. */
  getStats(): PerfStats {
    const w = this.samples;
    if (w.length === 0) {
      return {
        frameCount: 0, avgFrameMs: 0, p95FrameMs: 0,
        maxFrameMs: 0, minFrameMs: 0, avgFps: 0,
        avgMemoryMB: null, overBudgetPct: 0, withinBudget: true,
      };
    }

    const sorted = w.map(s => s.duration).sort((a, b) => a - b);
    const avg    = sorted.reduce((s, v) => s + v, 0) / sorted.length;
    const p95    = sorted[Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1)];

    const memArr = w
      .map(s => s.memoryMB)
      .filter((v): v is number => v !== undefined);
    const avgMem = memArr.length > 0
      ? memArr.reduce((s, v) => s + v, 0) / memArr.length
      : null;

    const overBudget    = w.filter(s => s.duration > this.opts.targetFrameMs).length;
    const overBudgetPct = (overBudget / w.length) * 100;

    return {
      frameCount:    this.frameCount,
      avgFrameMs:    Math.round(avg * 10) / 10,
      p95FrameMs:    Math.round(p95 * 10) / 10,
      maxFrameMs:    Math.round(sorted[sorted.length - 1] * 10) / 10,
      minFrameMs:    Math.round(sorted[0] * 10) / 10,
      avgFps:        Math.round(this._computeFps(w) * 10) / 10,
      avgMemoryMB:   avgMem !== null ? Math.round(avgMem * 10) / 10 : null,
      overBudgetPct: Math.round(overBudgetPct * 10) / 10,
      withinBudget:  overBudgetPct < 5,
    };
  }

  /**
   * Rapport lisible en une chaîne pour les logs et les CI.
   * @param deviceProfile Profil device à utiliser pour les seuils.
   */
  getReport(deviceProfile: DeviceProfileName = 'default'): string {
    const stats   = this.getStats();
    const profile = DEVICE_PROFILES[deviceProfile];
    const pass    = stats.avgFrameMs <= profile.targetFrameMs;
    const fpsPass = stats.avgFps >= profile.minFps || stats.avgFps === 0;

    return [
      `\n=== PerformanceMonitor — ${profile.name} ===`,
      `Frame  : avg ${stats.avgFrameMs} ms | p95 ${stats.p95FrameMs} ms | max ${stats.maxFrameMs} ms`,
      `FPS    : ${stats.avgFps} (min cible : ${profile.minFps})`,
      `Frames : ${stats.frameCount} total | ${stats.overBudgetPct}% hors budget`,
      `Mémoire: ${stats.avgMemoryMB !== null ? stats.avgMemoryMB + ' MB' : 'N/A'}`,
      `Budget : <${profile.targetFrameMs} ms — ${pass ? '✅ PASS' : '❌ FAIL'} | FPS — ${fpsPass ? '✅ PASS' : '❌ FAIL'}`,
      '===========================================',
    ].join('\n');
  }

  // ── État ──────────────────────────────────────────────────────────────────

  /** Réinitialise toutes les mesures (ring buffer, compteur, alertes). */
  reset(): void {
    this.samples      = [];
    this.frameCount   = 0;
    this.lastAlertTs  = {};
  }

  getSampleCount(): number {
    return this.frameCount;
  }

  getSamples(): Readonly<FrameTimingSample[]> {
    return this.samples;
  }

  // ── Privé ─────────────────────────────────────────────────────────────────

  private _now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private _record(durationMs: number): void {
    this.frameCount++;
    const sample: FrameTimingSample = {
      duration:  durationMs,
      timestamp: Date.now(),
      memoryMB:  this._memoryMB(),
    };

    this.samples.push(sample);
    if (this.samples.length > this.opts.windowSize) {
      this.samples.shift();
    }

    this._fireAlerts(sample);

    if (this.opts.verbose) {
      const flag = durationMs > this.opts.targetFrameMs ? '⚠️ ' : '✓  ';
      console.log(`[Perf] frame #${this.frameCount} ${flag}${durationMs.toFixed(1)} ms`);
    }
  }

  private _memoryMB(): number | undefined {
    try {
      // performance.memory est non-standard (Chrome / Hermes avec flag)
      // @ts-ignore
      const m = (typeof performance !== 'undefined') && performance?.memory;
      if (m?.usedJSHeapSize) return m.usedJSHeapSize / 1_048_576;
    } catch {/* ignore */}
    return undefined;
  }

  private _computeFps(samples: FrameTimingSample[]): number {
    if (samples.length < 2) return 0;
    const elapsed = samples[samples.length - 1].timestamp - samples[0].timestamp;
    return elapsed > 0 ? ((samples.length - 1) / elapsed) * 1_000 : 0;
  }

  private _fireAlerts(sample: FrameTimingSample): void {
    const now      = sample.timestamp;
    const DEBOUNCE = 1_000; // ms entre 2 alertes du même type

    if (sample.duration > this.opts.targetFrameMs) {
      if (!this.lastAlertTs.frame_over_budget ||
          now - this.lastAlertTs.frame_over_budget > DEBOUNCE) {
        this.lastAlertTs.frame_over_budget = now;
        this.opts.onAlert({
          type:       'frame_over_budget',
          value:      sample.duration,
          threshold:  this.opts.targetFrameMs,
          timestamp:  now,
          frameIndex: this.frameCount,
        });
      }
    }

    if (sample.memoryMB !== undefined && sample.memoryMB > this.opts.memoryAlertMB) {
      if (!this.lastAlertTs.memory_high ||
          now - this.lastAlertTs.memory_high > DEBOUNCE) {
        this.lastAlertTs.memory_high = now;
        this.opts.onAlert({
          type:       'memory_high',
          value:      sample.memoryMB,
          threshold:  this.opts.memoryAlertMB,
          timestamp:  now,
          frameIndex: this.frameCount,
        });
      }
    }
  }
}
