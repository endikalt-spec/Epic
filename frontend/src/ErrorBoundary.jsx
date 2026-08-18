import { Component } from "react";

// Top-level error boundary: a render error anywhere below would otherwise blank
// the whole page (white screen) mid-flow. This shows a recoverable state instead.
// Bilingual text is hardcoded so the boundary can't itself depend on i18n loading.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface to the console (and any error-tracking SDK wired here later).
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div dir="rtl" style={styles.wrap}>
        <div style={styles.card}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>😕</div>
          <h1 style={styles.h1}>משהו השתבש / Что-то пошло не так</h1>
          <p style={styles.p}>
            אירעה שגיאה בלתי צפויה. נסו לרענן את הדף.
            <br />
            Произошла непредвиденная ошибка. Попробуйте обновить страницу.
          </p>
          <button style={styles.btn} onClick={() => window.location.reload()}>
            רענון / Обновить
          </button>
        </div>
      </div>
    );
  }
}

const styles = {
  wrap: { minHeight: "100vh", display: "grid", placeItems: "center", background: "#fdf9f1", padding: 24, fontFamily: "system-ui, sans-serif" },
  card: { maxWidth: 440, textAlign: "center", background: "#fff", borderRadius: 24, padding: 32, boxShadow: "0 10px 30px -12px rgba(27,21,16,.18)" },
  h1: { fontSize: 22, fontWeight: 800, color: "#1b1510", margin: "0 0 10px" },
  p: { color: "#5a4e42", lineHeight: 1.6, margin: "0 0 20px" },
  btn: { background: "#ff5436", color: "#fff", border: 0, borderRadius: 999, padding: "12px 28px", fontWeight: 700, fontSize: 15, cursor: "pointer" },
};
