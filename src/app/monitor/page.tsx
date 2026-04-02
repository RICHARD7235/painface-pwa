"use client";

import dynamic from "next/dynamic";

const MonitorView = dynamic(() => import("./MonitorView"), { ssr: false });

export default function MonitorPage() {
  return <MonitorView />;
}
