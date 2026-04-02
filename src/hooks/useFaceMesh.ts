"use client";

/**
 * useFaceMesh – Hook MediaPipe Face Landmarker direct (PWA).
 *
 * GAIN MAJEUR vs Expo : plus de WebView, plus d'encode JPEG base64.
 * detectForVideo() travaille directement sur l'élément <video> → 15-30 fps.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import type { RefObject } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '../types/facemesh';
import type { DetectionStatus } from '../types/facemesh';
import type { ActionUnitsResult, PainScore } from '../types/actionUnits';
import { computeDetectionStatus } from '../utils/faceMeshUtils';
import {
  ActionUnitCalculator,
  CalibrationManager,
} from '../services/ActionUnitCalculator';
import { loadSettings } from '../services/SettingsService';

const FPS_WINDOW_MS = 1000;
const CALIB_POLL_MS = 100;

export interface UseFaceMeshReturn {
  landmarks: NormalizedLandmark[][];
  status: DetectionStatus;
  fps: number;
  loadingMessage: string;
  actionUnits: ActionUnitsResult | null;
  painScore: PainScore | null;
  calibrationProgress: number;
  isCalibrating: boolean;
  calibrationComplete: boolean;
  startCalibration: () => void;
  startDetection: () => void;
  stopDetection: () => void;
}

export function useFaceMesh(
  videoRef: RefObject<HTMLVideoElement | null>,
): UseFaceMeshReturn {
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number>(0);
  const isRunningRef = useRef(false);

  const [landmarks, setLandmarks] = useState<NormalizedLandmark[][]>([]);
  const [status, setStatus] = useState<DetectionStatus>('loading');
  const [fps, setFps] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Initialisation...');

  const [actionUnits, setActionUnits] = useState<ActionUnitsResult | null>(null);
  const [painScore, setPainScore] = useState<PainScore | null>(null);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationComplete, setCalibrationComplete] = useState(false);

  const frameCount = useRef(0);
  const lastFpsTime = useRef(Date.now());

  const calculatorRef = useRef(new ActionUnitCalculator());
  const calibMgrRef = useRef<CalibrationManager | null>(null);

  // Init MediaPipe WASM directly (no WebView!)
  const init = useCallback(async () => {
    try {
      setLoadingMessage('Chargement du runtime WASM...');
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm',
      );

      setLoadingMessage('Chargement du modèle IA (~16 Mo)...');
      landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false,
      });

      // Apply saved thresholds
      const { thresholds, calibrationDurationSec } = loadSettings();
      calculatorRef.current.setThresholds(thresholds);
      calibMgrRef.current = new CalibrationManager(calculatorRef.current, {
        durationMs: calibrationDurationSec * 1000,
      });

      setLoadingMessage('');
      setStatus('no_face');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur MediaPipe';
      setLoadingMessage(`Erreur: ${msg}`);
      setStatus('error');
    }
  }, []);

  // Detection loop using requestAnimationFrame
  const detect = useCallback(() => {
    if (
      !landmarkerRef.current ||
      !videoRef.current ||
      videoRef.current.readyState < 2
    ) {
      if (isRunningRef.current) {
        rafRef.current = requestAnimationFrame(detect);
      }
      return;
    }

    const result = landmarkerRef.current.detectForVideo(
      videoRef.current,
      performance.now(),
    );

    if (result.faceLandmarks && result.faceLandmarks.length > 0) {
      const faces = result.faceLandmarks as NormalizedLandmark[][];
      setLandmarks(faces);
      setStatus(computeDetectionStatus(faces));

      const face = faces[0];
      if (face) {
        // Feed calibration if active
        if (calibMgrRef.current?.isCalibrating()) {
          calibMgrRef.current.addFrame(face);
        }
        const aus = calculatorRef.current.compute(face);
        setActionUnits(aus);
        setPainScore(aus ? calculatorRef.current.computePainScore(aus) : null);
      }
    } else {
      setLandmarks([]);
      setStatus('no_face');
      setActionUnits(null);
      setPainScore(null);
    }

    // FPS counter
    frameCount.current += 1;
    const now = Date.now();
    const elapsed = now - lastFpsTime.current;
    if (elapsed >= FPS_WINDOW_MS) {
      setFps(Math.round((frameCount.current * 1000) / elapsed));
      frameCount.current = 0;
      lastFpsTime.current = now;
    }

    if (isRunningRef.current) {
      rafRef.current = requestAnimationFrame(detect);
    }
  }, [videoRef]);

  const startDetection = useCallback(() => {
    isRunningRef.current = true;
    rafRef.current = requestAnimationFrame(detect);
  }, [detect]);

  const stopDetection = useCallback(() => {
    isRunningRef.current = false;
    cancelAnimationFrame(rafRef.current);
  }, []);

  // Calibration
  const startCalibration = useCallback(() => {
    if (!calibMgrRef.current) return;
    calibMgrRef.current.start();
    setIsCalibrating(true);
    setCalibrationComplete(false);
    setCalibrationProgress(0);
  }, []);

  // Calibration progress polling
  useEffect(() => {
    if (!isCalibrating || !calibMgrRef.current) return;

    const id = setInterval(() => {
      if (!calibMgrRef.current) return;
      const progress = calibMgrRef.current.getProgress();
      setCalibrationProgress(progress);

      if (!calibMgrRef.current.isCalibrating()) {
        const thresholds = calibMgrRef.current.stop();
        calculatorRef.current.setThresholds(thresholds);
        setIsCalibrating(false);
        setCalibrationComplete(true);
        setCalibrationProgress(1);
      }
    }, CALIB_POLL_MS);

    return () => clearInterval(id);
  }, [isCalibrating]);

  // Init on mount, cleanup on unmount
  useEffect(() => {
    init();
    return () => {
      isRunningRef.current = false;
      cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
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
  };
}
