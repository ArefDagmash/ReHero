import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: "monospace", fontSize: 14, maxWidth: 700, margin: "0 auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          <h1 style={{ color: "red", fontSize: 18 }}>App Crashed</h1>
          <p><strong>{this.state.error.name}</strong>: {this.state.error.message}</p>
          <details>
            <summary style={{ cursor: "pointer", opacity: 0.6 }}>Stack trace</summary>
            <pre style={{ fontSize: 12, opacity: 0.5, marginTop: 8 }}>{this.state.error.stack}</pre>
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: "4px 12px", cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
