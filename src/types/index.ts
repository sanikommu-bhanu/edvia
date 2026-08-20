// ==========================================================================
// EDVIA — Core Domain Types
// Single source of truth for shapes flowing through services & UI.
// ==========================================================================

export type Role = "student" | "parent" | "teacher" | "principal";

export type LanguageCode =
  | "en" | "hi" | "ta" | "te" | "mr" | "bn" | "gu" | "pa" | "kn" | "ml" | "ur";

export interface LanguageOption {
  code: LanguageCode;
  englishName: string;
  nativeName: string;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  phone?: string;
  role: Role;
  schoolId: string;
  photoUrl?: string;
  language: LanguageCode;
  onboardingComplete: boolean;
  createdAt: string;
  // role-specific linkage
  studentId?: string; // present when role === "student"
  linkedStudentIds?: string[]; // present when role === "parent"
  teacherId?: string; // present when role === "teacher"
  /**
   * The school this account is a VERIFIED principal of.
   *
   * `role` is only ever a REQUEST: the client picks it on the role-selection
   * screen and writes it once at signup. This field is the GRANT — it is
   * written exclusively by api/onboarding/redeem-invite.ts against a
   * single-use, school-issued principal code, and firestore.rules rejects
   * every client write to it.
   *
   * Every principal capability (school-wide analytics in the tool layer, the
   * analytics route, and isPrincipalOf() in firestore.rules) is gated on
   * this field matching schoolId — never on `role` alone. Without it,
   * declaring yourself a principal at signup grants nothing at all.
   */
  principalOfSchoolId?: string;
  /**
   * Classes this account may read content for. Set server-side during invite
   * redemption; firestore.rules reads the same field. The client treats it as
   * read-only — rules reject any client write to it.
   */
  classIds?: string[];
}

export interface School {
  id: string;
  name: string;
  location: string;
  logoUrl?: string;
  schoolType?: SchoolType;
  academicYear?: string;
}

export type SchoolType = "primary" | "secondary" | "k12" | "college" | "other";

export interface ClassRecord {
  id: string;
  className: string; // e.g. "Class 10 - A"
  section?: string;
  schoolId: string;
  teacherId?: string;
  academicYear?: string;
}

// ==========================================================================
// Join tokens
// --------------------------------------------------------------------------
// The client half of the invite model in api/_lib/invites.ts. Note what is
// NOT here: there is no client type carrying a role, a schoolId or a classId
// INTO a redemption, because the client never sends any of those. It sends a
// token; the server decides what the token means. See api/invites/redeem.ts.
// ==========================================================================
export type InviteKind = "school_teacher" | "school_admin" | "class_student" | "parent_link";

/** What /api/invites/preview reveals before anyone signs in. */
export interface InvitePreview {
  valid: true;
  kind: InviteKind;
  roleLabel: string;
  schoolName: string;
  schoolLogoUrl?: string;
  className?: string;
  /** First name only, for parent invitations. */
  childFirstName?: string;
}

/** An invitation as its issuer sees it. Never carries a live secret. */
export interface IssuedInvite {
  id: string;
  kind: InviteKind;
  label: string;
  classId: string | null;
  studentId: string | null;
  createdAt: string;
  createdBy: string;
  expiresAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  status: "active" | "revoked";
}

/**
 * The one-time response from creating an invitation.
 *
 * `secret` and `humanCode` are returned exactly once and are never
 * retrievable afterwards — Firestore holds only a hash. The UI must show
 * them immediately; losing them means issuing a fresh invitation.
 */
export interface MintedInvite {
  invite: IssuedInvite;
  secret: string;
  humanCode: string;
}

export interface StudentRecord {
  id: string;
  fullName: string;
  rollNumber: string;
  classId: string;
  className: string; // e.g. "Class 10 - A"
  section: string;
  schoolId: string;
  photoUrl?: string;
}

export interface ClassSubject {
  id: string;
  subject: string;
  teacherName: string;
  teacherId: string;
  room: string;
  schedule: string; // e.g. "08:00 AM"
  progressPercent?: number;
  iconKey: SubjectIconKey;
}

export type SubjectIconKey =
  | "math" | "physics" | "chemistry" | "english" | "biology" | "history" | "computer" | "art";

export type AssignmentStatus = "pending" | "submitted" | "overdue" | "completed";

export interface Assignment {
  id: string;
  subject: string;
  title: string;
  description: string;
  dueDate: string;
  status: AssignmentStatus;
  teacherName: string;
  priority?: "low" | "medium" | "high";
  classId: string;
}

export type ExamStatus = "upcoming" | "completed";

export interface Exam {
  id: string;
  title: string;
  subject: string;
  date: string;
  status: ExamStatus;
  daysLeft?: number;
  classId: string;
}

/**
 * One student's mark for one paper.
 *
 * A per-student document rather than a `score` field on the shared Exam,
 * because an exam belongs to a CLASS: a single score on the exam document
 * would give every student in Class 10-A the same mark. The id is
 * `${examId}_${studentId}` (gradeMath.examResultId), so re-recording a mark
 * amends it rather than double-counting the paper in every average.
 */
export interface ExamResult {
  id: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentName: string;
  classId: string;
  schoolId: string;
  subject: string;
  score: number;
  maxScore: number;
  percentage: number;
  examDate: string;
  createdAt: string;
  updatedAt: string;
  recordedBy: string;
  previousScore?: number | null;
}

export interface SubjectPerformance {
  subject: string;
  percentage: number;
  totalScore: number;
  totalMax: number;
  count: number;
}

/** What the Grades screens render — the same shape the AI tool returns. */
export interface StudentGrades {
  studentId: string;
  studentName?: string;
  overall: { percentage: number; totalScore: number; totalMax: number; count: number };
  bySubject: SubjectPerformance[];
  results: {
    examId: string;
    examTitle: string;
    subject: string;
    score: number;
    maxScore: number;
    percentage: number;
    examDate: string;
  }[];
  noRecords: boolean;
}

export type AttendanceStatus = "present" | "absent" | "leave";

export interface AttendanceRecord {
  id: string;
  date: string; // ISO date
  status: AttendanceStatus;
  studentId: string;
  classId: string;
  subject?: string;
}

export interface AttendanceSummary {
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  percentage: number;
  trend: { date: string; percentage: number }[];
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  category: "school" | "class" | "important";
  date: string;
  read: boolean;
}

export type ResourceType = "notes" | "book" | "paper" | "video" | "material";

export interface SchoolResource {
  id: string;
  title: string;
  type: ResourceType;
  subject: string;
  fileSizeKb?: number;
  uploadedAt: string;
  url: string;
  bookmarked: boolean;
}

export type NotificationKind =
  | "assignment" | "exam" | "attendance" | "notice" | "ptm" | "resource" | "teacher";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  linkTo?: string;
}

export type CalendarEventType = "exam" | "test" | "event" | "ptm" | "holiday" | "notice";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO date
  type: CalendarEventType;
  roles?: Role[]; // if omitted, visible to all
}

export type SupportRecipient = "teacher" | "management";
export type SupportStatus = "pending" | "acknowledged" | "resolved" | "cancelled";

export interface SupportRequest {
  id: string;
  recipientType: SupportRecipient;
  message: string;
  studentContext?: string | null;
  studentId?: string | null;
  /** Staff member the request was routed to, when one could be resolved. */
  routedToUid?: string | null;
  /** Human-readable destination, e.g. "the class teacher for Class 10 - A". */
  routedToLabel?: string;
  status: SupportStatus;
  createdAt: string;
  requestedBy: string;
  requestedByRole?: Role;
  schoolId?: string;
  /** Set once a staff member has moved the request along. */
  updatedAt?: string | null;
  updatedBy?: string | null;
  previousStatus?: SupportStatus | null;
}

/**
 * Legal forward-only transitions, mirrored from
 * api/_lib/school/support.ts#SUPPORT_TRANSITIONS.
 *
 * Duplicated deliberately and narrowly: the client uses it only to decide
 * which BUTTONS to render. The server re-reads the live document and
 * re-checks the same table inside a transaction, so a stale or tampered
 * client can never produce an illegal transition — it can only produce a
 * request the server refuses.
 */
export const SUPPORT_NEXT_STATUSES: Record<SupportStatus, SupportStatus[]> = {
  pending: ["acknowledged", "resolved"],
  acknowledged: ["resolved"],
  resolved: [],
  cancelled: [],
};

// ---- AI ----

/**
 * Avatar / assistant states. Each one corresponds to work that is actually
 * happening — the orchestrator emits them as it goes, so "verifying" means
 * an authorization check is genuinely in flight, not a timed animation.
 */
export type AIAgentState =
  | "idle"
  | "listening"
  | "thinking"
  | "verifying"
  | "processing"
  | "tool_execution"
  | "speaking"
  | "interrupted"
  | "connected"
  | "disconnected"
  | "success"
  | "error";

export type ChatRole = "user" | "assistant";

/**
 * Evidence attached to a factual answer. `kind` drives the human label the
 * chat UI shows under a message ("Source: Attendance Records") — it names
 * the SYSTEM OF RECORD, never an internal collection/table name.
 */
export type AISourceKind =
  | "policy"
  | "educational"
  | "resource"
  | "document"
  | "attendance"
  | "academic"
  | "school";

export interface AISource {
  id: string;
  title: string;
  kind: AISourceKind;
  section?: string;
}

export interface PendingConfirmation {
  toolName: string;
  args: Record<string, unknown>;
  /** Plain-language question shown to the user before anything is written. */
  summary: string;
  /** What would actually change, read from the live record during preview. */
  details?: Record<string, unknown>;
  /** True when running the action would change nothing. */
  noOp?: boolean;
  /**
   * ISO timestamp after which this offer is dead.
   *
   * A confirmation is single-use (cleared before the tool runs) AND
   * time-boxed. Without an expiry, an offer made at the start of a long
   * voice session could still be satisfied by a "yes" many minutes later,
   * about a record whose value has since changed — so the user would be
   * confirming a preview that is no longer true.
   */
  expiresAt?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  sources?: AISource[];
  suggestedFollowUps?: string[];
  status?: "sending" | "sent" | "error";
  toolUsed?: string;
  requiresConfirmation?: PendingConfirmation;
}

// ---- AI intents (used server-side for logging/analytics; the model itself
// resolves intent via function-calling against the tool registry below) ----
export type AIIntent =
  | "GET_STUDENT_ATTENDANCE" | "GET_CHILD_ATTENDANCE" | "GET_ATTENDANCE_DETAIL"
  | "GET_CLASS_ATTENDANCE" | "GET_SCHOOL_ATTENDANCE"
  | "GET_ASSIGNMENTS" | "GET_EXAMS" | "GET_SCHEDULE" | "GET_ANNOUNCEMENTS" | "GET_RESOURCES"
  | "GET_POLICY" | "GET_STUDENT_PROFILE" | "GET_CLASS_INFORMATION" | "GET_SCHOOL_INFORMATION"
  | "GET_ANALYTICS" | "GET_NOTIFICATIONS" | "GET_SUPPORT_REQUESTS" | "MARK_ATTENDANCE"
  | "GET_STUDENT_GRADES" | "GET_CHILD_GRADES" | "GET_CLASS_GRADES" | "GET_SCHOOL_PERFORMANCE"
  | "RECORD_EXAM_RESULT" | "GET_SUPPORT_INBOX" | "UPDATE_SUPPORT_STATUS"
  | "CREATE_TEACHER_REQUEST" | "CREATE_MANAGEMENT_REQUEST" | "SUMMARIZE_DOCUMENT"
  | "EXPLAIN_CONCEPT" | "GENERAL_SCHOOL_QUESTION" | "GENERAL_ACADEMIC_QUESTION";

export interface ConversationMemory {
  conversationId: string;
  userId: string;
  role: Role;
  language: LanguageCode;
  currentTopic?: string;
  /** Student the conversation is currently about — always re-checked against
   *  the caller's real links before it grants access to anything. */
  currentStudentId?: string;
  currentStudentName?: string;
  recentEntities?: Record<string, string>;
  lastIntent?: AIIntent;
  pendingConfirmation?: PendingConfirmation | null;
  turnCount?: number;
  updatedAt: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  role: Role;
  action: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result: "success" | "denied" | "error";
  reason?: string;
  timestamp: string;
}

// ---- Dashboards / aggregate views ----

export interface StudentDashboardData {
  classesToday: number;
  assignmentsDue: number;
  testsUpcoming: number;
  todaySchedule: ClassSubject[];
  upcoming: { title: string; date: string }[];
}

export interface TeacherDashboardData {
  classesToday: { classId: string; className: string; subject: string; time: string }[];
  totalAssignedClasses: number;
  totalStudents: number;
  pendingTasks: number;
}

export interface PrincipalDashboardData {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  overallAttendancePercent: number;
  attendanceTrend: { date: string; percentage: number }[];
  alerts: { id: string; message: string; severity: "low" | "medium" | "high" }[];
}
