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
import { join, resolve } from "node:path";

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

describe("PROD — SPA routing", () => {
  const vercelConfig = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as {
    rewrites?: { source: string; destination: string }[];
  };

  // ------------------------------------------------------------------------
  // The bug: vercel.json declared buildCommand and outputDirectory explicitly
  // and no rewrites, so Vercel's Vite SPA fallback did not apply. Every
  // direct navigation and every refresh below "/" returned Vercel's own
  // 404: NOT_FOUND page — including /auth/sign-in, which is where a Google
  // redirect sign-in comes BACK to.
  // ------------------------------------------------------------------------
  it("declares a catch-all rewrite to index.html", () => {
    const rewrite = vercelConfig.rewrites?.[0];
    expect(rewrite).toBeDefined();
    expect(rewrite!.destination).toBe("/index.html");
  });

  it("rewrites app routes but never API routes or hashed assets", () => {
    const source = vercelConfig.rewrites![0].source;
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
