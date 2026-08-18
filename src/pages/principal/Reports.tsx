import { TopBar } from "@/layouts/TopBar";
import { FileBarChart, Download } from "lucide-react";

const REPORTS = [
  { id: "1", title: "Monthly Attendance Report", period: "May 2026" },
  { id: "2", title: "Academic Performance Summary", period: "Term 3, 2026" },
  { id: "3", title: "Class-wise Engagement Report", period: "May 2026" },
];

export default function PrincipalReports() {
  return (
    <div className="min-h-screen pb-8">
      <TopBar title="Reports" />
      <div className="screen-pad !pt-0 space-y-2.5">
        {REPORTS.map((r) => (
          <div key={r.id} className="card flex items-center gap-3 p-3.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-edvia-100 text-edvia-700">
              <FileBarChart size={18} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{r.title}</p>
              <p className="text-xs text-muted-foreground">{r.period}</p>
            </div>
            <Download size={16} className="text-muted-foreground" />
          </div>
        ))}
      </div>
    </div>
  );
}
