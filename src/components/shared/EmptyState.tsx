import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon size={24} />
      </span>
      <p className="mt-4 font-semibold text-slate-800">{title}</p>
      <p className="mt-1 max-w-[240px] text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
