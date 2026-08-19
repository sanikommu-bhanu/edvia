import { EdviaRobot } from "@/components/shared/EdviaRobot";

/**
 * Shown while a lazily-loaded route chunk downloads.
 *
 * Deliberately the EDVIA robot rather than a bare spinner: on a slow
 * connection this is the first thing a user sees after tapping, and it
 * should look like the product loading, not like the page failing.
 */
export function RouteFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3" role="status" aria-busy="true">
      <EdviaRobot size={72} state="thinking" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
