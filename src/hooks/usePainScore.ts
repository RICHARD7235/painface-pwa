"use client";

/**
 * usePainScore – Hook React pour l'analyse temporelle du score PSPI.
 *
 * Port direct de la version Expo (pas de dépendances RN).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NormalizedLandmark } from '../types/facemesh';
import type { ActionUnitsResult } from '../types/actionUnits';
import { ActionUnitCalculator } from '../services/ActionUnitCalculator';
import {
  PainScoreEngine,
  type PainEngineOptions,
  type PainSpikeEvent,
  type ScoreTrend,
} from '../services/PainScoreEngine';

export interface UsePainScoreReturn {
  currentScore: number | null;
  smoothedScore: number | null;
  trend: ScoreTrend | null;
  painEvents: PainSpikeEvent[];
}

export function usePainScore(
  landmarks: NormalizedLandmark[] | null | undefined,
  options?: PainEngineOptions,
): UsePainScoreReturn {
  const calculatorRef = useRef(new ActionUnitCalculator());
  const engineRef = useRef(new PainScoreEngine(options));

  const [currentScore, setCurrentScore] = useState<number | null>(null);
  const [smoothedScore, setSmoothedScore] = useState<number | null>(null);
  const [trend, setTrend] = useState<ScoreTrend | null>(null);
  const [painEvents, setPainEvents] = useState<PainSpikeEvent[]>([]);

  const processLandmarks = useCallback((lm: NormalizedLandmark[]) => {
    const aus: ActionUnitsResult | null = calculatorRef.current.compute(lm);
    if (!aus) return;

    const state = engineRef.current.addSample(aus, Date.now());

    setCurrentScore(state.currentScore);
    setSmoothedScore(state.smoothedScore);
    setTrend(state.trend);

    if (state.newEvents.length > 0) {
      setPainEvents((prev) => [...prev, ...state.newEvents]);
    }
  }, []);

  useEffect(() => {
    if (!landmarks || landmarks.length < 468) return;
    processLandmarks(landmarks);
  }, [landmarks, processLandmarks]);

  return { currentScore, smoothedScore, trend, painEvents };
}

/**
 * Variante qui accepte un ActionUnitsResult déjà calculé.
 */
export function usePainScoreFromAUs(
  actionUnits: ActionUnitsResult | null | undefined,
  options?: PainEngineOptions,
  calibrationComplete?: boolean,
): UsePainScoreReturn {
  const engineRef = useRef(new PainScoreEngine(options));

  const [currentScore, setCurrentScore] = useState<number | null>(null);
  const [smoothedScore, setSmoothedScore] = useState<number | null>(null);
  const [trend, setTrend] = useState<ScoreTrend | null>(null);
  const [painEvents, setPainEvents] = useState<PainSpikeEvent[]>([]);

  useEffect(() => {
    if (options) engineRef.current.updateOptions(options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    options?.smoothingWindowMs,
    options?.spikeLowThreshold,
    options?.spikeHighThreshold,
  ]);

  const prevCalibRef = useRef(calibrationComplete);
  useEffect(() => {
    if (calibrationComplete && !prevCalibRef.current) {
      engineRef.current.reset();
    }
    prevCalibRef.current = calibrationComplete;
  }, [calibrationComplete]);

  useEffect(() => {
    if (!actionUnits) return;

    const state = engineRef.current.addSample(actionUnits, Date.now());

    setCurrentScore(state.currentScore);
    setSmoothedScore(state.smoothedScore);
    setTrend(state.trend);

    if (state.newEvents.length > 0) {
      setPainEvents((prev) => [...prev, ...state.newEvents]);
    }
  }, [actionUnits]);

  return { currentScore, smoothedScore, trend, painEvents };
}
