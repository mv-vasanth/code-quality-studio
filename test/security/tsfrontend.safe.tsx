// The correct form of every defect in tsfrontend.vuln.tsx.
import React from "react";

const API_BASE = import.meta.env.VITE_API_BASE;

export function Widget({ text }) {
  return <div title={API_BASE}>{text}</div>;
}
