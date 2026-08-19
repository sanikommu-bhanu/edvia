// ==========================================================================
// Join tokens — the mechanism the whole self-serve onboarding rests on
// --------------------------------------------------------------------------
// EDVIA's authorization model has one rule: a role is a REQUEST, a grant is
// what the server wrote. Google sign-in proves "this person owns this Google
// account" and nothing else. Everything school-shaped — being a teacher at
// Robo School, being in Class 10-A, being Rahul's parent — is a MEMBERSHIP,
// and this module is how memberships come into existence.
//
// A join token is therefore a bearer credential, and is treated like one:
//
//   * The QR/link carries a 160-bit random secret and NOTHING else. No
//     schoolId, no classId, no role, no expiry. There is nothing in the
//     payload to tamper with, which is why "change ?role=principal" is not
//     a threat model here — there is no role in the URL to change. Every
//     fact about what a token grants is read from the server's own document.
//   * Firestore stores only the SHA-256 hash of the secret, and the document
//     id IS that hash. A database dump therefore does not yield working
//     invite links, and lookup is still a single point read rather than a
//     query. (bcrypt/argon are the wrong tool: the secret is 160 bits of
//     CSPRNG output, so there is no dictionary to slow down, and a per-
//     request KDF on an unauthenticated preview route is a DoS lever.)
//   * The short human code is a SEPARATE credential with its own document,
//     because a code someone types off a noticeboard has far less entropy
//     than a scanned URL and must be revocable independently.
//
// Redemption itself lives in api/onboarding/redeem.ts, inside a transaction,
// because "check it is unused, then use it" is a race otherwise.
// ==========================================================================
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Role } from "../../src/types/index.js";

/** What a redeemed invite makes the holder. */
export type InviteKind = "school_teacher" | "school_admin" | "class_student" | "parent_link";

export interface InviteDoc {
  /** Hash of the secret. Also the document id — kept here for audit reads. */
  tokenHash: string;
  kind: InviteKind;
  /** The role the redeemer becomes. Derived from `kind`, never from input. */
  targetRole: Role;
  schoolId: string;
  /** Set for class_student and parent_link. */
  classId?: string;
  /** Set for parent_link — the child the parent is being linked to. */
  studentId?: string;
  /** Short human-typeable code, uppercase. Unique via its own index doc. */
  humanCode: string;
  createdBy: string;
  createdAt: string;
  /** ISO timestamp, or null for a standing invite (a noticeboard QR). */
  expiresAt: string | null;
  /** null means unlimited — only ever used for class/teacher invites. */
  usageLimit: number | null;
  usedCount: number;
  status: "active" | "revoked";
  /** uids that have redeemed. Bounded by usageLimit where one is set. */
  usedBy: string[];
  /** Free-text label the issuer sees in their invite list. */
  label: string;
}

/**
 * The role each invite kind confers. This mapping is the ONLY place a role
 * is attached to an invite, and it is a constant — an issuer cannot pass a
 * role, and a redeemer cannot ask for one.
 *
 * Note what is absent: there is no `school_principal` invite that a
 * principal can mint for another principal, and no path by which a
 * class/parent token yields staff access. Adding one would need a
 * deliberate edit here, which is exactly the friction it deserves.
 */
export const ROLE_FOR_KIND: Record<InviteKind, Role> = {
  school_teacher: "teacher",
  school_admin: "principal",
  class_student: "student",
  parent_link: "parent",
};

/** Alphabet without O/0/I/1 — these are read off paper and phone screens. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * 160 bits of CSPRNG output, base64url. This is what goes in the QR.
 *
 * Length is chosen so that guessing is not a strategy even against an
 * attacker who can query the unauthenticated preview endpoint at full rate
 * forever: 2^160 candidates against a rate-limited endpoint is not a search
 * space, it is a wall.
 */
export function generateInviteSecret(): string {
  return randomBytes(20).toString("base64url");
}

/**
 * A 10-character human code, grouped as XXXXX-XXXXX.
 *
 * 32^10 ≈ 2^50. That is far weaker than the QR secret, which is why the
 * redeem route rate-limits per account and why codes are revocable and
 * (for parent links) single-use. It is strong enough that a school can
 * print it on a noticeboard, which is the entire point of having it.
 */
export function generateHumanCode(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (i === 4) out += "-";
  }
  return out;
}

/** Document id for a secret. SHA-256 is right here — see the header note. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** Normalises whatever the user typed into the stored code shape. */
export function normalizeHumanCode(input: string): string {
  const stripped = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return stripped.length === 10 ? `${stripped.slice(0, 5)}-${stripped.slice(5)}` : stripped;
}

/** Constant-time comparison, for the human-code path where the id is public-ish. */
export function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type InviteRejection =
  | "not_found"
  | "revoked"
  | "expired"
  | "exhausted"
  | "already_member"
  | "wrong_school";

/**
 * Every reason an otherwise-well-formed invite must not be honoured.
 *
 * Returns a reason rather than a boolean because the redeem route audits it
 * and the preview route turns it into a sentence — and because a single
 * `isValid` boolean is how "expired" and "revoked" end up indistinguishable
 * to the person holding the phone.
 *
 * Deliberately pure and side-effect free so the transaction can call it on a
 * snapshot it has already read.
 */
export function checkInvite(invite: InviteDoc, now = new Date()): InviteRejection | null {
  if (invite.status === "revoked") return "revoked";
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= now.getTime()) return "expired";
  if (invite.usageLimit !== null && invite.usedCount >= invite.usageLimit) return "exhausted";
  return null;
}

export function rejectionMessage(reason: InviteRejection): string {
  switch (reason) {
    case "not_found":
      return "That invitation isn't recognised. Check the code, or ask your school for a fresh link.";
    case "revoked":
      return "That invitation has been withdrawn by the school. Ask them for a new one.";
    case "expired":
      return "That invitation has expired. Ask your school for a new one.";
    case "exhausted":
      return "That invitation has already been used the maximum number of times.";
    case "already_member":
      return "You're already part of this school — no need to join again.";
    case "wrong_school":
      return "That invitation belongs to a different school than your account.";
  }
}

/** How the invite is described on the join screen, before anyone signs in. */
export function describeKind(kind: InviteKind): string {
  switch (kind) {
    case "school_teacher":
      return "Teacher invitation";
    case "school_admin":
      return "School administrator invitation";
    case "class_student":
      return "Student invitation";
    case "parent_link":
      return "Parent invitation";
  }
}
