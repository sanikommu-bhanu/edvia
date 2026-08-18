import { collection, doc, getDocs, query, where, orderBy, setDoc } from "firebase/firestore";
import { requireFirebase } from "@/services/firebase/config";
import type { Notice } from "@/types";

// Notices are shared per-school documents (see firestore.rules: read-only,
// server-written). "Read" state is personal, so it's tracked separately
// under users/{uid}/readState rather than mutating the shared notice —
// otherwise one person opening a notice would mark it read for everyone.
export async function listNotices(schoolId: string, uid: string): Promise<Notice[]> {
  const { db } = requireFirebase();
  const [noticesSnap, readSnap] = await Promise.all([
    getDocs(query(collection(db, "notices"), where("schoolId", "==", schoolId), orderBy("date", "desc"))),
    getDocs(collection(db, "users", uid, "readState")),
  ]);
  const readIds = new Set(readSnap.docs.filter((d) => d.id.startsWith("notice_")).map((d) => d.id));
  return noticesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Notice, "id" | "read">),
    read: readIds.has(`notice_${d.id}`),
  }));
}

export async function markNoticeRead(uid: string, noticeId: string): Promise<void> {
  const { db } = requireFirebase();
  await setDoc(doc(db, "users", uid, "readState", `notice_${noticeId}`), { readAt: new Date().toISOString() });
}
