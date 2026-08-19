import { lazy, type ComponentType, type LazyExoticComponent } from "react";

// ==========================================================================
// lazyWithRetry — a dynamic import that cannot hang the app forever
// --------------------------------------------------------------------------
// React.lazy has one failure mode that is catastrophic in production and
// invisible in development: if the dynamic import's promise never settles,
// <Suspense> shows its fallback FOREVER. On EDVIA that fallback is the
// robot, which is exactly the "stuck on the loading robot" symptom — the
// robot is not broken, it is the only thing left rendering.
//
// Three things can stall a chunk fetch on a real deployment:
//
//   1. A deploy happened while the tab was open. index.html now points at
//      assets/Foo-NEWHASH.js; the old page still asks for Foo-OLDHASH.js,
//      which no longer exists. Vercel's SPA rewrite then answers that
//      request with index.html — HTML with a text/html content type — and
//      the browser rejects it as a module. (This is why the rewrite in
//      vercel.json deliberately excludes /assets/: a missing chunk must 404
//      honestly rather than be served an HTML page pretending to be JS.)
//   2. A flaky mobile connection drops the request mid-flight.
//   3. A proxy or captive portal intercepts it.
//
// So: retry with backoff, and if it still fails, REJECT rather than hang.
// A rejected lazy import propagates to the nearest error boundary, which
// can show a real message and a reload button. A hung one cannot.
// ==========================================================================

/** A chunk request that takes longer than this is treated as failed. */
const CHUNK_TIMEOUT_MS = 20_000;
const RETRY_DELAYS_MS = [400, 1500];

export class ChunkLoadError extends Error {
  constructor(cause?: unknown) {
    super(
      "A part of EDVIA couldn't be downloaded. This usually means the app was updated while this tab was open, or the connection dropped."
    );
    this.name = "ChunkLoadError";
    this.cause = cause;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`chunk request stalled after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * Drop-in replacement for React.lazy.
 *
 * `name` is only used for the console line — the point of it is that a
 * report of "it just spins" can be answered by looking at which chunk
 * failed rather than by guessing.
 */
export function lazyWithRetry<T extends ComponentType<object>>(
  name: string,
  factory: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
      }
      try {
        return await withTimeout(factory(), CHUNK_TIMEOUT_MS);
      } catch (err) {
        lastError = err;
        console.error(`[EDVIA] failed to load the "${name}" screen (attempt ${attempt + 1})`, err);
      }
    }
    // Rejecting is the whole point: it converts an infinite spinner into an
    // error boundary with a reload button.
    throw new ChunkLoadError(lastError);
  });
}
