import { Component, type ErrorInfo, type ReactNode } from "react";
import { ChunkLoadError } from "@/app/lazyWithRetry";
import { StartupError } from "@/app/StartupScreen";

// ==========================================================================
// AppErrorBoundary — the difference between a message and a white screen
// --------------------------------------------------------------------------
// Before this existed, ANY render-time exception anywhere in EDVIA unmounted
// the whole React tree and left an empty <div id="root">. In development
// that is loud (overlay, console, HMR); in production it is a blank page
// with no explanation and nothing to press.
//
// It also catches the rejection thrown by lazyWithRetry, which is what turns
// "the robot spins forever because a chunk 404'd" into a real screen with a
// reload button.
//
// Deliberately NOT a hook: React still provides no hook-based equivalent of
// componentDidCatch, and a library that provides one is not worth a
// dependency for thirty lines.
// ==========================================================================

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The component stack is the single most useful fact about a render
    // crash and React does not put it in the error itself.
    console.error("[EDVIA] render error", error, info.componentStack);
  }

  private reset = () => {
    // A chunk failure is fixed by fetching a fresh index.html — clearing
    // state alone would just re-request the same missing asset. Everything
    // else is worth retrying in place first, so a transient render error
    // doesn't cost the user their scroll position and form state.
    if (this.state.error instanceof ChunkLoadError) {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <StartupError
        failure={error instanceof ChunkLoadError ? "chunk" : "init-failed"}
        detail={error.stack ?? error.message}
        onRetry={this.reset}
      />
    );
  }
}
