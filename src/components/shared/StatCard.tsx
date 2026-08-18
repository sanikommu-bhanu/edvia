import { cn } from "@/lib/utils";

export function StatCard({ value, label, tone = "neutral" }: { value: string | number; label: string; tone?: "neutral" | "brand" | "success" | "danger" | "warning" }) {
  const tones = {
    neutral: "text-slate-900",
    brand: "text-edvia-600",
    success: "text-success",
    danger: "text-danger",
    warning: "text-warning",
  };
  return (
    <div className="card flex flex-1 flex-col items-center py-4">
      <span className={cn("text-2xl font-bold", tones[tone])}>{value}</span>
      <span className="mt-0.5 text-center text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
