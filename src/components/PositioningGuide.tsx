"use client";

import { useEffect, useRef, useState } from "react";
import type { NormalizedLandmark, DetectionStatus } from "../types/facemesh";

// ---- Constants ----

const OVAL_CX_FRAC = 0.5;
const OVAL_CY_FRAC = 0.44;
const OVAL_RX_FRAC = 0.28;
const OVAL_RY_FRAC = 0.32;

interface PositioningGuideProps {
  landmarks: NormalizedLandmark[] | null | undefined;
  status: DetectionStatus;
  width: number;
  height: number;
  alwaysShow?: boolean;
}

/**
 * Determines the positioning state from landmarks & status.
 * Simplified version for PWA -- the full analyzePositioning util
 * can be imported once migrated. For now, derive state from status.
 */
function deriveState(
  status: DetectionStatus,
  landmarks: NormalizedLandmark[] | null | undefined,
): { state: "good" | "adjust" | "no_face"; color: string; hint: string } {
  if (status === "no_face" || !landmarks || landmarks.length === 0) {
    return {
      state: "no_face",
      color: "#ef4444",
      hint: "Placez votre visage dans l\u2019ovale",
    };
  }

  // Simple centring check: nose tip (landmark 1) should be near center
  const nose = landmarks[1];
  if (nose) {
    const dx = Math.abs(nose.x - OVAL_CX_FRAC);
    const dy = Math.abs(nose.y - OVAL_CY_FRAC);
    if (dx > 0.15 || dy > 0.18) {
      return {
        state: "adjust",
        color: "#f59e0b",
        hint: "Centrez votre visage",
      };
    }
  }

  if (status === "detected") {
    return { state: "good", color: "#22c55e", hint: "" };
  }

  return { state: "adjust", color: "#f59e0b", hint: "Ajustez la position" };
}

export default function PositioningGuide({
  landmarks,
  status,
  width,
  height,
  alwaysShow = true,
}: PositioningGuideProps) {
  const { state, color, hint } = deriveState(status, landmarks);

  // Pulse animation for no_face state
  const [opacity, setOpacity] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state === "no_face") {
      let increasing = false;
      let val = 1;
      intervalRef.current = setInterval(() => {
        val += increasing ? 0.05 : -0.05;
        if (val <= 0.3) increasing = true;
        if (val >= 1) increasing = false;
        setOpacity(val);
      }, 50);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setOpacity(1);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state]);

  // Hide when well-positioned and not always shown
  if (!alwaysShow && state === "good") return null;

  const cx = width * OVAL_CX_FRAC;
  const cy = height * OVAL_CY_FRAC;
  const rx = width * OVAL_RX_FRAC;
  const ry = height * OVAL_RY_FRAC;

  const isDashed = state === "no_face";
  const ovalOpacity = state === "good" ? 0.75 : 0.9;

  const tickLen = 14;
  const gap = 8;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        pointerEvents: "none",
        opacity,
      }}
    >
      {/* SVG Oval + crosshair ticks */}
      <svg width={width} height={height}>
        {/* Shadow ellipse */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx + 2}
          ry={ry + 2}
          fill="none"
          stroke="rgba(0,0,0,0.25)"
          strokeWidth={6}
          strokeDasharray={isDashed ? "12,8" : undefined}
          opacity={ovalOpacity}
        />

        {/* Main ellipse */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={isDashed ? "12,8" : undefined}
          opacity={ovalOpacity}
        />

        {/* Cross ticks: top */}
        <line
          x1={cx}
          y1={cy - ry - gap - tickLen}
          x2={cx}
          y2={cy - ry - gap}
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {/* Bottom */}
        <line
          x1={cx}
          y1={cy + ry + gap}
          x2={cx}
          y2={cy + ry + gap + tickLen}
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {/* Left */}
        <line
          x1={cx - rx - gap - tickLen}
          y1={cy}
          x2={cx - rx - gap}
          y2={cy}
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {/* Right */}
        <line
          x1={cx + rx + gap}
          y1={cy}
          x2={cx + rx + gap + tickLen}
          y2={cy}
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={3} fill={color} opacity={0.5} />
      </svg>

      {/* Hint pill */}
      {hint && (
        <div
          style={{
            position: "absolute",
            bottom: height * (1 - OVAL_CY_FRAC - OVAL_RY_FRAC) - 52,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              backgroundColor: color + "EE",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              borderRadius: 20,
              padding: "6px 16px",
              textShadow: "0 1px 2px rgba(0,0,0,0.4)",
            }}
          >
            {hint}
          </span>
        </div>
      )}

      {/* "Bien cadre" badge */}
      {state === "good" && (
        <div
          style={{
            position: "absolute",
            top: cy - ry - 40,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              backgroundColor: "rgba(34,197,94,0.85)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 12,
              padding: "4px 14px",
            }}
          >
            {"\u2713 Bien cadre"}
          </span>
        </div>
      )}
    </div>
  );
}
