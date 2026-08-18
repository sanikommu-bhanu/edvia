import type { Role } from "@/types";

export interface RoleMeta {
  role: Role;
  title: string;
  description: string;
}

export const ROLE_OPTIONS: RoleMeta[] = [
  { role: "student", title: "Student", description: "Access your classes, assignments and more." },
  { role: "parent", title: "Parent", description: "Track your child's progress." },
  { role: "teacher", title: "Teacher", description: "Manage your classes and students." },
  { role: "principal", title: "Principal / Admin", description: "School overview and analytics." },
];

const PENDING_ROLE_KEY = "edvia.pendingRole";

/**
 * The role picked on the role-selection screen, held only until the account
 * is created. This is a UI hint, never an authorization input: signUp writes
 * the role once, firestore.rules forbids ever changing it afterwards, and
 * every server-side check reads the role from the profile document, not from
 * anything the browser kept.
 */
export function readPendingRole(): Role {
  const stored = sessionStorage.getItem(PENDING_ROLE_KEY);
  return ROLE_OPTIONS.some((o) => o.role === stored) ? (stored as Role) : "student";
}

export function writePendingRole(role: Role): void {
  sessionStorage.setItem(PENDING_ROLE_KEY, role);
}
