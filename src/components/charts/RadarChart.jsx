import { radarGeometry } from "./radarGeometry.js";

export default function RadarChart({ scores, categories, accent = "#14b8a6" }) {
  const cats = categories ?? []; // render every category — no cap
  const g = radarGeometry(scores, cats);
  return (
    <svg width={g.size} height={g.size} viewBox={`0 0 ${g.size} ${g.size}`}
         style={{ display: "block", margin: "0 auto", maxWidth: "100%" }}>
      {g.rings.map(ring => (
        <polygon key={ring.level} points={ring.points} fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
      ))}
      {g.spokes.map((e, i) => (
        <line key={i} x1={g.cx} y1={g.cy} x2={e.x} y2={e.y} stroke="#e5e7eb" strokeWidth="0.5"/>
      ))}
      <polygon points={g.polygon} fill={`${accent}22`} stroke={accent} strokeWidth="2"/>
      {g.dots.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={accent}/>)}
      {g.labels.map((l, i) => (
        <text key={i} x={l.x} y={l.y} textAnchor={l.anchor} dominantBaseline="central"
              style={{ fontSize: 8, fill: "#555", fontFamily: "system-ui" }}>{l.icon} {l.text}</text>
      ))}
    </svg>
  );
}
