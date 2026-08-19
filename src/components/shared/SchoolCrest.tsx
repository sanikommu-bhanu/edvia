import { cn } from "@/lib/utils";
import { crestFor, schoolInitials } from "@/lib/schoolIdentity";

// ==========================================================================
// SchoolCrest — the school's own visual identity
// --------------------------------------------------------------------------
// Everything here derives from the Firestore `schools/{id}` record. If the
// school has a logoUrl it is used; otherwise initials are generated from
// the real name and the accent colour is picked deterministically FROM that
// name, so two schools in the same deployment look different without anyone
// configuring anything.
//
// Nothing is hardcoded. Rename the school in Firestore and the crest,
// initials and colour all follow — which is the point: the app has to feel
// like *this* school's app, not a template with a placeholder logo.
// ==========================================================================

export function SchoolCrest({
  name,
  logoUrl,
  size = 44,
  className,
}: {
  name?: string;
  logoUrl?: string;
  size?: number;
  className?: string;
}) {
  const label = name?.trim() || "EDVIA";
  const crest = crestFor(label);
  const initials = schoolInitials(label);

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${label} logo`}
        width={size}
        height={size}
        className={cn("rounded-2xl object-cover shadow-soft", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-2xl font-display font-bold text-white shadow-soft",
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, ${crest.from} 0%, ${crest.to} 100%)`,
      }}
    >
      {initials}
    </span>
  );
}
