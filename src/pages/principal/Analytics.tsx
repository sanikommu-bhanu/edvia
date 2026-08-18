import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from "recharts";
import { TopBar } from "@/layouts/TopBar";
import { StatCard } from "@/components/shared/StatCard";

const STUDENT_PERFORMANCE = [
  { name: "Term 1", score: 72 }, { name: "Term 2", score: 76 }, { name: "Term 3", score: 81 }, { name: "Term 4", score: 85 },
];

const TOP_STUDENTS = [
  { name: "Rohan Kumar", className: "Class 10 - A", score: "95%" },
  { name: "Alisha Khan", className: "Class 10 - B", score: "93%" },
];

export default function PrincipalAnalytics() {
  return (
    <div className="min-h-screen pb-8">
      <TopBar title="Analytics" />
      <div className="screen-pad !pt-0">
        <p className="mb-3 text-xs font-medium text-muted-foreground">This Month</p>
        <div className="flex gap-3">
          <StatCard value="87%" label="Attendance" tone="success" />
          <StatCard value="76%" label="Performance" tone="brand" />
          <StatCard value="82%" label="Engagement" tone="warning" />
        </div>
      </div>

      <div className="screen-pad !pt-6">
        <div className="card p-4">
          <p className="mb-3 text-sm font-semibold text-slate-800">Student Performance</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={STUDENT_PERFORMANCE}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="score" fill="#8257D3" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="screen-pad !pt-6">
        <p className="mb-2 text-sm font-semibold text-slate-800">Top Performing Students</p>
        <div className="space-y-2">
          {TOP_STUDENTS.map((s, i) => (
            <div key={s.name} className="card flex items-center justify-between p-3.5">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-edvia-100 text-xs font-bold text-edvia-700">{i + 1}</span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.className}</p>
                </div>
              </div>
              <span className="text-sm font-semibold text-success">{s.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
