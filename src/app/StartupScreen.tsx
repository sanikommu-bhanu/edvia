import { AlertTriangle, RefreshCw, Settings2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

// ==========================================================================
// StartupScreen — the only two things the app may show before it is ready
// --------------------------------------------------------------------------
// Everything about EDVIA's startup is designed around one rule: the app must
// never end a page load still spinning. There are exactly two legitimate
// pre-ready states and both are here, so there is one place to look when the
// production URL shows something other than the product.
//
// The error variant deliberately does NOT print a stack trace or an
// environment variable value. It prints a plain sentence, a retry, and — in
// development only — the technical detail underneath, because the person who
// can act on "Missing VITE_FIREBASE_API_KEY" is the developer, and the
// person reading it in production is a parent who cannot.
// ==========================================================================

export type StartupFailure =
  /** No Firebase project keys in the build at all — a deployment mistake. */
  | "unconfigured"
  /** Firebase is configured but the SDK threw while starting. */
  | "init-failed"
  /** Auth state never resolved within the watchdog window. */
  | "timeout"
  /** A screen's JavaScript chunk could not be downloaded. */
  | "chunk";

const COPY: Record<StartupFailure, { title: string; body: string; offline?: boolean }> = {
  unconfigured: {
    title: "EDVIA isn't connected to its school services",
    body: "This deployment is missing its Firebase configuration, so sign-in and school data are unavailable. Your school's administrator needs to finish setting it up — nothing is wrong with your device.",
  },
  "init-failed": {
    title: "EDVIA couldn't connect to its school services",
    body: "We reached the app but couldn't start the connection to your school's account service. This is usually temporary.",
  },
  timeout: {
    title: "EDVIA is taking too long to start",
    body: "We couldn't confirm whether you're signed in. That's usually a slow or blocked connection — a privacy extension or a school firewall can do it too.",
    offline: true,
  },
  chunk: {
    title: "Part of EDVIA couldn't be downloaded",
    body: "The app was probably updated while this tab was open. Reloading picks up the new version.",
  },
};

export function StartupError({
  failure,
  detail,
  onRetry,
}: {
  failure: StartupFailure;
  /** Technical text. Rendered only outside production. */
  detail?: string;
  onRetry: () => void;
}) {
  const { title, body, offline } = COPY[failure];
  const Icon = offline ? WifiOff : AlertTriangle;
  const showDetail = import.meta.env.DEV && detail;

  return (
    <div className="screen">
      <div className="aurora" aria-hidden="true" />
      <div className="aurora-content screen-body items-center justify-center py-8">
        <div className="screen-column flex flex-col items-center text-center" role="alert">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
            <Icon size={26} />
          </span>
          <h1 className="mt-4 font-display text-title font-bold text-slate-900">{title}</h1>
          <p className="mt-2 max-w-[320px] text-small leading-relaxed text-muted-foreground">{body}</p>

          <Button size="lg" className="mt-6 w-full max-w-[320px]" onClick={onRetry}>
            <RefreshCw size={17} className="mr-2" /> Try again
          </Button>

          {showDetail && (
            <details className="mt-5 w-full max-w-[320px] rounded-xl border border-border bg-surface/70 px-3.5 py-3 text-left">
              <summary className="flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-slate-700">
                <Settings2 size={13} /> Check configuration
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-muted-foreground">
                {detail}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
