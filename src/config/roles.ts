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
