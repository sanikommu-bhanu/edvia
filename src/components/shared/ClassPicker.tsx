import { ChevronDown } from "lucide-react";
import { useSchoolScope } from "@/app/SchoolContext";
import { cn } from "@/lib/utils";

/**
 * Lets a user with more than one class or child choose which one a screen is
 * about, and shows a plain label when there is only one.
 *
 * It renders nothing at all when there is nothing to choose and nothing
 * worth labelling, so single-class screens stay uncluttered.
 */
export function ClassPicker({ className }: { className?: string }) {
  const { classes, activeClassId, selectClass, children, student, selectChild } = useSchoolScope();

  const hasChildChoice = children.length > 1;
  const hasClassChoice = classes.length > 1;
  const activeClass = classes.find((c) => c.id === activeClassId);

  if (!hasChildChoice && !hasClassChoice && !activeClass && !student) return null;

  return (
    <div className={cn("screen-pad !pt-0 !pb-3 flex flex-wrap items-center gap-2", className)}>
      {hasChildChoice && (
        <Select
          label="Child"
          value={student?.id ?? ""}
          onChange={selectChild}
          options={children.map((c) => ({ value: c.id, label: c.fullName }))}
        />
      )}

      {hasClassChoice ? (
        <Select
          label="Class"
          value={activeClassId ?? ""}
          onChange={selectClass}
          options={classes.map((c) => ({ value: c.id, label: c.className }))}
        />
      ) : (
        (activeClass || student) && (
          <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {activeClass?.className ?? student?.className}
          </span>
        )
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-full border border-border bg-surface py-1.5 pl-3 pr-8 text-xs font-medium text-slate-700 outline-none focus:border-edvia-400 focus:ring-2 focus:ring-edvia-100"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-2.5 text-muted-foreground" />
    </label>
  );
}
