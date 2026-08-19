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
}

export interface ClassRecord {
  id: string;
  className: string; // e.g. "Class 10 - A"
  schoolId: string;
  teacherId?: string;
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
  score?: { obtained: number; total: number };
  classId: string;
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
}

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
