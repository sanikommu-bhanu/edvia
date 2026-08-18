import { collection, doc, getDoc, getDocs, query, where, setDoc, deleteDoc } from "firebase/firestore";
import { requireFirebase } from "@/services/firebase/config";
import type { SchoolResource } from "@/types";

export async function listResources(schoolId: string, uid: string): Promise<SchoolResource[]> {
  const { db } = requireFirebase();
  const [resourcesSnap, bookmarksSnap] = await Promise.all([
    getDocs(query(collection(db, "resources"), where("schoolId", "==", schoolId))),
    getDocs(collection(db, "users", uid, "readState")),
  ]);
  const bookmarkedIds = new Set(bookmarksSnap.docs.filter((d) => d.id.startsWith("bookmark_")).map((d) => d.id));
  return resourcesSnap.docs
    .map((d) => ({
      id: d.id,
      ...(d.data() as Omit<SchoolResource, "id" | "bookmarked">),
      bookmarked: bookmarkedIds.has(`bookmark_${d.id}`),
    }))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function toggleBookmark(uid: string, resourceId: string, currentlyBookmarked: boolean): Promise<void> {
  const { db } = requireFirebase();
  const ref = doc(db, "users", uid, "readState", `bookmark_${resourceId}`);
  if (currentlyBookmarked) {
    await deleteDoc(ref);
  } else {
    await setDoc(ref, { bookmarkedAt: new Date().toISOString() });
  }
}

export async function isBookmarked(uid: string, resourceId: string): Promise<boolean> {
  const { db } = requireFirebase();
  const snap = await getDoc(doc(db, "users", uid, "readState", `bookmark_${resourceId}`));
  return snap.exists();
}
