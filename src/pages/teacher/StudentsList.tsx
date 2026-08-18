import { useEffect, useState } from "react";
import { TopBar } from "@/layouts/TopBar";
import { Avatar } from "@/components/ui/avatar";
import { listClassStudents } from "@/services/school/school.service";
import type { StudentRecord } from "@/types";

export default function StudentsList() {
  const [students, setStudents] = useState<StudentRecord[]>([]);

  useEffect(() => {
    listClassStudents("cls_10a").then(setStudents);
  }, []);

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="Students" />
      <div className="screen-pad !pt-0 space-y-2.5">
        {students.map((s) => (
          <div key={s.id} className="card flex items-center gap-3 p-3.5">
            <Avatar name={s.fullName} size={40} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{s.fullName}</p>
              <p className="text-xs text-muted-foreground">{s.className} · Roll {s.rollNumber}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
