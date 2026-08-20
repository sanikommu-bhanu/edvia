// ==========================================================================
// Types for the seed reference data.
// --------------------------------------------------------------------------
// seedData.mjs stays plain ESM because `node scripts/seedFirestore.mjs` has
// to import it at runtime without a build step. This declaration gives the
// test suite — and anything else that reads the roster — real types over it.
// ==========================================================================

export type SchoolId = string;
export type ClassId = string;

export interface StaffMember {
  id: string;
  fullName: string;
  subject: string;
  schoolId: SchoolId;
  /** Class this member is class teacher of, or null for subject-only staff. */
  classTeacherOf: ClassId | null;
}

export interface RosterStudent {
  id: string;
  fullName: string;
}

export interface RosterClass {
  classId: ClassId;
  className: string;
  section: string;
  schoolId: SchoolId;
  students: RosterStudent[];
}

export interface SeededStudent extends RosterStudent {
  rollNumber: string;
  classId: ClassId;
  className: string;
  section: string;
  schoolId: SchoolId;
  groupIndex: number;
}

export interface AttendanceProfile {
  absentRate: number;
  leaveRate: number;
}

export interface InviteCode {
  code: string;
  role: "student" | "parent" | "teacher" | "principal";
  schoolId: SchoolId;
  studentId?: string;
  classIds?: ClassId[];
}

export const GREENFIELD: SchoolId;
export const RIVERSIDE: SchoolId;

export const CLASS_10A: ClassId;
export const CLASS_10B: ClassId;
export const CLASS_9A: ClassId;
export const CLASS_9B: ClassId;
export const CLASS_8A: ClassId;
export const RIVERSIDE_CLASS: ClassId;

export const UNCLAIMED: string;
export const SCHOOL_DAYS: number;

export const STAFF: StaffMember[];
export const staffById: Record<string, StaffMember>;
export const ROSTER: RosterClass[];
export const ALL_STUDENTS: SeededStudent[];
export const ATTENDANCE_PROFILES: Record<string, AttendanceProfile>;

export function profileFor(studentId: string): AttendanceProfile;
export function seededRandom(seed: string): number;
export function buildInviteCodes(): InviteCode[];

export function localIsoDate(d: Date): string;
export function schoolDays(count: number, from?: Date): string[];
export function statusFor(
  studentId: string,
  date: string,
  todayIso: string
): "present" | "absent" | "leave";

export interface GradedExam {
  id: string;
  title: string;
  subject: string;
  classId: ClassId;
  /** Days before today the paper was sat. */
  back: number;
  maxScore: number;
}

export const GRADED_EXAMS: GradedExam[];
export const ACADEMIC_PROFILES: Record<string, number>;

export function academicCentreFor(studentId: string): number;
export function scoreFor(studentId: string, examId: string, maxScore: number): number;
