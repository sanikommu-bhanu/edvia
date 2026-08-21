/**
 * Shown while a lazily-loaded route chunk downloads, and while auth is still
 * resolving on first paint.
 *
 * Deliberately empty of branding: no logo, no mascot, no spinner. On a fast
 * connection this frame is gone before the eye registers it, and anything
 * drawn here only flashes. It still carries the live-region markup so screen
 * readers announce that something is loading.
 */
export function RouteFallback() {
  return (
    <div className="min-h-screen bg-background" role="status" aria-busy="true">
      <span className="sr-only">Loading</span>
    </div>
  );
}
