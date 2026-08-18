// ==========================================================================
// MemoryService — compact structured conversation memory
// --------------------------------------------------------------------------
// Two layers, deliberately:
//
//   1. A bounded window of recent messages (config.maxHistoryMessages), so
//      the model can resolve ordinary discourse ("what about last month?").
//   2. A small STRUCTURED record — currentStudentId, currentStudentName,
//      lastIntent, recentEntities — that survives beyond that window and,
//      critically, is machine-readable. The tool layer reads
//      currentStudentId directly (via ctx.conversationStudentId) so "what
//      about his absences?" resolves to a concrete student id without the
//      model having to re-state it, and without EDVIA asking a parent which
//      child they mean for the third time.
//
// Why not just send the whole transcript: cost, latency, and the fact that
// a long transcript is a large untrusted surface for injected text. A
// compact record is cheaper, faster and smaller to defend.
//
// Authorization note: nothing stored here grants access. currentStudentId
// is always re-intersected with the caller's real linkedStudentIds at tool
// time (see readTools.resolveSubjectStudent), so a poisoned or stale memory
// record can only ever narrow a result, never widen one.
// ==========================================================================
import { adminDb, ForbiddenError } from "./firebaseAdmin";
import type { ConversationMemory, Role, LanguageCode, AIIntent } from "../../src/types";

const COLLECTION = "conversationMemory";
const MESSAGES = "messages";

export async function getMemory(conversationId: string): Promise<ConversationMemory | null> {
  const snap = await adminDb().collection(COLLECTION).doc(conversationId).get();
  return snap.exists ? (snap.data() as ConversationMemory) : null;
}

/**
 * Ownership-checked variant of getMemory. conversationId is client-supplied
 * and doubles as the Firestore document id, so nothing stops a caller from
 * passing someone else's conversationId. Every read/write path that keys off
 * conversationId MUST go through this (or an equivalent explicit check)
 * instead of getMemory() directly, or it reopens a cross-user hijack:
 * memory — including currentStudentId — would leak into another user's
 * conversation, and clearMemory could wipe a stranger's history.
 *
 * Returns null when no memory exists yet (the caller should init one).
 * Throws ForbiddenError when memory exists but belongs to someone else —
 * callers must NOT "start fresh" under the same id, which would overwrite
 * the real owner's document and trade a disclosure bug for a data-loss one.
 */
export async function getOwnedMemory(conversationId: string, uid: string): Promise<ConversationMemory | null> {
  const memory = await getMemory(conversationId);
  if (!memory) return null;
  if (memory.userId !== uid) {
    throw new ForbiddenError("This conversation does not belong to you.");
  }
  return memory;
}

export async function initMemory(
  conversationId: string,
  userId: string,
  role: Role,
  language: LanguageCode
): Promise<ConversationMemory> {
  const now = new Date().toISOString();
  const memory: ConversationMemory = {
    conversationId,
    userId,
    role,
    language,
    createdAt: now,
    updatedAt: now,
    turnCount: 0,
  };
  await adminDb().collection(COLLECTION).doc(conversationId).set(memory);
  return memory;
}

export type MemoryPatch = Partial<
  Pick<
    ConversationMemory,
    | "currentTopic"
    | "currentStudentId"
    | "currentStudentName"
    | "recentEntities"
    | "lastIntent"
    | "language"
    | "pendingConfirmation"
    | "turnCount"
  >
>;

export async function updateMemory(conversationId: string, patch: MemoryPatch): Promise<void> {
  // Firestore rejects undefined values; strip them so a partial patch never
  // fails the whole turn.
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  await adminDb()
    .collection(COLLECTION)
    .doc(conversationId)
    .set({ ...clean, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function clearMemory(conversationId: string): Promise<void> {
  const docRef = adminDb().collection(COLLECTION).doc(conversationId);
  // Delete the message subcollection first — deleting a parent document in
  // Firestore does NOT remove its subcollections, so doing this in the other
  // order would orphan the transcript while making the memory look cleared.
  const msgs = await docRef.collection(MESSAGES).get();
  await Promise.all(msgs.docs.map((d) => d.ref.delete()));
  await docRef.delete();
}

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  /** Monotonic within a conversation — ordering key, since two messages can
   *  share an ISO millisecond and would otherwise sort non-deterministically. */
  seq: number;
  toolUsed?: string | null;
}

export async function appendMessage(
  conversationId: string,
  message: Omit<StoredMessage, "seq">,
  seq: number
): Promise<void> {
  await adminDb()
    .collection(COLLECTION)
    .doc(conversationId)
    .collection(MESSAGES)
    .add({ ...message, seq });
}

export async function recentMessages(conversationId: string, limit: number): Promise<StoredMessage[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .doc(conversationId)
    .collection(MESSAGES)
    .orderBy("seq", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as StoredMessage).reverse();
}

/**
 * Folds the outcome of a turn back into the structured record. Called once
 * per turn, after tools have run, so the NEXT turn can resolve pronouns.
 */
export function deriveMemoryPatch(
  previous: ConversationMemory,
  outcome: {
    intent: AIIntent | null;
    studentId?: string;
    studentName?: string;
    language: LanguageCode;
    entities?: Record<string, string>;
  }
): MemoryPatch {
  return {
    currentTopic: outcome.intent ?? previous.currentTopic,
    lastIntent: outcome.intent ?? previous.lastIntent,
    currentStudentId: outcome.studentId ?? previous.currentStudentId,
    currentStudentName: outcome.studentName ?? previous.currentStudentName,
    language: outcome.language,
    recentEntities: { ...(previous.recentEntities ?? {}), ...(outcome.entities ?? {}) },
    turnCount: (previous.turnCount ?? 0) + 1,
  };
}
