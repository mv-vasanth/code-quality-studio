export default function RadarChart({ scores, categories, accent = "#14b8a6" }) {
  const cats = categories ?? []; // render every category — no cap
  const size = 260, cx = size / 2, cy = size / 2, r = 88, labelR = 104;
  const step = cats.length ? (2 * Math.PI) / cats.length : 1;
  const pt = (i, v) => ({
    x: cx + (v/100)*r*Math.cos(i*step - Math.PI/2),
    y: cy + (v/100)*r*Math.sin(i*step - Math.PI/2),
  });
  const poly = cats.map((c,i) => { const p = pt(i, scores[c.id]??0); return `${p.x},${p.y}`; }).join(" ");
  const fill = `${accent}22`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", margin: "0 auto", maxWidth: "100%" }}>
      {[20,40,60,80,100].map(l => (
        <polygon key={l} points={cats.map((_,i)=>{ const p=pt(i,l); return `${p.x},${p.y}`; }).join(" ")}
          fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
      ))}
      {cats.map((_,i) => { const e=pt(i,100); return <line key={i} x1={cx} y1={cy} x2={e.x} y2={e.y} stroke="#e5e7eb" strokeWidth="0.5"/>; })}
      <polygon points={poly} fill={fill} stroke={accent} strokeWidth="2"/>
      {cats.map((c,i) => { const p=pt(i, scores[c.id]??0); return <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={accent}/>; })}
      {cats.map((c,i) => { const lp=pt(i,labelR); return (
        <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="central"
          style={{ fontSize: 8, fill: "#555", fontFamily: "system-ui" }}>{c.icon} {c.label.split(" ")[0]}</text>
      );})}
    </svg>
  );
}
