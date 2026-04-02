"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const CameraView = dynamic(() => import("./CameraView"), { ssr: false });

export default function CameraPage() {
  return (
    <Suspense fallback={<div className="flex h-[100dvh] items-center justify-center bg-[#0b1628]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" /></div>}>
      <CameraView />
    </Suspense>
  );
}
