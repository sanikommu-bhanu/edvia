import { collection, getDocs, query, where } from "firebase/firestore";
import { requireFirebase } from "@/services/firebase/config";
import type { Assignment } from "@/types";

export async function listAssignments(classId: string): Promise<Assignment[]> {
  const { db } = requireFirebase();
  const snap = await getDocs(query(collection(db, "assignments"), where("classId", "==", classId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Assignment);
}
