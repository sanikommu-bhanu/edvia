// ==========================================================================
// Test harness — wires the fake Firestore under the real tool layer
// ==========================================================================
// The point of this file is that tests exercise the PRODUCTION
// authorizeAndExecuteTool path: the real Zod schemas, the real role
// allow-lists, the real authorize() predicates and the real School Service
// handlers. Only the database underneath is swapped.
//
// If a test here passes, the shipped authorization logic passed — not a
// re-implementation of it written to agree with itself.
// ==========================================================================
import { vi } from "vitest";
import { fakeDb } from "./fakeFirestore";
import { fixtureData, TODAY } from "./fixtures";

/**
 * Pins Date so period resolution ("this_month", "today") is deterministic.
 * Attendance fixtures are built relative to the same constant.
 */
export function freezeClock(): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T10:00:00.000Z`));
}

export function unfreezeClock(): void {
  vi.useRealTimers();
}

export function resetFixtures(): void {
  fakeDb.reset();
  fakeDb.load(fixtureData);
}

export { fakeDb };
