import { collection, doc, getDocs, query, where, orderBy, updateDoc, writeBatch } from "firebase/firestore";
import { requireFirebase } from "@/services/firebase/config";
import type { AppNotification } from "@/types";

// Notifications are created server-side only (see firestore.rules), but the
// owning user may flip their own `read` flag directly — that's the one
// field the rules allow a client update to touch.
export async function listNotifications(uid: string): Promise<AppNotification[]> {
  const { db } = requireFirebase();
  const snap = await getDocs(
    query(collection(db, "notifications"), where("userId", "==", uid), orderBy("timestamp", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification);
}

export async function markNotificationRead(id: string): Promise<void> {
  const { db } = requireFirebase();
  await updateDoc(doc(db, "notifications", id), { read: true });
}

export async function markAllRead(uid: string): Promise<void> {
  const { db } = requireFirebase();
  const snap = await getDocs(query(collection(db, "notifications"), where("userId", "==", uid), where("read", "==", false)));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
}
