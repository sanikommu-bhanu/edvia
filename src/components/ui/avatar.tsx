import { initials, cn } from "@/lib/utils";

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string; size?: number; className?: string }) {
  if (src) {
    return <img src={src} alt={name} style={{ width: size, height: size }} className={cn("rounded-full object-cover", className)} />;
  }
  return (
    <div
      style={{ width: size, height: size }}
      className={cn("flex items-center justify-center rounded-full bg-edvia-100 text-edvia-700 font-semibold", className)}
    >
      {initials(name)}
    </div>
  );
}
