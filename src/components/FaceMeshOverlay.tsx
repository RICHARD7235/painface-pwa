"use client";

import { useRef, useEffect, useMemo } from "react";
import type { NormalizedLandmark } from "../types/facemesh";

interface FaceMeshOverlayProps {
  /** Array of faces, each face = 468 normalized landmarks [0,1] */
  landmarks: NormalizedLandmark[][];
  /** Display area width (px) */
  width: number;
  /** Display area height (px) */
  height: number;
  /** Actual image width analyzed by MediaPipe (px) */
  imageWidth: number;
  /** Actual image height analyzed by MediaPipe (px) */
  imageHeight: number;
}

/**
 * Renders 468 MediaPipe landmarks as green dots on a Canvas 2D overlay.
 *
 * Cover transform: the video fills the container maintaining aspect ratio
 * (object-fit: cover). Landmarks are in normalized [0,1] coordinates;
 * we convert them to screen coordinates using:
 *   scale = max(screenW / imgW, screenH / imgH)
 *   cx = (lm.x - 0.5) * imgW * scale + screenW / 2
 *   cy = (lm.y - 0.5) * imgH * scale + screenH / 2
 */
export function FaceMeshOverlay({
  landmarks,
  width,
  height,
  imageWidth,
  imageHeight,
}: FaceMeshOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Pre-compute dot positions
  const dots = useMemo(() => {
    if (landmarks.length === 0) return [];

    const imgW = imageWidth > 0 ? imageWidth : width;
    const imgH = imageHeight > 0 ? imageHeight : height;

    const scale = Math.max(width / imgW, height / imgH);
    const visW = imgW * scale;
    const visH = imgH * scale;

    return landmarks.flatMap((face) =>
      face.map((lm) => ({
        cx: (lm.x - 0.5) * visW + width / 2,
        cy: (lm.y - 0.5) * visH + height / 2,
      })),
    );
  }, [landmarks, width, height, imageWidth, imageHeight]);

  // Draw on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    if (dots.length === 0) return;

    ctx.fillStyle = "rgba(0, 255, 100, 0.65)";
    for (const dot of dots) {
      ctx.beginPath();
      ctx.arc(dot.cx, dot.cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [dots, width, height]);

  if (dots.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        pointerEvents: "none",
      }}
    />
  );
}
