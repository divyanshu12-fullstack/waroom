import React from "react";
import ReactDOM from "react-dom/client";
import { SpacetimeDBProvider } from "spacetimedb/react";
import App from "./App";
import { hasLiveBindings } from "./hooks/useWarroomData";
import { DbConnection } from "./module_bindings/index.ts";
import "./styles.css";

const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Dashboard runtime error", error, errorInfo);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div style={{ minHeight: "100vh", padding: "2rem", color: "#f8fafc", background: "#020617", fontFamily: "JetBrains Mono, monospace" }}>
        <h1 style={{ marginTop: 0 }}>WARROOM crashed</h1>
        <p>Refresh the page after checking browser console logs.</p>
        <pre style={{ whiteSpace: "pre-wrap", color: "#fca5a5" }}>{String(this.state.error || "Unknown error")}</pre>
      </div>
    );
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));

const canUseLiveConnection =
  !DEV_MODE &&
  hasLiveBindings &&
  DbConnection &&
  typeof DbConnection.builder === "function";

if (!canUseLiveConnection) {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App forceDemo />
      </ErrorBoundary>
    </React.StrictMode>,
  );
} else {
  const stdbUri = import.meta.env.VITE_STDB_URI || "ws://localhost:3000";
  const stdbDbName = import.meta.env.VITE_STDB_DB_NAME || "warroom";

  const connectionBuilder = DbConnection.builder()
    .withUri(stdbUri)
    .withDatabaseName(stdbDbName)
    .withLightMode(true)
    .onDisconnect(() => console.log("Spacetime disconnected"))
    .onConnectError(() => console.log("Spacetime connection error"))
    .onConnect((conn) => {
      conn.subscriptionBuilder().onApplied(() => console.log("Subscriptions ready")).subscribeToAllTables();
    });

  root.render(
    <React.StrictMode>
      <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </SpacetimeDBProvider>
    </React.StrictMode>,
  );
}
