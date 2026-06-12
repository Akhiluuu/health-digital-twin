// components/ErrorBoundary.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Production-grade React Error Boundary.
//
// WHY THIS IS CRITICAL:
//   Without an ErrorBoundary, any unhandled JS exception in a component tree
//   causes a FULL app crash (white screen / process killed on Android).
//   With this boundary, the crash is caught at the boundary level, logged,
//   and a user-friendly recovery UI is shown — the rest of the app stays alive.
//
// USAGE (in _layout.tsx):
//   <ErrorBoundary>
//     <YourScreenOrNavigator />
//   </ErrorBoundary>
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";

interface Props {
  children: React.ReactNode;
  /** Optional: custom fallback UI. If not provided, the default recovery screen is shown. */
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
  tapCount: number;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: "", tapCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const info = errorInfo?.componentStack ?? "";
    this.setState({ errorInfo: info });
    // Log to console — swap this for Sentry.captureException(error) if you add Sentry later
    console.error("🔴 [ErrorBoundary] Uncaught error:", error.message);
    console.error("🔴 [ErrorBoundary] Component stack:", info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: "", tapCount: 0 });
  };

  handleTapError = () => {
    this.setState(prev => ({ tapCount: prev.tapCount + 1 }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      const showDetails = __DEV__ || this.state.tapCount >= 3;

      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <TouchableOpacity onPress={this.handleTapError} activeOpacity={1}>
              <Text style={styles.emoji}>⚠️</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.subtitle}>
              VitalHealth encountered an unexpected error. Your health data is safe.
            </Text>

            {/* Show error message — in DEV always, in prod after 3 taps on the emoji */}
            {showDetails && this.state.error && (
              <ScrollView style={styles.devBox} contentContainerStyle={{ padding: 12 }}>
                <Text style={styles.devTitle}>Error: {this.state.error.message}</Text>
                <Text style={styles.devStack}>{this.state.errorInfo}</Text>
              </ScrollView>
            )}

            <TouchableOpacity style={styles.btn} onPress={this.handleReset}>
              <Text style={styles.btnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d1117",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#161b22",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#30363d",
  },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#e6edf3",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#8b949e",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  devBox: {
    width: "100%",
    maxHeight: 200,
    backgroundColor: "#0d1117",
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#f85149",
  },
  devTitle: { color: "#f85149", fontSize: 12, fontWeight: "600", marginBottom: 8 },
  devStack: { color: "#8b949e", fontSize: 10, fontFamily: "monospace" },
  btn: {
    backgroundColor: "#238636",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});

export default ErrorBoundary;
