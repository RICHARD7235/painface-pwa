"use client";

import dynamic from "next/dynamic";

const CameraView = dynamic(() => import("./CameraView"), { ssr: false });

export default function CameraPage() {
  return <CameraView />;
}
