import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { stateLabel } from "@/components/shared/agentState";
import { useTranslation } from "@/i18n";
import type { AIAgentState } from "@/types";

// ==========================================================================
// EdviaOrb — the assistant as a sphere
// --------------------------------------------------------------------------
// A voice-assistant orb in the Siri lineage: a glassy 3D sphere with liquid
// colour moving inside it. It is used on the screens where EDVIA has no task
// yet and is simply present — splash, onboarding, role selection and the
// auth screens. EdviaRobot remains the in-app avatar, where a face with an
// expression communicates more than a light does.
//
// HOW THE 3D IS FAKED
// There is no WebGL and no 3D library here. A sphere is a shading problem,
// not a geometry problem, and four flat layers solve it:
//
//   1. halo      — coloured light bleeding onto whatever is behind the orb
//   2. blobs     — three offset radial gradients, blurred, sweeping around
//                  the centre inside a circular clip. This is the liquid.
//   3. shading   — inset shadows: a bright rim at the top where the light
//                  hits, a dark one at the bottom-right where it falls away.
//                  This single layer is what turns a circle into a ball.
//   4. specular  — the small bright highlight, offset up and left to agree
//                  with the shading. Placed anywhere else it reads as wrong
//                  without the viewer being able to say why.
//
// The cost of that choice is roughly 2 KB and no dependency, against ~150 KB
// for three.js, on the screen a student with a cheap Android meets first.
//
// PERFORMANCE
// Only transform and opacity are animated. The blur that makes the colour
// look liquid is a static filter, applied once — animating a filter forces a
// full repaint every frame. Reduced motion is handled in CSS (globals.css),
// including pinning the blobs back to a composed resting position rather
// than freezing them mid-sweep.
// ==========================================================================

/** The three colours swirling inside the sphere, plus the light around it. */
interface OrbPalette {
  /** Blob colours, back to front. */
  blobs: [string, string, string];
  /** Halo colour bled onto the background. */
  halo: string;
  /** Multiplier on every period — lower is faster. */
  tempo: number;
}

// Each state gets a palette and a tempo, and nothing else changes: the
// geometry, shading and highlight are identical throughout, because the
// object is the same object. Only its mood moves.
const PALETTES: Record<AIAgentState, OrbPalette> = {
  idle:           { blobs: ["#8257D3", "#4F8DF7", "#C4AEEC"], halo: "#8257D3", tempo: 1 },
  connected:      { blobs: ["#8257D3", "#4F8DF7", "#C4AEEC"], halo: "#8257D3", tempo: 1 },
  listening:      { blobs: ["#4F8DF7", "#38BDF8", "#A483DD"], halo: "#4F8DF7", tempo: 0.7 },
  interrupted:    { blobs: ["#4F8DF7", "#38BDF8", "#A483DD"], halo: "#4F8DF7", tempo: 0.7 },
  thinking:       { blobs: ["#6B3FBE", "#C026D3", "#4F8DF7"], halo: "#8257D3", tempo: 0.45 },
  verifying:      { blobs: ["#6B3FBE", "#C026D3", "#4F8DF7"], halo: "#6B3FBE", tempo: 0.45 },
  processing:     { blobs: ["#6B3FBE", "#C026D3", "#4F8DF7"], halo: "#6B3FBE", tempo: 0.45 },
  tool_execution: { blobs: ["#6B3FBE", "#C026D3", "#4F8DF7"], halo: "#6B3FBE", tempo: 0.45 },
  speaking:       { blobs: ["#4F8DF7", "#22D3EE", "#8257D3"], halo: "#4F8DF7", tempo: 0.55 },
  success:        { blobs: ["#22A06B", "#4ADE80", "#8257D3"], halo: "#22A06B", tempo: 0.9 },
  error:          { blobs: ["#E5484D", "#FB923C", "#8257D3"], halo: "#E5484D", tempo: 1.4 },
  disconnected:   { blobs: ["#9A8FB5", "#B8B1C9", "#CFC9DC"], halo: "#9A8FB5", tempo: 2.2 },
};

/**
 * Base sweep periods, in seconds — deliberately not multiples of each other,
 * so the three blobs take minutes rather than seconds to return to the same
 * relative arrangement. A short common period is exactly what makes an
 * ambient animation start to read as a looping GIF.
 */
const BLOB_PERIODS = [13, 17, 21] as const;
const BLOB_KEYFRAMES = ["orb-blob-a", "orb-blob-b", "orb-blob-c"] as const;

export interface EdviaOrbProps {
  /** Diameter in pixels. Everything inside scales from this one number. */
  size?: number;
  state?: AIAgentState;
  /** Renders the state as a caption under the orb. */
  showLabel?: boolean;
  className?: string;
  /** Overrides the accessible name. Defaults to the state's own label. */
  label?: string;
}

export function EdviaOrb({
  size = 168,
  state = "idle",
  showLabel = false,
  className,
  label,
}: EdviaOrbProps) {
  const { language } = useTranslation();
  const palette = PALETTES[state] ?? PALETTES.idle;
  const accessibleName = label ?? stateLabel(state, language);

  // Every radius is derived from `size`, so a 72px orb in a form header and
  // a 200px orb on the splash screen are the same object at two scales, not
  // two differently-proportioned ones.
  const metrics = useMemo(
    () => ({
      blobBlur: `blur(${Math.round(size * 0.09)}px) saturate(1.45) brightness(1.18)`,
      haloBlur: `blur(${Math.round(size * 0.2)}px)`,
      specularBlur: `blur(${Math.max(2, Math.round(size * 0.02))}px)`,
      bounceBlur: `blur(${Math.max(2, Math.round(size * 0.025))}px)`,
      // Bright rim along the top edge, deep shadow at the lower right, and a
      // coloured contact shadow beneath. Together these are the entire 3D.
      shading: [
        // Thin bright arc along the top-left edge: the light source.
        `inset ${size * 0.012}px ${size * 0.03}px ${size * 0.05}px rgba(255,255,255,0.55)`,
        // Deep falloff at the lower right, where the light does not reach.
        `inset ${size * -0.035}px ${size * -0.075}px ${size * 0.15}px rgba(12,6,32,0.6)`,
        // Glass edge — a hairline of light all the way round the silhouette.
        `inset 0 0 0 1px rgba(255,255,255,0.28)`,
        // Contact shadow on the page beneath.
        `0 ${size * 0.1}px ${size * 0.24}px rgba(38,18,84,0.34)`,
      ].join(", "),
    }),
    [size]
  );

  return (
    <div className={cn("inline-flex flex-col items-center", className)}>
      <div
        role="img"
        aria-label={accessibleName}
        className="relative grid place-items-center"
        style={{ width: size, height: size }}
      >
        {/* 1 — halo. Behind everything, and the only part allowed to spill
            outside the sphere's bounds. */}
        <div
          className="orb-halo pointer-events-none absolute inset-[-18%] rounded-full"
          style={{
            background: `radial-gradient(circle, ${palette.halo}80 0%, ${palette.halo}2b 42%, ${palette.halo}00 70%)`,
            filter: metrics.haloBlur,
            animation: `orb-halo ${7 * palette.tempo}s ease-in-out infinite`,
          }}
        />

        {/* A single hairline ring, rotating slowly. It gives the eye a crisp
            edge to read the sphere against — without it the blurred colour
            has no boundary and the orb reads as a smudge. */}
        <div
          className="orb-ring pointer-events-none absolute inset-[-4%] rounded-full"
          style={{
            border: `1px solid ${palette.halo}33`,
            animation: `orb-ring-spin ${26 * palette.tempo}s linear infinite`,
          }}
        />

        {/* 2 — the sphere. overflow-hidden is the circular clip that keeps
            the blobs inside the ball. */}
        <div
          className="relative overflow-hidden rounded-full"
          style={{
            width: size,
            height: size,
            // Deep, near-black violet — NOT a light lavender. The blobs are
            // screen-blended, and screen only adds light: over a pale base
            // every colour washes out to the same milky mauve (which is
            // exactly what the first version of this did). On a dark base the
            // same blobs read as saturated light inside glass, which is the
            // whole effect.
            background:
              "radial-gradient(circle at 34% 26%, #6A51AE 0%, #422A80 44%, #291653 76%, #1D1040 100%)",
            animation: `orb-breathe ${5.5 * palette.tempo}s ease-in-out infinite`,
          }}
        >
          {palette.blobs.map((color, i) => (
            <div
              key={`${color}-${i}`}
              className="orb-blob absolute rounded-full"
              style={{
                // Roughly three-quarters of the sphere, centred. Small enough
                // that the three keep separate lobes as they sweep, large
                // enough that a lobe at full extent still reaches the rim.
                inset: "12%",
                background: `radial-gradient(circle at 50% 50%, ${color} 0%, ${color}f2 30%, ${color}80 52%, ${color}00 72%)`,
                filter: metrics.blobBlur,
                // All three add light to the dark base. Screen is what makes
                // overlaps brighten into a new hue instead of one blob simply
                // occluding another — that is the liquid.
                mixBlendMode: "screen",
                animation: `${BLOB_KEYFRAMES[i]} ${BLOB_PERIODS[i] * palette.tempo}s linear infinite`,
                willChange: "transform",
              }}
            />
          ))}

          {/* Terminator: the shadowed side of the ball, opposite the light.
              It sits ON TOP of the blobs so colour genuinely falls off into
              the dark rather than glowing right up to the edge — the single
              biggest cue that this is a lit sphere and not a coloured disc. */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 30% 24%, rgba(20,10,44,0) 38%, rgba(20,10,44,0.2) 70%, rgba(20,10,44,0.55) 100%)",
            }}
          />

          {/* 3 — shading. The layer that makes it a ball. */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ boxShadow: metrics.shading }}
          />

          {/* 4 — specular highlight, up and left to agree with the rim. */}
          <div
            className="orb-specular pointer-events-none absolute rounded-full"
            style={{
              left: "16%",
              top: "11%",
              width: "38%",
              height: "27%",
              background:
                "radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.32) 45%, rgba(255,255,255,0) 72%)",
              filter: metrics.specularBlur,
              animation: `orb-specular ${9 * palette.tempo}s ease-in-out infinite`,
            }}
          />

          {/* A second, much dimmer highlight low on the opposite side: light
              bouncing back up off the surface below. Cheap, and it is the
              difference between "sphere" and "convincing sphere". */}
          <div
            className="pointer-events-none absolute rounded-full"
            style={{
              right: "18%",
              bottom: "14%",
              width: "22%",
              height: "13%",
              background:
                "radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 70%)",
              filter: metrics.bounceBlur,
            }}
          />
        </div>
      </div>

      {showLabel && (
        // aria-hidden because the orb's own aria-label already says this;
        // announcing it twice is noise for a screen-reader user.
        <p className="mt-3 text-small font-medium text-muted-foreground" aria-hidden="true">
          {accessibleName}
        </p>
      )}
    </div>
  );
}
