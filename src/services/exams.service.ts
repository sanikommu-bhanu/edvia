import { collection, getDocs, query, where } from "firebase/firestore";
import { requireFirebase } from "@/services/firebase/config";
import type { Exam } from "@/types";

export async function listExams(classId: string): Promise<Exam[]> {
  const { db } = requireFirebase();
  const snap = await getDocs(query(collection(db, "exams"), where("classId", "==", classId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Exam);
}
