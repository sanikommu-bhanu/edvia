// ==========================================================================
// POST /api/onboarding/actions?action=…  — the one onboarding function
// --------------------------------------------------------------------------
// Vercel's Hobby plan caps a project at 12 Serverless Functions, and the five
// onboarding routes (school/create, classes/create, invites/create,
// invites/manage, invites/redeem) would have taken the count to 15. So they
// live behind ONE function that dispatches on ?action=, and vercel.json
// rewrites the five public paths onto it. The public URLs are unchanged —
// src/services/school/schoolAdmin.service.ts still posts to /api/school/create.
//
// The selector is a QUERY parameter, not a body field, on purpose:
// /api/invites/manage already defines its own body `action` ("revoke"), and a
// dispatcher reading the same key out of the same object would have to guess
// which layer a value belonged to.
//
// Two shapes meet here. createSchool/createClass are pure: identity + parsed
// input in, ActionResult out (see ./_lib/onboarding/result.ts), so this file
// is the only place that turns their result into HTTP. The invite handlers
// still own their own response — they stream, set Retry-After, and shape
// per-branch errors — so they are delegated to whole rather than unwrapped.
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { z } from "zod";
import { AuthError } from "../_lib/firebaseAdmin.js";
import { resolveIdentity, type Identity } from "../_lib/identity.js";
import { ActionError, type ActionResult } from "../_lib/onboarding/result.js";
import { createSchool, createSchoolSchema } from "../_lib/onboarding/createSchool.js";
import { createClass, createClassSchema } from "../_lib/onboarding/createClass.js";
import createInviteHandler from "../_lib/onboarding/createInvite.js";
import manageInvitesHandler from "../_lib/onboarding/manageInvites.js";
import redeemHandler from "../_lib/onboarding/redeem.js";

/**
 * Wraps a pure onboarding action as a request handler.
 *
 * Exported per-action (below) so the tests can drive one action directly
 * without going through the query-string dispatch — the dispatch is routing,
 * and routing is not what those tests are about.
 */
function actionHandler<S extends z.ZodTypeAny>(
  schema: S,
  run: (identity: Identity, input: z.infer<S>) => Promise<ActionResult>
) {
  return async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    let identity: Identity;
    try {
      identity = await resolveIdentity(req.headers.authorization as string | undefined);
    } catch (err) {
      res.status(401).json({ error: err instanceof AuthError ? err.message : "Unauthorized" });
      return;
    }

    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      // The first issue only. A form that reports every field at once trains
      // people to skim, and the client re-validates anyway.
      const issue = parsed.error.issues[0];
      res.status(400).json({ error: issue?.message ?? "Check the details and try again." });
      return;
    }

    try {
      const result = await run(identity, parsed.data);
      res.status(result.status).json(result.body);
    } catch (err) {
      if (err instanceof ActionError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error("onboarding action failed", err);
      res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  };
}

export const createSchoolHandler = actionHandler(createSchoolSchema, createSchool);
export const createClassHandler = actionHandler(createClassSchema, createClass);

const ROUTES = {
  createSchool: createSchoolHandler,
  createClass: createClassHandler,
  createInvite: createInviteHandler,
  manageInvites: manageInvitesHandler,
  redeemInvite: redeemHandler,
} as const;

type ActionName = keyof typeof ROUTES;

function isActionName(value: string): value is ActionName {
  return Object.prototype.hasOwnProperty.call(ROUTES, value);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;

  if (!action || !isActionName(action)) {
    // Reachable only by hand — the five rewrites in vercel.json always set a
    // valid action — so this says what is wrong rather than 404ing silently.
    res.status(400).json({ error: "Unknown onboarding action." });
    return;
  }

  await ROUTES[action](req, res);
}
