// ==========================================================================
// School Service — Academics (assignments, exams, schedule, notices,
// resources, notifications)
// --------------------------------------------------------------------------
// Every function takes an explicit, already-authorized scope (a classId or
// schoolId the caller has been proven to have access to). None of them
// derive scope from a model-supplied argument — that decision belongs to
// the tool layer, which knows the caller's real identity.
// ==========================================================================
import { adminDb } from "../firebaseAdmin";

export interface AssignmentDoc {
  id: string;
  subject: string;
  title: string;
  description?: string;
  dueDate: string;
  status: string;
  teacherName?: string;
  classId: string;
}

export async function getAssignments(
  classId: string,
  status?: string
): Promise<AssignmentDoc[]> {
  let query: FirebaseFirestore.Query = adminDb().collection("assignments").where("classId", "==", classId);
  if (status) query = query.where("status", "==", status);
  const snap = await query.get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<AssignmentDoc, "id">) }))
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
}

export interface ExamDoc {
  id: string;
  title: string;
  subject: string;
  date: string;
  status: string;
  classId: string;
  score?: { obtained: number; total: number };
}

export async function getExams(classId: string, status?: string): Promise<ExamDoc[]> {
  let query: FirebaseFirestore.Query = adminDb().collection("exams").where("classId", "==", classId);
  if (status) query = query.where("status", "==", status);
  const snap = await query.get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ExamDoc, "id">) }))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

export interface ClassSubjectDoc {
  id: string;
  subject: string;
  teacherName: string;
  room: string;
  schedule: string;
  classId: string;
}

export async function getSchedule(classId: string): Promise<ClassSubjectDoc[]> {
  const snap = await adminDb().collection("classSubjects").where("classId", "==", classId).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ClassSubjectDoc, "id">) }))
    .sort((a, b) => (a.schedule ?? "").localeCompare(b.schedule ?? ""));
}

export interface NoticeDoc {
  id: string;
  title: string;
  body: string;
  category: string;
  date: string;
}

export async function getAnnouncements(schoolId: string, category?: string, limit = 10): Promise<NoticeDoc[]> {
  let query: FirebaseFirestore.Query = adminDb().collection("notices").where("schoolId", "==", schoolId);
  if (category) query = query.where("category", "==", category);
  const snap = await query.orderBy("date", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<NoticeDoc, "id">) }));
}

export interface ResourceDoc {
  id: string;
  title: string;
  type: string;
  subject: string;
  url: string;
  uploadedAt: string;
}

export async function getResources(schoolId: string, subject?: string, limit = 10): Promise<ResourceDoc[]> {
  let query: FirebaseFirestore.Query = adminDb().collection("resources").where("schoolId", "==", schoolId);
  if (subject) query = query.where("subject", "==", subject);
  const snap = await query.limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ResourceDoc, "id">) }));
}

export interface NotificationDoc {
  id: string;
  kind: string;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
}

export async function getNotifications(uid: string, unreadOnly = false, limit = 10): Promise<NotificationDoc[]> {
  let query: FirebaseFirestore.Query = adminDb().collection("notifications").where("userId", "==", uid);
  if (unreadOnly) query = query.where("read", "==", false);
  const snap = await query.orderBy("timestamp", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<NotificationDoc, "id">) }));
}

export interface SchoolAnalyticsDoc {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  overallAttendancePercent: number;
  averagePerformancePercent?: number;
  engagementPercent?: number;
  updatedAt?: string;
}

export async function getSchoolAnalytics(schoolId: string): Promise<SchoolAnalyticsDoc | null> {
  const snap = await adminDb().collection("schoolAnalytics").doc(schoolId).get();
  return snap.exists ? (snap.data() as SchoolAnalyticsDoc) : null;
}
