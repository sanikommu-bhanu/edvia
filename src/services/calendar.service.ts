import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { requireFirebase } from "@/services/firebase/config";
import type { CalendarEvent, Role } from "@/types";

export async function listCalendarEvents(schoolId: string, role?: Role): Promise<CalendarEvent[]> {
  const { db } = requireFirebase();
  const snap = await getDocs(query(collection(db, "calendarEvents"), where("schoolId", "==", schoolId)));
  const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CalendarEvent);
  const filtered = role ? events.filter((e) => !e.roles || e.roles.includes(role)) : events;
  return filtered.sort((a, b) => a.date.localeCompare(b.date));
}

// firestore.rules allow only teacher/principal to create calendar events,
// scoped to their own school — enforced there, not just in the UI.
export async function addCalendarEvent(schoolId: string, event: Omit<CalendarEvent, "id">): Promise<CalendarEvent> {
  const { db } = requireFirebase();
  const ref = await addDoc(collection(db, "calendarEvents"), { ...event, schoolId });
  return { id: ref.id, ...event };
}
