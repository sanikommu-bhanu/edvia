// ==========================================================================
// /api/school/actions?action=…  — the one school-operations function
// --------------------------------------------------------------------------
// Vercel's Hobby plan caps a project at 12 Serverless Functions. The support
// and grades routes (support/create, support/inbox, support/update-status,
// grades/record) would have taken the count to 14. So they live behind ONE
// function that dispatches on ?action=, and vercel.json rewrites the four
// public paths onto it.
//
// This is the same shape api/onboarding/actions.ts already uses, for the same
// reason — see the note at the top of that file. Two consequences worth
// stating:
//
//   * The PUBLIC URLs are unchanged. src/services/support/support.service.ts
//     still calls /api/support/inbox; src/services/grades.service.ts still
//     posts to /api/grades/record. Nothing on the client knows this file
//     exists.
//   * The selector is a QUERY parameter, not a body field, so it cannot
//     collide with a payload key — and it survives a GET, which the inbox
//     route needs. Vercel merges the caller's own query string with the
//     rewrite target's, so /api/support/inbox?status=pending arrives here
//     with BOTH `action` and `status` intact.
//
// Each delegated handler still owns its own authentication, validation,
// authorization, audit logging and response shape. This file is routing and
// nothing else — putting an auth check here would create a second place for
// the boundary to live, which is exactly what the architecture avoids.
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import supportCreateHandler from "../_lib/routes/supportCreate.js";
import supportInboxHandler from "../_lib/routes/supportInbox.js";
import supportUpdateStatusHandler from "../_lib/routes/supportUpdateStatus.js";
import gradesRecordHandler from "../_lib/routes/gradesRecord.js";

const ROUTES = {
  supportCreate: supportCreateHandler,
  supportInbox: supportInboxHandler,
  supportUpdateStatus: supportUpdateStatusHandler,
  gradesRecord: gradesRecordHandler,
} as const;

type ActionName = keyof typeof ROUTES;

function isActionName(value: string): value is ActionName {
  return Object.prototype.hasOwnProperty.call(ROUTES, value);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;

  if (!action || !isActionName(action)) {
    // Reachable only by hand — the four rewrites in vercel.json always set a
    // valid action — so this says what is wrong rather than 404ing silently.
    res.status(400).json({ error: "Unknown school action." });
    return;
  }

  await ROUTES[action](req, res);
}
