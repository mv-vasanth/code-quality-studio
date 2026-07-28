import { useEffect, useRef } from "react";

/**
 * Full-screen in-app viewer for generated HTML reports (blob iframe).
 */
export default function ReportHtmlPreview({ open, title, html, onClose, onDownload }) {
  const iframeRef = useRef(null);
  const urlRef = useRef(null);

  useEffect(() => {
    if (!open || !html) return undefined;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    const frame = iframeRef.current;
    if (frame) frame.src = url;
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [open, html]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || "Report preview"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(15, 23, 42, 0.55)",
        display: "flex",
        flexDirection: "column",
        padding: 12,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
          maxWidth: 1200,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderBottom: "1px solid #e5e7eb",
            background: "#f8fafc",
            flexShrink: 0,
          }}
        >
          <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{title}</span>
          {onDownload ? (
            <button
              type="button"
              onClick={onDownload}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #99f6e4",
                background: "#fff",
                color: "#0f766e",
                cursor: "pointer",
              }}
            >
              Download .html
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: 8,
              border: "none",
              background: "#0d9488",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
        <iframe
          ref={iframeRef}
          title={title || "Report"}
          style={{ flex: 1, width: "100%", border: "none", background: "#fff" }}
          sandbox="allow-same-origin allow-scripts allow-popups allow-downloads"
        />
      </div>
    </div>
  );
}
