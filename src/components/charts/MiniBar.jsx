export default function MiniBar({ score, color }) {
  return (
    <div style={{ height: 4, background: "#f3f4f6", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${score}%`, background: color, borderRadius: 2, transition: "width 1s ease" }}/>
    </div>
  );
}
