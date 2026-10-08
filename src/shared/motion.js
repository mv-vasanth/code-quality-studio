/**
 * Depth and motion tokens.
 *
 * The app is styled with inline React styles, so anything stateful — hover,
 * active, keyframes — has to come from a stylesheet. The class names below are
 * defined once in src/index.css and referenced from components; the plain
 * objects are for the static part of the same effect.
 *
 * Elevation is two shadows, not one: a tight dark shadow for the contact edge
 * and a wide soft one for the cast. A single blurred shadow reads as a blur,
 * two read as an object sitting above the page.
 */

export const elevation = {
  flat:    "0 1px 2px rgba(15,23,42,.04)",
  raised:  "0 1px 2px rgba(15,23,42,.06), 0 4px 10px -2px rgba(15,23,42,.08)",
  floating:"0 2px 4px rgba(15,23,42,.07), 0 12px 28px -6px rgba(15,23,42,.14)",
  // For coloured controls: the cast shadow picks up the control's own hue,
  // which is what stops a bright button looking pasted on.
  tinted: (rgb) => `0 1px 2px rgba(15,23,42,.10), 0 8px 20px -6px rgba(${rgb},.45)`,
};

/** A top inner highlight — the cheapest convincing "this is a raised surface". */
export const bevel = "inset 0 1px 0 rgba(255,255,255,.22)";

export const ease = {
  out:    "cubic-bezier(.16,.84,.44,1)",
  spring: "cubic-bezier(.34,1.56,.64,1)",
};

/** Class names from index.css. Kept here so components do not hardcode strings. */
export const fx = {
  lift: "cqs-lift",           // hover: rises and deepens its shadow
  press: "cqs-press",         // active: settles back down
  card: "cqs-card",           // lift + press + consistent transition
  fadeUp: "cqs-fade-up",      // entrance
  ring: "cqs-ring",           // pulsing halo, for "working"
  shimmer: "cqs-shimmer",     // indeterminate progress sweep
  spin: "cqs-spin",
  blink: "cqs-blink",         // bot eye
};
