import { grade } from "../../shared/grade.js";

export default function ScoreRing({ score, size = 80 }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const g = grade(score);
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth="7"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={g.color} strokeWidth="7"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dashoffset 1.2s ease" }}/>
      <text x={size/2} y={size/2 - 5} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: size * 0.24, fontWeight: 800, fill: g.color, fontFamily: "system-ui" }}>{score}</text>
      <text x={size/2} y={size/2 + 13} textAnchor="middle"
        style={{ fontSize: size * 0.13, fill: "#888", fontFamily: "system-ui" }}>{g.g}</text>
    </svg>
  );
}
