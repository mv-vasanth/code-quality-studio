/**
 * Geometry for the coverage radar — shared by the React chart and the HTML report.
 *
 * The two renderers are unavoidably different (JSX elements vs. an HTML string,
 * and the report has no React runtime), but the maths must not be. Everything
 * positional lives here so a change to the shape moves both at once.
 */
export function radarGeometry(scores, categories, { size = 260, r = 88, labelR = 112 } = {}) {
  const cats = categories ?? [];
  const cx = size / 2, cy = size / 2;
  const step = cats.length ? (2 * Math.PI) / cats.length : 1;

  const pt = (i, v) => ({
    x: +(cx + (v / 100) * r * Math.cos(i * step - Math.PI / 2)).toFixed(2),
    y: +(cy + (v / 100) * r * Math.sin(i * step - Math.PI / 2)).toFixed(2),
  });
  const scoreOf = (c) => scores?.[c.id] ?? 0;
  const ringPoints = (level) => cats.map((_, i) => { const p = pt(i, level); return `${p.x},${p.y}`; }).join(" ");

  return {
    size, cx, cy,
    rings: [20, 40, 60, 80, 100].map((level) => ({ level, points: ringPoints(level) })),
    spokes: cats.map((_, i) => ({ ...pt(i, 100) })),
    polygon: cats.map((c, i) => { const p = pt(i, scoreOf(c)); return `${p.x},${p.y}`; }).join(" "),
    dots: cats.map((c, i) => ({ ...pt(i, scoreOf(c)) })),
    labels: cats.map((c, i) => {
      const p = pt(i, labelR);
      // Anchor outward so long labels clear the polygon instead of sitting on it.
      const anchor = p.x > cx + 4 ? "start" : p.x < cx - 4 ? "end" : "middle";
      return { ...p, anchor, icon: c.icon ?? "", text: String(c.label ?? "").split(" ")[0] };
    }),
  };
}
