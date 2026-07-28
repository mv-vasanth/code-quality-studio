import { Component } from "react";

/**
 * Catches render/runtime errors in the tab area so a single bad view
 * (e.g. a malformed result) doesn't blank the whole app. Reset by changing
 * `resetKey` (the studio passes the active tab + results view).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface in the console for local debugging; no external reporting.
    console.error("Studio view crashed:", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #fecaca", padding: "2rem", textAlign: "center", color: "#7f1d1d" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>This view hit an error</div>
        <div style={{ fontSize: 12.5, color: "#b91c1c", marginBottom: 14, maxWidth: 480, margin: "0 auto 14px" }}>
          {String(this.state.error?.message || this.state.error)}
        </div>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          style={{ padding: "7px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}
        >
          Try again
        </button>
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 10 }}>
          Or switch tabs / results view. Details are in the browser console.
        </div>
      </div>
    );
  }
}
