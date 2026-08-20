// ==========================================================================
// Production invariants
// --------------------------------------------------------------------------
// Every assertion in this file exists because the thing it checks was ACTUALLY
// broken on the deployed URL while typecheck, lint, tests and `vite build` all
// passed locally. That combination — green everywhere, dead in production — is
// what this file is for.
//
// These are deliberately checks on the repository rather than on behaviour:
// the failures they catch happen in Vercel's runtime and Vercel's router,
// neither of which is reachable from a test process.
// ==========================================================================
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const ROOT = resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("PROD — serverless functions can actually be loaded", () => {
  // ------------------------------------------------------------------------
  // The bug: package.json sets "type": "module", so Vercel runs api/ as real
  // Node ESM. Node ESM has NO extension resolution — `import "../_lib/foo"`
  // is a literal path to a file that does not exist. Every route 500'd with
  // ERR_MODULE_NOT_FOUND on its first invocation.
  //
  // Nothing local caught it: tsc under "bundler" resolution accepted the
  // extensionless form, and vitest resolves it through Vite. tsconfig.api.json
  // now uses NodeNext so tsc enforces this too; this test states the rule
  // independently, so relaxing that tsconfig cannot silently un-fix it.
  // ------------------------------------------------------------------------
  it("every relative import inside api/ carries an explicit .js extension", () => {
    const offenders: string[] = [];

    for (const file of walk(join(ROOT, "api"))) {
      const source = readFileSync(file, "utf8");
      // Matches static imports, re-exports and `import type` alike.
      const pattern = /(?:from|import)\s+"(\.[^"]*)"/g;
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        if (!specifier.endsWith(".js") && !specifier.endsWith(".json")) {
          offenders.push(`${file.slice(ROOT.length + 1)} → ${specifier}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

interface VercelConfig {
  rewrites?: { source: string; destination: string }[];
}

const vercelConfigForBudget = JSON.parse(
  readFileSync(join(ROOT, "vercel.json"), "utf8")
) as VercelConfig;

describe("PROD — SPA routing", () => {
  const vercelConfig = vercelConfigForBudget;

  // ------------------------------------------------------------------------
  // The bug: vercel.json declared buildCommand and outputDirectory explicitly
  // and no rewrites, so Vercel's Vite SPA fallback did not apply. Every
  // direct navigation and every refresh below "/" returned Vercel's own
  // 404: NOT_FOUND page — including /auth/sign-in, which is where a Google
  // redirect sign-in comes BACK to.
  // ------------------------------------------------------------------------
  it("declares a catch-all rewrite to index.html, and declares it LAST", () => {
    const rewrites = vercelConfig.rewrites ?? [];
    const index = rewrites.findIndex((r) => r.destination === "/index.html");
    expect(index, "no rewrite targets /index.html").toBeGreaterThanOrEqual(0);

    // Vercel takes the FIRST matching rewrite, so the catch-all has to be
    // last: the onboarding rewrites above it point five public API paths at
    // the single dispatching function, and a catch-all placed ahead of them
    // would swallow those paths and answer them with index.html.
    expect(index, "the catch-all must be the last rewrite").toBe(rewrites.length - 1);
  });

  it("rewrites app routes but never API routes or hashed assets", () => {
    const source = vercelConfig.rewrites!.find((r) => r.destination === "/index.html")!.source;
    // Vercel anchors `source` at both ends against the pathname.
    const matcher = new RegExp(`^${source}$`);

    for (const path of [
      "/",
      "/welcome",
      "/auth/sign-in",
      "/join",
      "/join/abc123_-XYZ",
      "/school/create",
      "/principal/invites",
      "/teacher/attendance/cls_10a",
      "/ai/voice",
    ]) {
      expect(matcher.test(path), `${path} should reach the SPA`).toBe(true);
    }

    for (const path of [
      // Rewriting these would turn a real 401 into an HTML page.
      "/api/ai/chat",
      "/api/invites/redeem",
      // Rewriting these is worse: a stale chunk request would be answered
      // with index.html, which the browser rejects as a module — the exact
      // failure lazyWithRetry exists to convert into a message rather than
      // an infinite spinner.
      "/assets/index-BKeSYXve.js",
      "/assets/firebase-xUrGjzDq.js",
    ]) {
      expect(matcher.test(path), `${path} must NOT be rewritten`).toBe(false);
    }
  });
});

describe("PROD — the Serverless Function budget", () => {
  // ------------------------------------------------------------------------
  // The bug: Vercel's Hobby plan caps a project at 12 Serverless Functions,
  // counted as files under api/ (excluding api/_lib/, which is imported
  // rather than routed). Exceeding it fails the DEPLOYMENT, not the build —
  // so typecheck, lint, tests and `vite build` all pass and the push is
  // rejected. It has happened twice: once when onboarding grew to five
  // routes, and again when grades and the support inbox added four more.
  //
  // Both times the fix was the same: one dispatching function per domain
  // (api/onboarding/actions.ts, api/school/actions.ts) with vercel.json
  // rewriting the public paths onto it, so the URLs the client calls never
  // change. This test states the budget so the next route to be added trips
  // a red test locally instead of a failed deploy.
  // ------------------------------------------------------------------------
  const VERCEL_HOBBY_FUNCTION_LIMIT = 12;

  function routeFiles(): string[] {
    return walk(join(ROOT, "api"))
      .map((f) => f.slice(ROOT.length + 1).split(sep).join("/"))
      // api/_lib/ is library code: imported by routes, never routed to.
      .filter((f) => !f.startsWith("api/_lib/"));
  }

  it("stays within Vercel's 12-function limit", () => {
    const files = routeFiles();
    const detail = `too many functions (${files.length}): ${files.join(", ")}`;
    expect(files.length, detail).toBeLessThanOrEqual(VERCEL_HOBBY_FUNCTION_LIMIT);
  });

  it("routes every rewritten public path to a dispatcher that exists", () => {
    const rewrites = (vercelConfigForBudget.rewrites ?? []).filter(
      (r) => r.destination.startsWith("/api/")
    );
    expect(rewrites.length).toBeGreaterThan(0);

    const existing = new Set(routeFiles());
    for (const rewrite of rewrites) {
      const path = rewrite.destination.split("?")[0].replace(/^\//, "") + ".ts";
      expect(existing.has(path), `${rewrite.source} → ${path} does not exist`).toBe(true);
    }
  });

  it("gives every dispatcher rewrite an ?action= the dispatcher declares", () => {
    for (const rewrite of vercelConfigForBudget.rewrites ?? []) {
      const [target, query] = rewrite.destination.split("?");
      if (!target.endsWith("/actions")) continue;

      const action = new URLSearchParams(query ?? "").get("action");
      expect(action, `${rewrite.source} has no ?action=`).toBeTruthy();

      // The dispatcher's ROUTES map is the source of truth. A rewrite naming
      // an action it does not declare would 400 in production only.
      const source = readFileSync(join(ROOT, target.replace(/^\//, "") + ".ts"), "utf8");
      const routesBlock = source.slice(source.indexOf("const ROUTES"));
      expect(routesBlock.includes(`${action}:`), `${target} declares no "${action}" action`).toBe(
        true
      );
    }
  });
});

describe("PROD — secrets never reach the browser bundle", () => {
  // Vite inlines any import.meta.env.VITE_* value into the shipped JavaScript.
  // A server secret read through that prefix is published, not configured.
  const SERVER_ONLY = [
    "GEMINI_API_KEY",
    "FIREBASE_PRIVATE_KEY",
    "FIREBASE_CLIENT_EMAIL",
    "CLOUDINARY_API_SECRET",
  ];

  it("no server-only credential is read from src/", () => {
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, "src"))) {
      const source = readFileSync(file, "utf8");
      for (const name of SERVER_ONLY) {
        // Both the bare name and the VITE_-prefixed form: the prefixed form
        // is the dangerous one, and the bare form cannot work in a browser
        // anyway, so either is a mistake worth failing on.
        if (source.includes(`VITE_${name}`) || source.includes(`env.${name}`)) {
          offenders.push(`${file.slice(ROOT.length + 1)} → ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the example env file documents the client/server split", () => {
    const example = readFileSync(join(ROOT, ".env.example"), "utf8");
    // A VITE_-prefixed Gemini key would be the single easiest way to publish
    // a paid credential to every visitor, so it must not be suggested.
    expect(example).not.toMatch(/^VITE_GEMINI_API_KEY=/m);
    for (const name of ["GEMINI_API_KEY", "FIREBASE_PRIVATE_KEY", "FIREBASE_CLIENT_EMAIL"]) {
      expect(example).toMatch(new RegExp(`^${name}=`, "m"));
    }
  });
});
