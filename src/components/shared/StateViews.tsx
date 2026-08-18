import type { LucideIcon } from "lucide-react";
import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

// ==========================================================================
// The three states every data-backed screen needs
// --------------------------------------------------------------------------
// Loading, error and empty are shared components rather than ad-hoc markup
// per page, so a Firestore outage looks the same everywhere and no screen
// can accidentally render "0%" while it is actually still loading — which
// is the failure that makes a dashboard actively misleading rather than
// merely unhelpful.
// ==========================================================================

/** Shimmer placeholder shaped like the content that's coming. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} aria-hidden />;
}

export function LoadingState({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-2.5" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorState({
  title = "We couldn't load this",
  body = "We couldn't retrieve the latest school data. Please try again.",
  onRetry,
  offline = false,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
  offline?: boolean;
}) {
  const Icon = offline ? WifiOff : AlertTriangle;
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-danger/20 bg-danger/5 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <Icon size={22} />
      </span>
      <p className="mt-3 font-semibold text-slate-800">{title}</p>
      <p className="mt-1 max-w-[280px] text-sm text-muted-foreground">{body}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-slate-700 hover:border-edvia-300"
        >
          <RefreshCw size={13} /> Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon size={24} />
      </span>
      <p className="mt-4 font-semibold text-slate-800">{title}</p>
      <p className="mt-1 max-w-[260px] text-sm text-muted-foreground">{body}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 rounded-full bg-edvia-500 px-4 py-2 text-xs font-semibold text-white hover:bg-edvia-600"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/**
 * Renders the right state for an async resource. Pages pass the result of
 * useAsyncData and their own success renderer, so no page has to remember
 * the ordering rule (loading → error → empty → content).
 */
export function AsyncSection<T>({
  loading,
  error,
  data,
  onRetry,
  empty,
  loadingRows = 3,
  children,
}: {
  loading: boolean;
  error: string | null;
  data: T | null;
  onRetry?: () => void;
  /** Shown when the request succeeded but returned nothing. */
  empty?: React.ReactNode;
  loadingRows?: number;
  children: (data: T) => React.ReactNode;
}) {
  if (loading) return <LoadingState rows={loadingRows} />;
  if (error) return <ErrorState body={error} onRetry={onRetry} />;
  if (data === null) return <ErrorState onRetry={onRetry} />;
  if (empty && Array.isArray(data) && data.length === 0) return <>{empty}</>;
  return <>{children(data)}</>;
}
