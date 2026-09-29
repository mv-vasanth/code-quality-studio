// Deliberately vulnerable.
import React from "react";

const API_KEY = "sk-live-abcdef123456";              // TSF-SEC-004

export function Widget({ html, expr }) {
  eval(expr);                                        // TSF-SEC-003
  return <div dangerouslySetInnerHTML={{ __html: html }} />;  // TSF-SEC-001
}
