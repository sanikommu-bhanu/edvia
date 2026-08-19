import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { stateLabel } from "@/components/shared/agentState";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useTranslation } from "@/i18n";
import type { AIAgentState } from "@/types";

// ==========================================================================
// EdviaOrb — the assistant as a sphere
// --------------------------------------------------------------------------
// A voice-assistant orb in the Siri lineage: a glass sphere with liquid
// colour moving inside it, lit from the upper left, sitting in its own
// bloom. It is used on the screens where EDVIA has no task yet and is simply
// present — splash, onboarding, role selection and the auth screens.
// EdviaRobot remains the in-app avatar, where a face with an expression
// communicates more than a light does.
//
// HOW THE 3D IS FAKED
// There is no WebGL and no 3D library here. A sphere is a shading problem,
// not a geometry problem, and a stack of flat layers solves it:
//
//   1. bloom     — coloured light bleeding onto whatever is behind the orb
//   2. orbits    — hairline circles tipped back on X so they read as
//                  ellipses in perspective, each carrying a travelling
//                  spark. Every ring is drawn twice — once behind the ball
//                  and once in front, clipped to its near half — so it
//                  genuinely passes *around* the sphere instead of over it.
//   3. liquid    — three offset radial gradients, blurred, sweeping around
//                  the centre inside a circular clip, screen-blended over a
//                  near-black base so overlaps brighten into new hues.
//   4. core      — a bright nucleus deep inside, pulsing. It gives the glass
//                  something to be in front of; without it the ball is lit
//                  only at its surface and reads as hollow.
//   5. shading   — the terminator, plus inset shadows: a bright rim where
//                  the light lands and a deep one where it falls away. This
//                  is the layer that turns a circle into a ball.
//   6. glass     — a refracting rim (backdrop-filter behind an annular
//                  mask), a frosted face, a sheen that sweeps across it and
//                  a whisper of grain. This is the glassmorphism: the shell
//                  reads as a real thickness of glass over the liquid.
//   7. speculars — the sharp highlight up and left to agree with the rim, a
//                  broad soft one above it, and a dim bounce low on the far
//                  side. Placed anywhere else they read as wrong without the
//                  viewer being able to say why.
//
// The cost of that choice is a couple of KB and no dependency, against
// ~150 KB for three.js, on the screen a student with a cheap Android meets
// first.
//
// IT RESPONDS
// The stage carries a CSS perspective and the whole assembly leans toward
// the pointer, while the highlights slide the other way (a fixed lamp does
// not travel with the object) and the liquid drifts with it but less, which
// is what parallax is. The lean is pointer-driven rather than animated, so
// it costs nothing while nobody is touching it, and it is skipped entirely
// under reduced motion.
//
// PERFORMANCE
// Only transform and opacity are animated. The blur that makes the colour
// look liquid is a static filter, applied once — animating a filter forces a
// full repaint every frame. Reduced motion is handled in CSS (globals.css),
// including pinning the moving parts back to a composed resting position
// rather than freezing them mid-sweep.
// ==========================================================================

/** The colours swirling inside the sphere, plus the light around it. */
interface OrbPalette {
  /** Blob colours, back to front. */
  blobs: [string, string, string];
  /** Halo colour bled onto the background. */
  halo: string;
  /** The nucleus deep inside the glass — the brightest note in the palette. */
  core: string;
  /** Multiplier on every period — lower is faster. */
  tempo: number;
}

// Each state gets a palette and a tempo, and nothing else changes: the
// geometry, shading and highlight are identical throughout, because the
// object is the same object. Only its mood moves.
const PALETTES: Record<AIAgentState, OrbPalette> = {
  idle:           { blobs: ["#8257D3", "#4F8DF7", "#C4AEEC"], halo: "#8257D3", core: "#C9B6FF", tempo: 1 },
  connected:      { blobs: ["#8257D3", "#4F8DF7", "#C4AEEC"], halo: "#8257D3", core: "#C9B6FF", tempo: 1 },
  listening:      { blobs: ["#4F8DF7", "#38BDF8", "#A483DD"], halo: "#4F8DF7", core: "#A5E8FF", tempo: 0.7 },
  interrupted:    { blobs: ["#4F8DF7", "#38BDF8", "#A483DD"], halo: "#4F8DF7", core: "#A5E8FF", tempo: 0.7 },
  thinking:       { blobs: ["#6B3FBE", "#C026D3", "#4F8DF7"], halo: "#8257D3", core: "#F3A8FF", tempo: 0.45 },
  verifying:      { blobs: ["#6B3FBE", "#C026D3", "#4F8DF7"], halo: "#6B3FBE", core: "#F3A8FF", tempo: 0.45 },
  processing:     { blobs: ["#6B3FBE", "#C026D3", "#4F8DF7"], halo: "#6B3FBE", core: "#F3A8FF", tempo: 0.45 },
  tool_execution: { blobs: ["#6B3FBE", "#C026D3", "#4F8DF7"], halo: "#6B3FBE", core: "#F3A8FF", tempo: 0.45 },
  speaking:       { blobs: ["#4F8DF7", "#22D3EE", "#8257D3"], halo: "#4F8DF7", core: "#9BF6FF", tempo: 0.55 },
  success:        { blobs: ["#22A06B", "#4ADE80", "#8257D3"], halo: "#22A06B", core: "#A7F3C8", tempo: 0.9 },
  error:          { blobs: ["#E5484D", "#FB923C", "#8257D3"], halo: "#E5484D", core: "#FFC9A8", tempo: 1.4 },
  disconnected:   { blobs: ["#9A8FB5", "#B8B1C9", "#CFC9DC"], halo: "#9A8FB5", core: "#DCD6E6", tempo: 2.2 },
};

/**
 * Base sweep periods, in seconds — deliberately not multiples of each other,
 * so the three blobs take minutes rather than seconds to return to the same
 * relative arrangement. A short common period is exactly what makes an
 * ambient animation start to read as a looping GIF.
 */
const BLOB_PERIODS = [13, 17, 21] as const;
const BLOB_KEYFRAMES = ["orb-blob-a", "orb-blob-b", "orb-blob-c"] as const;

/**
 * The orbits: how far each circle is tipped away from the viewer, how it is
 * rolled, how far outside the sphere it sits, its period and its direction.
 * Two is the right number — one reads as an accident, three as a diagram.
 */
const ORBITS = [
  { tiltX: 74, tiltZ: -14, inset: -9, period: 18, direction: 1 },
  { tiltX: 66, tiltZ: 32, inset: -3, period: 27, direction: -1 },
] as const;

type Orbit = (typeof ORBITS)[number];

/** How far the assembly leans toward the pointer, in degrees. */
const MAX_TILT_DEG = 15;

/** The spring the lean settles on. Slightly overshooting, never bouncy. */
const LEAN_EASING = "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)";

/** Tiled fractal noise, ~0.4 KB, for the microscopic grain real glass has. */
const GLASS_GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`;

export interface EdviaOrbProps {
  /** Diameter in pixels. Everything inside scales from this one number. */
  size?: number;
  state?: AIAgentState;
  /** Renders the state as a caption under the orb. */
  showLabel?: boolean;
  className?: string;
  /** Overrides the accessible name. Defaults to the state's own label. */
  label?: string;
  /**
   * Lean toward the pointer. On by default; pass false where the orb is a
   * static mark rather than something the user is looking at.
   */
  interactive?: boolean;
}

export function EdviaOrb({
  size = 168,
  state = "idle",
  showLabel = false,
  className,
  label,
  interactive = true,
}: EdviaOrbProps) {
  const { language } = useTranslation();
  const reducedMotion = useReducedMotion();
  const palette = PALETTES[state] ?? PALETTES.idle;
  const accessibleName = label ?? stateLabel(state, language);

  const stageRef = useRef<HTMLDivElement>(null);
  // -1..1 on each axis: where the pointer sits relative to the orb's centre.
  const [lean, setLean] = useState({ x: 0, y: 0 });
  const [pressed, setPressed] = useState(false);
  const leans = interactive && !reducedMotion;

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!leans) return;
      const box = stageRef.current?.getBoundingClientRect();
      if (!box) return;
      // Clamped, because a pointer just outside the box should not lean the
      // orb any further than a pointer at its very edge.
      const clamp = (n: number) => Math.max(-1, Math.min(1, n));
      setLean({
        x: clamp((event.clientX - (box.left + box.width / 2)) / (box.width / 2)),
        y: clamp((event.clientY - (box.top + box.height / 2)) / (box.height / 2)),
      });
    },
    [leans]
  );

  const settle = useCallback(() => {
    setLean({ x: 0, y: 0 });
    setPressed(false);
  }, []);

  // Every radius is derived from `size`, so a 72px orb in a form header and
  // a 200px orb on the splash screen are the same object at two scales, not
  // two differently-proportioned ones.
  const metrics = useMemo(
    () => ({
      blobBlur: `blur(${Math.round(size * 0.09)}px) saturate(1.45) brightness(1.18)`,
      coreBlur: `blur(${Math.max(3, Math.round(size * 0.045))}px)`,
      haloBlur: `blur(${Math.round(size * 0.2)}px)`,
      bloomBlur: `blur(${Math.round(size * 0.11)}px)`,
      specularBlur: `blur(${Math.max(2, Math.round(size * 0.02))}px)`,
      softSpecularBlur: `blur(${Math.max(4, Math.round(size * 0.07))}px)`,
      causticBlur: `blur(${Math.max(2, Math.round(size * 0.03))}px)`,
      dispersionBlur: `blur(${Math.max(1, Math.round(size * 0.008))}px)`,
      // The shell only refracts near the silhouette, where you are looking
      // through the most glass. Blurring the whole face would just smear the
      // liquid; blurring an annulus reads as thickness.
      rimRefraction: `blur(${Math.max(2, Math.round(size * 0.028))}px) saturate(1.5) brightness(1.06)`,
      // NOTE the `closest-side` on every gradient below, and on the rim
      // layers in the markup. Without it a radial-gradient sizes itself to
      // the farthest CORNER of its box, so on a square element wrapping a
      // circle, 100% lands at 1.41r — a comfortable margin outside the
      // silhouette, where it is clipped away and never seen. Every stop meant
      // to sit on the rim silently missed it. `closest-side` pins 100% to
      // exactly r, which is what all of these percentages assume.
      rimMask:
        "radial-gradient(circle closest-side at 50% 50%, transparent 72%, rgba(0,0,0,0.45) 87%, #000 96%, #000 100%)",
      // Dispersion is a rim effect and nothing else — the last few percent of
      // the radius. Any wider and it stops reading as bent light and starts
      // reading as a rainbow sticker.
      dispersionMask:
        "radial-gradient(circle closest-side at 50% 50%, transparent 84%, rgba(0,0,0,0.7) 93%, #000 97%, rgba(0,0,0,0.35) 100%)",
      // Bright rim along the top edge, deep shadow at the lower right, and a
      // coloured contact shadow beneath. Together these are the entire 3D.
      shading: [
        // Thin bright arc along the top-left edge: the light source.
        `inset ${size * 0.012}px ${size * 0.03}px ${size * 0.05}px rgba(255,255,255,0.55)`,
        // Deep falloff at the lower right, where the light does not reach.
        `inset ${size * -0.035}px ${size * -0.075}px ${size * 0.15}px rgba(12,6,32,0.72)`,
        // Glass edge — a hairline of light all the way round the silhouette.
        `inset 0 0 0 1px rgba(255,255,255,0.45)`,
        // A second, softer edge just inside it: the far wall of the shell,
        // seen through the near one. Two edges is the difference between a
        // coloured circle and something with a thickness.
        `inset 0 0 ${size * 0.035}px ${size * 0.012}px rgba(255,255,255,0.14)`,
        // Contact shadow on the page beneath.
        `0 ${size * 0.1}px ${size * 0.24}px rgba(38,18,84,0.34)`,
        // Coloured bloom hugging the silhouette, so the glass looks lit from
        // within rather than merely painted.
        `0 0 ${size * 0.3}px ${size * 0.02}px rgba(130,87,211,0.28)`,
      ].join(", "),
    }),
    [size]
  );

  const sparkSize = Math.max(3, size * 0.038);

  // One orbit, drawn as either its far half (behind the ball) or its near
  // half (in front of it). Both halves share geometry, period and direction,
  // which is what makes the pair read as a single ring passing around the
  // sphere rather than as two arcs.
  const renderOrbit = (orbit: Orbit, index: number, near: boolean) => (
    <div
      key={`${near ? "near" : "far"}-${index}`}
      className="pointer-events-none absolute"
      style={{
        inset: `${orbit.inset}%`,
        transformStyle: "preserve-3d",
        transform: `rotateX(${orbit.tiltX}deg) rotateZ(${orbit.tiltZ}deg)`,
        // Tipped away from us, the near half of the orbit is the lower half
        // of the ellipse. The far half is left unclipped and simply painted
        // under the sphere, which occludes it exactly as a solid should.
        clipPath: near ? "inset(50% -50% -50% -50%)" : undefined,
      }}
    >
      <div
        className="orb-orbit absolute inset-0 rounded-full"
        style={{
          border: `1px solid ${palette.halo}${near ? "5c" : "2e"}`,
          transformStyle: "preserve-3d",
          animation: `orb-orbit-spin ${orbit.period * palette.tempo}s linear infinite${
            orbit.direction < 0 ? " reverse" : ""
          }`,
        }}
      >
        {/* The travelling spark, counter-rotated out of the tip so it stays a
            round dot instead of being squashed into a lozenge. */}
        <div
          className="absolute rounded-full"
          style={{
            left: "50%",
            top: 0,
            width: sparkSize,
            height: sparkSize,
            marginLeft: -sparkSize / 2,
            marginTop: -sparkSize / 2,
            background: `radial-gradient(circle, #ffffff 0%, ${palette.core} 45%, ${palette.halo}00 75%)`,
            boxShadow: `0 0 ${size * 0.06}px ${palette.core}cc`,
            // Dimmer on the far side: it is behind the glass from here.
            opacity: near ? 0.95 : 0.5,
            transform: `rotateZ(${-orbit.tiltZ}deg) rotateX(${-orbit.tiltX}deg)`,
          }}
        />
      </div>
    </div>
  );

  return (
    <div className={cn("inline-flex flex-col items-center", className)}>
      <div
        ref={stageRef}
        role="img"
        aria-label={accessibleName}
        className="relative grid place-items-center"
        style={{ width: size, height: size, perspective: size * 2.6 }}
        onPointerMove={handlePointerMove}
        onPointerLeave={settle}
        onPointerDown={() => leans && setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={settle}
      >
        {/* 1 — bloom. Behind everything, and the only part allowed to spill
            outside the sphere's bounds. It sits outside the leaning assembly:
            light thrown onto the background does not swing about when the
            object it came from turns a few degrees. */}
        <div
          className="orb-halo pointer-events-none absolute inset-[-22%] rounded-full"
          style={{
            background: `radial-gradient(circle, ${palette.halo}80 0%, ${palette.halo}2b 42%, ${palette.halo}00 70%)`,
            filter: metrics.haloBlur,
            animation: `orb-halo ${7 * palette.tempo}s ease-in-out infinite`,
          }}
        />
        {/* A tighter, brighter second bloom on an unrelated period. One glow
            pulses; two glows breathe. */}
        <div
          className="orb-halo pointer-events-none absolute inset-[-8%] rounded-full"
          style={{
            background: `radial-gradient(circle, ${palette.core}55 0%, ${palette.halo}22 46%, ${palette.halo}00 68%)`,
            filter: metrics.bloomBlur,
            animation: `orb-bloom ${4.3 * palette.tempo}s ease-in-out infinite`,
          }}
        />

        {/* The leaning assembly. Everything with real geometry lives in here,
            sharing one perspective so the orbits and the ball turn together. */}
        <div
          className="relative"
          style={{
            width: size,
            height: size,
            transformStyle: "preserve-3d",
            transform: [
              `rotateX(${(-lean.y * MAX_TILT_DEG).toFixed(2)}deg)`,
              `rotateY(${(lean.x * MAX_TILT_DEG).toFixed(2)}deg)`,
              `scale(${pressed ? 0.965 : 1})`,
            ].join(" "),
            transition: LEAN_EASING,
          }}
        >
          {/* 2 — the far halves of the orbits, under the ball. */}
          {ORBITS.map((orbit, i) => renderOrbit(orbit, i, false))}

          {/* 3 — the sphere. overflow-hidden is the circular clip that keeps
              the liquid inside the ball. */}
          <div
            className="relative overflow-hidden rounded-full"
            style={{
              width: size,
              height: size,
              // Deep, near-black violet — NOT a light lavender. The blobs are
              // screen-blended, and screen only adds light: over a pale base
              // every colour washes out to the same milky mauve (which is
              // exactly what the first version of this did). On a dark base
              // the same blobs read as saturated light inside glass, which is
              // the whole effect.
              background:
                "radial-gradient(ellipse 88% 88% at 34% 26%, #6A51AE 0%, #422A80 44%, #291653 76%, #1D1040 100%)",
              animation: `orb-breathe ${5.5 * palette.tempo}s ease-in-out infinite`,
            }}
          >
            {/* The liquid, moved as a group, so the lean can parallax all of
                it at once without disturbing the individual sweeps. */}
            <div
              className="absolute inset-0"
              style={{
                transform: `translate3d(${(lean.x * 3.5).toFixed(2)}%, ${(lean.y * 3.5).toFixed(2)}%, 0)`,
                transition: LEAN_EASING,
              }}
            >
              {palette.blobs.map((color, i) => (
                <div
                  key={`${color}-${i}`}
                  className="orb-blob absolute rounded-full"
                  style={{
                    // Roughly three-quarters of the sphere, centred. Small
                    // enough that the three keep separate lobes as they
                    // sweep, large enough that a lobe at full extent still
                    // reaches the rim.
                    inset: "12%",
                    background: `radial-gradient(circle at 50% 50%, ${color} 0%, ${color}f2 30%, ${color}80 52%, ${color}00 72%)`,
                    filter: metrics.blobBlur,
                    // All three add light to the dark base. Screen is what
                    // makes overlaps brighten into a new hue instead of one
                    // blob simply occluding another — that is the liquid.
                    mixBlendMode: "screen",
                    animation: `${BLOB_KEYFRAMES[i]} ${BLOB_PERIODS[i] * palette.tempo}s linear infinite`,
                    willChange: "transform",
                  }}
                />
              ))}

              {/* 4 — the core. */}
              <div
                className="orb-core absolute rounded-full"
                style={{
                  left: "34%",
                  top: "31%",
                  width: "30%",
                  height: "30%",
                  // Screen-blended, so a white centre here comes out as pure
                  // white and bleaches the middle of the ball. The nucleus is
                  // the palette's own brightest note instead — it reads as hot
                  // without reading as a hole.
                  background: `radial-gradient(circle at 50% 50%, ${palette.core} 0%, ${palette.core}cc 38%, ${palette.core}55 60%, ${palette.core}00 78%)`,
                  filter: metrics.coreBlur,
                  mixBlendMode: "screen",
                  animation: `orb-core-pulse ${3.7 * palette.tempo}s ease-in-out infinite`,
                }}
              />
            </div>

            {/* Terminator: the shadowed side of the ball, opposite the light.
                It sits ON TOP of the liquid so colour genuinely falls off into
                the dark rather than glowing right up to the edge — the single
                biggest cue that this is a lit sphere and not a coloured disc. */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background:
                  // An explicit 88% radius rather than the default corner
                  // sizing: from an off-centre light, "farthest corner" puts
                  // 100% at roughly 2r and the falloff never arrives inside
                  // the ball at all. At 88% of the box the far rim lands
                  // around the 0.72 stop, which is the intent — lit rim near
                  // the lamp, deep shadow opposite it.
                  "radial-gradient(ellipse 88% 88% at 30% 24%, rgba(16,8,38,0) 30%, rgba(16,8,38,0.30) 62%, rgba(16,8,38,0.72) 90%, rgba(16,8,38,0.84) 100%)",
              }}
            />

            {/* 6a — the refracting rim. backdrop-filter blurs whatever is
                behind this element; the mask restricts that to an annulus, so
                the liquid smears only where you are looking through the
                thickest glass. This is the load-bearing half of the
                glassmorphism — everything else is highlights. */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                backdropFilter: metrics.rimRefraction,
                WebkitBackdropFilter: metrics.rimRefraction,
                maskImage: metrics.rimMask,
                WebkitMaskImage: metrics.rimMask,
                background:
                  "radial-gradient(circle at 50% 50%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.08) 88%, rgba(255,255,255,0.16) 100%)",
              }}
            />

            {/* 6b — the frosted face: the near wall of the shell catching the
                sky. Deliberately faint. An earlier pass ran this at 34% across
                half the ball and the result was a milky plastic marble —
                every white layer here costs saturation in the liquid
                underneath, which is the part worth looking at. */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background:
                  "linear-gradient(147deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.06) 22%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 100%)",
              }}
            />

            {/* 6c — the sheen: a soft diagonal band of light travelling across
                the face on a long period, the way a window reflection crosses
                glass as you turn it in your hand. */}
            <div
              className="orb-sheen pointer-events-none absolute rounded-full"
              style={{
                inset: "-30%",
                background:
                  "linear-gradient(102deg, rgba(255,255,255,0) 38%, rgba(255,255,255,0.16) 48%, rgba(255,255,255,0.04) 54%, rgba(255,255,255,0) 62%)",
                mixBlendMode: "screen",
                animation: `orb-sheen ${11 * palette.tempo}s ease-in-out infinite`,
              }}
            />

            {/* 6d — grain. Real glass is never optically perfect, and a
                gradient with no texture at all is the thing the eye calls
                "rendered". At 5% over soft-light it never registers as
                texture, only as material. */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                backgroundImage: GLASS_GRAIN,
                backgroundSize: `${Math.round(size * 0.8)}px ${Math.round(size * 0.8)}px`,
                opacity: 0.05,
                mixBlendMode: "soft-light",
              }}
            />

            {/* 5 — shading. The layer that makes it a ball. */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ boxShadow: metrics.shading }}
            />

            {/* 6e — the Fresnel rim. Glass turns fully reflective at grazing
                angles, which on a sphere means a bright hairline right at the
                silhouette, all the way round, wherever the lamp happens to be.
                It goes ON TOP of the shading, and that ordering is the whole
                point: the rim reads brightest exactly where the body is
                darkest. Painted underneath — which is where it started — the
                deep inset shadow swallowed it along the entire shadow side and
                the ball went back to looking like plastic. */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background:
                  // A hairline, not a band. Run it from 74% and the ball wears
                  // a wide grey collar and reads as frosted plastic; the
                  // effect only works while it stays thin enough to be an
                  // edge.
                  "radial-gradient(circle closest-side at 50% 50%, rgba(255,255,255,0) 88%, rgba(255,255,255,0.10) 93%, rgba(255,255,255,0.66) 98%, rgba(255,255,255,0.30) 100%)",
                mixBlendMode: "screen",
              }}
            />

            {/* 6f — dispersion. Glass splits the light it bends, so the rim
                runs cyan through magenta to gold as you travel round it. A
                conic gradient masked to the outermost few percent does it in
                one element; at 32% over screen it never announces itself as
                colour, only as expensive. */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background:
                  "conic-gradient(from 205deg, rgba(34,211,238,0) 0deg, rgba(34,211,238,0.85) 45deg, rgba(167,139,250,0.85) 120deg, rgba(244,114,182,0.80) 190deg, rgba(252,211,77,0.75) 260deg, rgba(34,211,238,0) 335deg)",
                maskImage: metrics.dispersionMask,
                WebkitMaskImage: metrics.dispersionMask,
                filter: metrics.dispersionBlur,
                mixBlendMode: "screen",
                opacity: 0.32,
              }}
            />

            {/* 7 — speculars, moved against the lean because the lamp stays
                where it is when the object turns. */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                transform: `translate3d(${(-lean.x * 7).toFixed(2)}%, ${(-lean.y * 7).toFixed(2)}%, 0)`,
                transition: LEAN_EASING,
              }}
            >
              {/* The broad, soft one: the sky rather than the lamp. */}
              <div
                className="pointer-events-none absolute rounded-full"
                style={{
                  left: "11%",
                  top: "6%",
                  width: "50%",
                  height: "37%",
                  background:
                    "radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0) 76%)",
                  filter: metrics.softSpecularBlur,
                }}
              />

              {/* The sharp one, up and left to agree with the rim. */}
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

              {/* The caustic: light that went in at the top left, crossed the
                  sphere and came to a focus just inside the far rim. It is why
                  a glass ball on a windowsill has a bright spot low on the
                  side away from the window, and it is what stops the shadowed
                  half from going dead. Angled to lie along the rim rather than
                  across it. */}
              <div
                className="pointer-events-none absolute"
                style={{
                  right: "7%",
                  bottom: "11%",
                  width: "44%",
                  height: "25%",
                  transform: "rotate(-38deg)",
                  background:
                    "radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.13) 42%, rgba(255,255,255,0) 72%)",
                  filter: metrics.causticBlur,
                  mixBlendMode: "screen",
                }}
              />
            </div>
          </div>

          {/* 2b — the near halves of the orbits, painted after the sphere so
              they cross in front of it. */}
          {ORBITS.map((orbit, i) => renderOrbit(orbit, i, true))}
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
