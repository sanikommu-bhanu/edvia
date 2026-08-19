import { useEffect, useState } from "react";

// ==========================================================================
// useSlowRequestHint
// --------------------------------------------------------------------------
// Returns true once a request has been running longer than people are
// willing to wait in silence.
//
// Sign-in is a small number of network round trips, and on a good connection
// it is over before this ever fires. On a bad one it used to be a spinner
// with no end in sight, and the reliable user response to that is to tap the
// button again — which on signup means a second createUser call and an
// "email already in use" error on an account that was in fact created.
//
// So the delay is not cosmetic: saying "still working" is what stops the
// retry. 6s is past the point where a spinner alone stops reading as
// progress, and well short of the 15s timeout in auth.service.ts, so the
// hint always appears before the failure it is preparing the user for.
// ==========================================================================

const SLOW_AFTER_MS = 6000;

export function useSlowRequestHint(active: boolean, delayMs = SLOW_AFTER_MS): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return slow;
}
