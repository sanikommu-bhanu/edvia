import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ==========================================================================
// Google sign-in button
// --------------------------------------------------------------------------
// The mark is inlined as SVG in Google's own four brand colours rather than
// a font icon or a recoloured glyph — their branding guidelines require the
// official colours on a white surface, and a Lucide "chrome" icon would be
// both wrong and obviously wrong to anyone who has seen the real thing.
//
// There is no "success" visual state: success navigates. Showing a tick
// before the profile has actually loaded would be exactly the fake-success
// pattern this product avoids everywhere else.
// ==========================================================================

function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function GoogleButton({
  onClick,
  loading = false,
  disabled = false,
  label = "Continue with Google",
  className,
}: {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      className={cn(
        "flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface",
        "text-[15px] font-semibold text-slate-700 shadow-soft",
        "transition-all duration-200 hover:border-edvia-200 hover:shadow-card active:scale-[0.99]",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-soft",
        className
      )}
    >
      {loading ? <Loader2 size={18} className="animate-spin text-muted-foreground" /> : <GoogleMark />}
      {loading ? "Opening Google…" : label}
    </button>
  );
}

/** "OR" rule used between the Google button and the email form. */
export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
