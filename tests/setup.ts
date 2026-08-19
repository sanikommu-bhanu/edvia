// ==========================================================================
// Global test setup
// --------------------------------------------------------------------------
// Replaces the Firebase Admin module with the in-memory double for every
// test file. Done here rather than per-file so no test can accidentally run
// against a real project if credentials happen to be present in the
// environment.
// ==========================================================================
import { vi } from "vitest";
import { fakeDb } from "./support/fakeFirestore";

vi.mock("../api/_lib/firebaseAdmin", async () => {
  const actual = await vi.importActual<typeof import("../api/_lib/firebaseAdmin")>(
    "../api/_lib/firebaseAdmin"
  );
  return {
    ...actual,
    adminDb: () => fakeDb,
    verifyIdToken: vi.fn(),
  };
});
