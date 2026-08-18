import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { requireFirebase } from "@/services/firebase/config";
import { apiPost } from "@/services/apiClient";
import type { AttendanceRecord, AttendanceSummary, AttendanceStatus } from "@/types";

// Reads the SAME `attendance` collection EDVIA's AI tools query via the
// Admin SDK (api/_lib/tools/readTools.ts) — a record written by a teacher
// here or through the AI's markAttendance tool shows up identically either way.
export async function getAttendanceRecords(studentId: string): Promise<AttendanceRecord[]> {
  const { db } = requireFirebase();
  const snap = await getDocs(
    query(collection(db, "attendance"), where("studentId", "==", studentId), orderBy("date", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AttendanceRecord);
}

export async function getAttendanceSummary(studentId: string): Promise<AttendanceSummary> {
  const records = await getAttendanceRecords(studentId);
  const presentDays = records.filter((r) => r.status === "present").length;
  const absentDays = records.filter((r) => r.status === "absent").length;
  const leaveDays = records.filter((r) => r.status === "leave").length;
  const total = records.length || 1;
  const percentage = Math.round(((presentDays + leaveDays * 0.5) / total) * 100);

  const chronological = [...records].reverse();
  const trend: AttendanceSummary["trend"] = [];
  for (let i = 0; i < chronological.length; i += 7) {
    const slice = chronological.slice(i, i + 7);
    if (!slice.length) continue;
    const present = slice.filter((r) => r.status === "present").length;
    trend.push({ date: slice[slice.length - 1].date, percentage: Math.round((present / slice.length) * 100) });
  }

  return { presentDays, absentDays, leaveDays, percentage, trend };
}

export interface MarkAttendanceInput {
  classId: string;
  date: string;
  entries: { studentId: string; status: AttendanceStatus }[];
}

// firestore.rules deny direct client writes to `attendance`, so this calls
// the server route (api/attendance/mark.ts), which re-verifies the teacher
// is actually assigned to this class before writing anything.
export async function markClassAttendance(input: MarkAttendanceInput): Promise<{ success: true; count: number }> {
  return apiPost("/api/attendance/mark", input);
}
