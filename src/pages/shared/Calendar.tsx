import { useEffect, useState } from "react";
import { TopBar } from "@/layouts/TopBar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { listCalendarEvents } from "@/services/calendar.service";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { CalendarDays } from "lucide-react";
import { useAuth } from "@/app/AuthContext";
import type { CalendarEvent, CalendarEventType } from "@/types";

const TYPE_TONE: Record<CalendarEventType, string> = {
  exam: "bg-danger/10 text-danger",
  test: "bg-warning/10 text-warning",
  event: "bg-info/10 text-info",
  ptm: "bg-edvia-100 text-edvia-700",
  holiday: "bg-success/10 text-success",
  notice: "bg-muted text-slate-600",
};

export default function CalendarPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    if (!user?.schoolId) return;
    listCalendarEvents(user.schoolId, user.role).then(setEvents);
  }, [user?.schoolId, user?.role]);

  const canAddEvent = user?.role === "teacher" || user?.role === "principal";

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="Calendar" />
      <div className="screen-pad space-y-2.5">
        {events.length === 0 && <EmptyState icon={CalendarDays} title="No events yet" body="School events, exams, and holidays will show up here." />}
        {events.map((e) => (
          <div key={e.id} className="card flex items-center justify-between p-3.5">
            <div>
              <p className="text-sm font-semibold text-slate-900">{e.title}</p>
              <p className="text-xs text-muted-foreground">{formatDate(e.date)}</p>
            </div>
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium capitalize", TYPE_TONE[e.type])}>{e.type}</span>
          </div>
        ))}
      </div>
      {canAddEvent && (
        <div className="screen-pad">
          <Button size="lg" className="w-full">+ Add Event</Button>
        </div>
      )}
    </div>
  );
}
