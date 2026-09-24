import { useRef, useState } from "react";

/**
 * Centered drop-zone modal — polished in-app overlay for opening test files.
 * Supports drag-and-drop, individual file picker, and folder picker.
 * Calls `onFiles(FileList)` with the selected/dropped files.
 */
export default function FileDropModal({ onFiles, onClose, fileAccept = ".ts,.js,.tsx,.jsx" }) {
  const fileInputRef   = useRef(null);
  const folderInputRef = useRef(null);
  const [over, setOver] = useState(false);

  const submit = (fileList) => {
    const arr = Array.from(fileList);
    if (arr.length) { onFiles(arr); onClose(); }
  };

  return (
    /* Backdrop — click outside to dismiss */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Open test files"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(15,23,42,0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <style>{`
        @keyframes _modalIn{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
        ._fm{animation:_modalIn .18s cubic-bezier(.22,.68,0,1.2) both}
      `}</style>

      {/* Card */}
      <div
        className="_fm"
        style={{
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 18,
          boxShadow: "0 32px 80px rgba(0,0,0,0.65)",
          width: "min(500px, 92vw)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 22px 14px",
          borderBottom: "1px solid #334155",
        }}>
          <div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: "#0d9488", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📂</span>
              Open test files
            </div>
            <div style={{ color: "#64748b", fontSize: 11.5, marginTop: 4, paddingLeft: 38 }}>
              Playwright spec / test files · .spec.ts · .spec.js · .test.ts
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent", border: "1px solid #334155",
              color: "#64748b", fontSize: 16, cursor: "pointer",
              borderRadius: 8, width: 30, height: 30,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#334155"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#64748b"; }}
          >
            ✕
          </button>
        </div>

        {/* Drop zone */}
        <div style={{ padding: "22px 22px 16px" }}>
          <div
            onDragEnter={() => setOver(true)}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
            onDrop={(e) => { e.preventDefault(); setOver(false); submit(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${over ? "#0d9488" : "#334155"}`,
              borderRadius: 14,
              padding: "44px 24px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
              background: over ? "rgba(13,148,136,0.1)" : "rgba(15,23,42,0.4)",
              transition: "all 0.15s",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <div style={{ fontSize: 42, lineHeight: 1, filter: over ? "drop-shadow(0 0 12px #0d9488)" : "none", transition: "filter 0.2s" }}>
              {over ? "🟢" : "📄"}
            </div>
            <div style={{ color: over ? "#5eead4" : "#94a3b8", fontSize: 14, fontWeight: 600, textAlign: "center" }}>
              {over ? "Release to load files" : "Drag & drop files here"}
            </div>
            <div style={{ color: "#475569", fontSize: 11.5, textAlign: "center" }}>
              Click anywhere in this box to pick individual files
            </div>
          </div>
        </div>

        {/* OR divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 22px", color: "#334155" }}>
          <div style={{ flex: 1, height: 1, background: "#334155" }} />
          <span style={{ color: "#475569", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em" }}>OR</span>
          <div style={{ flex: 1, height: 1, background: "#334155" }} />
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10, padding: "16px 22px 22px" }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              flex: 1, padding: "12px 14px", borderRadius: 12,
              border: "1px solid #334155", background: "transparent",
              color: "#94a3b8", fontSize: 12.5, fontWeight: 600,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#334155"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "#475569"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.borderColor = "#334155"; }}
          >
            📄 Pick files…
          </button>
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            style={{
              flex: 1, padding: "12px 14px", borderRadius: 12,
              border: "none", background: "#0d9488",
              color: "#fff", fontSize: 12.5, fontWeight: 700,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 4px 14px rgba(13,148,136,0.35)",
              transition: "background 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#0f766e"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#0d9488"; }}
          >
            📁 Pick folder…
          </button>
        </div>
      </div>

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={fileAccept}
        style={{ display: "none" }}
        onChange={(e) => submit(e.target.files)}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore — non-standard but widely supported
        webkitdirectory=""
        multiple
        style={{ display: "none" }}
        onChange={(e) => submit(e.target.files)}
      />
    </div>
  );
}
