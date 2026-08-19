import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { requireFirebase } from "@/services/firebase/config";
import { apiPost } from "@/services/apiClient";
import { tallyAttendance, type AttendanceStatusValue } from "@/lib/attendanceMath";
import type { AttendanceRecord, AttendanceSummary, AttendanceStatus } from "@/types";

// ==========================================================================
// Attendance — client reads, server-mediated writes
// --------------------------------------------------------------------------
// Reads hit the SAME `attendance` collection EDVIA's AI tools query through
// the Admin SDK, and use the SAME percentage formula (src/lib/attendanceMath)
// the server uses. A record written by a teacher on the Mark Attendance
// screen and one written by the markAttendance AI tool are indistinguishable,
// which is what makes the teacher→parent demo hold up.
//
// Writes never go direct: firestore.rules denies all client writes to
// `attendance`, so saving goes through api/attendance/mark.ts, which
// re-verifies the teacher's class assignment before touching anything.
// ==========================================================================

export async function getAttendanceRecords(studentId: string): Promise<AttendanceRecord[]> {
  const { db } = requireFirebase();
  const snap = await getDocs(
    query(collection(db, "attendance"), where("studentId", "==", studentId), orderBy("date", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AttendanceRecord);
}

export async function getAttendanceSummary(studentId: string): Promise<AttendanceSummary> {
  const records = await getAttendanceRecords(studentId);
  const tally = tallyAttendance(records.map((r) => r.status as AttendanceStatusValue));

  // Weekly buckets, oldest first, for the trend line.
  const chronological = [...records].reverse();
  const trend: AttendanceSummary["trend"] = [];
  for (let i = 0; i < chronological.length; i += 7) {
    const slice = chronological.slice(i, i + 7);
    if (!slice.length) continue;
    trend.push({
      date: slice[slice.length - 1].date,
      percentage: tallyAttendance(slice.map((r) => r.status as AttendanceStatusValue)).percentage,
    });
  }

  return {
    presentDays: tally.present,
    absentDays: tally.absent,
    leaveDays: tally.leave,
    percentage: tally.percentage,
    trend,
  };
}

/**
 * What a class was already marked as on a given date.
 *
 * The Mark Attendance screen loads this before rendering so it shows the
 * saved state rather than defaulting everyone to "present" — otherwise a
 * teacher opening the screen to correct one student would silently re-mark
 * the whole class present on save.
 */
export async function getClassAttendanceForDate(
  classId: string,
  date: string
): Promise<Record<string, AttendanceStatus>> {
  const { db } = requireFirebase();
  const snap = await getDocs(
    query(collection(db, "attendance"), where("classId", "==", classId), where("date", "==", date))
  );
  const byStudent: Record<string, AttendanceStatus> = {};
  snap.docs.forEach((d) => {
    const record = d.data() as { studentId: string; status: AttendanceStatus };
    byStudent[record.studentId] = record.status;
  });
  return byStudent;
}

export interface MarkAttendanceInput {
  classId: string;
  date: string;
  entries: { studentId: string; status: AttendanceStatus }[];
}

export interface MarkAttendanceResponse {
  success: true;
  count: number;
  amended: number;
}

export async function markClassAttendance(input: MarkAttendanceInput): Promise<MarkAttendanceResponse> {
  return apiPost("/api/attendance/mark", input);
}
