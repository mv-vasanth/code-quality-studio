import { theme } from "../../shared/theme.js";
import { elevation, bevel, fx } from "../../shared/motion.js";

/**
 * The run control: a play button.
 *
 * A row of three same-sized full-width buttons gives no clue which one you
 * normally want. One obvious play button with the mode beside it does, and it
 * costs a third of the vertical space. While it runs the glyph becomes a
 * square and a halo pulses, so "something is happening" is readable from the
 * corner of your eye without a text label changing.
 */
export default function RunButton({
  onClick,
  busy = false,
  disabled = false,
  size = 38,
  tone = theme.color.primary,
  toneRgb = "13,148,136",
  label = "Run",
  title,
}) {
  const off = disabled && !busy;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={busy ? `${label} — running` : label}
      title={title || label}
      className={`${fx.card} ${fx.press} ${busy ? fx.ring : fx.lift}`}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        border: "none",
        display: "grid",
        placeItems: "center",
        cursor: off ? "not-allowed" : busy ? "progress" : "pointer",
        color: "#fff",
        // A two-stop gradient plus the inner highlight reads as a sphere; a
        // flat fill of the same colour reads as a sticker.
        background: off
          ? "#cbd5e1"
          : `radial-gradient(120% 120% at 30% 20%, ${tone} 0%, ${theme.color.primaryHover} 100%)`,
        boxShadow: off ? elevation.flat : `${bevel}, ${elevation.tinted(toneRgb)}`,
      }}
    >
      {busy ? (
        <span style={{ width: size * 0.3, height: size * 0.3, background: "#fff", borderRadius: 2 }} />
      ) : (
        // Drawn rather than a glyph: ▶ sits off-centre in most system fonts,
        // and inside a circle that is immediately obvious.
        <svg width={size * 0.42} height={size * 0.42} viewBox="0 0 12 12" aria-hidden>
          <path d="M3 1.6 10.2 6 3 10.4Z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}
