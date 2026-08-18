// ==========================================================================
// MemoryService — compact structured conversation memory
// --------------------------------------------------------------------------
// We deliberately do NOT send unbounded chat history to Gemini. Each turn
// sends: a short window of recent messages (see config.maxHistoryMessages)
// PLUS this compact structured memory record, so "what about last month?"
// resolves against currentStudent/currentTopic without re-sending everything.
// ==========================================================================
import { adminDb, ForbiddenError } from "./firebaseAdmin";
import type { ConversationMemory, Role, LanguageCode, AIIntent } from "../../src/types";

const COLLECTION = "conversationMemory";

export async function getMemory(conversationId: string): Promise<ConversationMemory | null> {
  const snap = await adminDb().collection(COLLECTION).doc(conversationId).get();
  return snap.exists ? (snap.data() as ConversationMemory) : null;
}

/**
 * Ownership-checked variant of getMemory. conversationId is client-supplied
 * and doubles as the Firestore document id, so nothing stops a caller from
 * passing someone else's conversationId. Every read/write path that keys off
 * conversationId MUST go through this (or an equivalent explicit check)
 * instead of getMemory() directly, or it reopens the cross-user hijack this
 * guards against (memory — including currentStudentId and other entities —
 * would otherwise leak into another user's conversation, and writes like
 * clearMemory could wipe a stranger's history).
 *
 * Returns null if no memory exists yet for this id (caller should init one).
 * Throws ForbiddenError if memory exists but belongs to a different user —
 * callers must NOT silently "start fresh" by re-initializing under the same
 * id, since that would overwrite the real owner's stored memory document.
 */
export async function getOwnedMemory(conversationId: string, uid: string): Promise<ConversationMemory | null> {
  const memory = await getMemory(conversationId);
  if (!memory) return null;
  if (memory.userId !== uid) {
    throw new ForbiddenError("This conversation does not belong to you.");
  }
  return memory;
}

export async function initMemory(conversationId: string, userId: string, role: Role, language: LanguageCode): Promise<ConversationMemory> {
  const now = new Date().toISOString();
  const memory: ConversationMemory = { conversationId, userId, role, language, createdAt: now, updatedAt: now };
  await adminDb().collection(COLLECTION).doc(conversationId).set(memory);
  return memory;
}

export async function updateMemory(
  conversationId: string,
  patch: Partial<Pick<ConversationMemory, "currentTopic" | "currentStudentId" | "recentEntities" | "lastIntent" | "pendingConfirmation">>
): Promise<void> {
  await adminDb().collection(COLLECTION).doc(conversationId).set(
    { ...patch, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

export async function clearMemory(conversationId: string): Promise<void> {
  await adminDb().collection(COLLECTION).doc(conversationId).delete();
  const msgs = await adminDb().collection(COLLECTION).doc(conversationId).collection("messages").get();
  await Promise.all(msgs.docs.map((d) => d.ref.delete()));
}

export interface StoredMessage { role: "user" | "assistant"; content: string; timestamp: string }

export async function appendMessage(conversationId: string, message: StoredMessage): Promise<void> {
  await adminDb().collection(COLLECTION).doc(conversationId).collection("messages").add(message);
}

export async function recentMessages(conversationId: string, limit: number): Promise<StoredMessage[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .doc(conversationId)
    .collection("messages")
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as StoredMessage).reverse();
}
