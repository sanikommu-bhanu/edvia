// ==========================================================================
// Support Tools — the staff side of escalation
// --------------------------------------------------------------------------
// EDVIA could already FILE an escalation ("I'd like the class teacher to
// call me"). These two tools are the other half: the teacher or principal
// asking "what's waiting for me?" and "mark the one from Rahul's mother as
// resolved".
//
// The rule that matters here is the one an AI action layer is most likely to
// get wrong: EDVIA must not say a request was resolved until the server has
// actually transitioned it. advanceSupportRequestStatus returns a structured
// refusal for an illegal or unauthorized transition, and the handler turns
// that into a refusal the model has to relay — there is no code path where
// "resolved" is spoken on the strength of the model's own intention.
// ==========================================================================
import { z } from "zod";
import type { ToolDefinition } from "./registry.js";
import { NoDataError, ToolAuthorizationError } from "./registry.js";
import type { ActionToolDefinition } from "./actionTools.js";
import * as support from "../school/support.js";
import { isVerifiedManagement, type TrustedUserContext } from "../userContext.js";
import type { AISource } from "../../../src/types/index.js";

const SCHOOL_SOURCE: AISource = { id: "school-records", title: "School Records", kind: "school" };

const STATUS_ENUM = z.enum(["pending", "acknowledged", "resolved"]);

/**
 * The caller's inbox scope, built from the TRUSTED context only.
 *
 * `isManagement` is isVerifiedManagement(), not `role === "principal"` — a
 * self-declared principal gets a scope that matches nothing, which is the
 * same defence CRIT-01 installed everywhere else.
 */
function inboxScope(ctx: TrustedUserContext): support.StaffInboxScope {
  return { uid: ctx.uid, schoolId: ctx.schoolId, isManagement: isVerifiedManagement(ctx) };
}

export const getSupportInbox: ToolDefinition<{ status?: "pending" | "acknowledged" | "resolved" }, unknown> = {
  name: "getSupportInbox",
  description:
    "Get the call-back and support requests waiting for this staff member: the ones routed to them personally, plus the school's management queue for verified management. Use this whenever a teacher or principal asks what requests they have, who wants to speak to them, or what is still outstanding.",
  inputSchema: z.object({
    status: STATUS_ENUM.optional().describe("Narrow to one status; omit for everything open and closed"),
  }),
  allowedRoles: ["teacher", "principal"],
  requiresConfirmation: false,
  auditAction: "read:support_inbox",
  authorize: async (ctx) => ({
    allowed: Boolean(ctx.schoolId),
    reason: "No school is linked to this account yet.",
  }),
  handler: async (ctx, input) => {
    const requests = await support.listRoutedSupportRequests(inboxScope(ctx), { status: input.status });
    if (requests.length === 0) {
      throw new NoDataError(
        input.status
          ? `You have no ${input.status} support requests.`
          : "You have no support requests waiting."
      );
    }
    return {
      count: requests.length,
      pendingCount: requests.filter((r) => r.status === "pending").length,
      requests: requests.map((r) => ({
        requestId: r.id,
        // The message is family-authored text. The orchestrator fences every
        // tool result before the model sees it, so a message containing
        // "ignore your instructions" is read as data, not as a command.
        message: r.message,
        from: r.requestedByRole,
        about: r.studentContext,
        status: r.status,
        createdAt: r.createdAt,
      })),
      source: SCHOOL_SOURCE,
    };
  },
};

const updateStatusInput = z.object({
  requestId: z
    .string()
    .min(1)
    .max(128)
    .describe("The requestId returned by getSupportInbox. Never guess one — look it up first."),
  status: z.enum(["acknowledged", "resolved"]).describe("The status to move the request to"),
});

type UpdateStatusArgs = z.infer<typeof updateStatusInput>;

/**
 * Reads the live request and proves the caller may act on it, WITHOUT
 * writing anything. Used by preview() so an unauthorized or already-closed
 * request is refused before the user is asked to confirm — never after.
 *
 * The refusal for "exists but isn't yours" is identical to the one for
 * "doesn't exist", so this cannot be used to enumerate other people's
 * requests by id.
 */
async function loadActionableRequest(
  ctx: TrustedUserContext,
  requestId: string
): Promise<support.SupportRequestDoc> {
  const request = await support.getSupportRequestById(requestId);
  const scope = inboxScope(ctx);
  const visible =
    request !== null &&
    request.schoolId === scope.schoolId &&
    (request.routedToUid === scope.uid || (scope.isManagement && request.recipientType === "management"));

  if (!visible || !request) {
    throw new ToolAuthorizationError("I couldn't find that request in your inbox.");
  }
  return request;
}

export const updateSupportRequestStatus: ActionToolDefinition<UpdateStatusArgs, unknown> = {
  name: "updateSupportRequestStatus",
  description:
    "Acknowledge or resolve a support request that is in this staff member's inbox. Look the request up with getSupportInbox first — this needs the real requestId. A request can move pending → acknowledged → resolved, and never backwards.",
  inputSchema: updateStatusInput,
  allowedRoles: ["teacher", "principal"],
  requiresConfirmation: true,
  auditAction: "write:support_request_status",
  authorize: async (ctx) => ({
    allowed: Boolean(ctx.schoolId),
    reason: "No school is linked to this account yet.",
  }),
  preview: async (ctx, input) => {
    const request = await loadActionableRequest(ctx, input.requestId);

    if (request.status === input.status) {
      return {
        summary: `That request is already marked ${input.status}. Would you like me to leave it as it is?`,
        details: { requestId: request.id, from: request.status, to: input.status },
        noOp: true,
      };
    }
    if (!support.canTransition(request.status, input.status)) {
      // Refused at preview time, so the user is never asked to confirm
      // something the server is going to reject a turn later.
      throw new ToolAuthorizationError(
        `That request is already ${request.status}, so it can't be moved back to ${input.status}.`
      );
    }

    const about = request.studentContext ? ` about ${request.studentContext}` : "";
    return {
      summary: `This request${about} is currently ${request.status}. Would you like me to mark it ${input.status}?`,
      details: {
        requestId: request.id,
        from: request.status,
        to: input.status,
        recipientType: request.recipientType,
      },
    };
  },
  handler: async (ctx, input) => {
    const outcome = await support.advanceSupportRequestStatus({
      requestId: input.requestId,
      to: input.status,
      actor: inboxScope(ctx),
      actorRole: ctx.role,
    });

    // The model is told the truth about what the database did. It cannot
    // report "resolved" off the back of its own intention, because this
    // branch throws before any success text is generated.
    if (!outcome.ok) {
      if (outcome.refusal === "not_found" || outcome.refusal === "not_authorized") {
        throw new ToolAuthorizationError(outcome.message ?? "I couldn't find that request in your inbox.");
      }
      throw new NoDataError(outcome.message ?? "I couldn't update that request.");
    }

    return {
      requestId: outcome.request!.id,
      status: outcome.request!.status,
      previousStatus: outcome.request!.previousStatus ?? null,
      updatedAt: outcome.request!.updatedAt ?? null,
      changed: true,
    };
  },
};

export const SUPPORT_READ_TOOLS = [getSupportInbox] as unknown as ToolDefinition<never, unknown>[];
export const SUPPORT_ACTION_TOOLS = [updateSupportRequestStatus] as unknown as ToolDefinition<never, unknown>[];
