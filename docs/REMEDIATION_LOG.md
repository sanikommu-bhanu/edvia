# EDVIA — Remediation Log

Record of the security and quality remediation carried out after the
internal jury/red-team audit. Every entry states what was wrong, what
changed, and how it was verified.

**Rule applied throughout:** nothing is recorded as fixed unless a test or a
command output proves it. Items that could not be verified in this
environment are listed as such in §7 rather than claimed.

---

## 1. Baseline (before any change)

| Check | Result |
|---|---|
| `git rev-parse --short HEAD` | `87b6c35` |
| `npm run typecheck` | PASS (3 projects) |
| `npm run lint` | PASS (0 warnings) |
| `npm test` | 220 passed, 1 skipped, 7 files |
| `npm run build` | PASS |
| `npm audit --omit=dev` | **10 moderate** |
| Firestore rules tests | **Not runnable** — emulator needs Java, not installed |

---

## 2. CRIT-01 — Self-declared principal (CRITICAL)

### The defect

Any member of the public could obtain a school's entire student roster and
attendance history:

1. Sign up, choosing **"Principal / Admin"** on the role-selection screen
   (`src/config/roles.ts`).
2. `signUp()` wrote that role verbatim into `users/{uid}`.
3. `firestore.rules`' `users` **create** rule blocked `studentId`,
   `linkedStudentIds`, `teacherId` and `classIds` — but **not `role`**.
4. Select any school (the picker lists all schools by design).
5. The invite-code screen told principals *"Principal accounts don't need an
   invite code — your school access is already linked."*
6. `Permissions.tsx` set `onboardingComplete: true`.
7. Every principal capability then passed, because each checked
   `ctx.role === "principal"` — a value the client had chosen.

The README's headline claim — *"authorization is decided from a verified
Firebase ID token"* — was true of the token and false of the role inside it.

### Why the test suite missed it

`SPOOF-01..04` covered a user **claiming** a role in conversation, which was
never the real risk: the claim is text, and `ctx.role` already contradicted
it. Nothing covered a user **registering** as one.

### The fix — `role` is a request, `principalOfSchoolId` is the grant

| Layer | Change |
|---|---|
| Profile | New server-written field `principalOfSchoolId` (`src/types/index.ts`) |
| Grant | `api/onboarding/redeem-invite.ts` writes it, only against a valid, unused, school-matched principal code, inside the existing transaction |
| Identity | `resolveUserContext()` **refuses to issue a context** for `role: "principal"` unless `principalOfSchoolId === schoolId`, and for `role: "teacher"` unless `teacherId === uid` |
| Tools | New single predicate `isVerifiedManagement(ctx)`; every school-wide branch uses it |
| Rules | `isPrincipalOf()` now reads `principalOfSchoolId`, not `role` |
| Rules | `principalOfSchoolId` added to the `unchanged()` update guard **and** the create-block list |
| Rules | `schoolAnalytics` switched from an inline `myRole() == 'principal'` to `isPrincipalOf()` |
| UI | Invite code is now **mandatory** for teacher and principal; the "you don't need a code" copy is gone |

### Two further instances found by the new tests

Writing the regression tests surfaced two more places the audit had **not**
identified, where `role === "principal"` alone still granted access:

* **`getClassAttendance.authorize`** — `ctx.role === "principal" || …` let an
  unverified principal read any class in the school.
* **`resolveSubjectStudent`** — the principal branch passed `undefined` as
  the class scope, meaning "search the whole school", so an unverified
  principal could resolve any pupil by name.

Both now route through `isVerifiedManagement()`. This is why the predicate
lives in one exported function rather than being repeated inline: a new
principal-scoped tool cannot reintroduce the hole by writing the easy check.

### Verification

```
tests/authorization.test.ts  → 8 new assertions (Self-declared principal, Forged grant)
tests/evalCases.ts           → SPOOF-05..09, all deny
scripts/testRules.mjs        → 12 new assertions (direct-Firestore path + grant immutability)
```

`npm test` → **257 passed**. Rules assertions written but **not executed**
(see §7).

---

## 3. CRIT-02 / SEC-03 — SSRF in document fetch (CRITICAL)

### Three defects in `api/ai/document.ts`

1. **Fail-open.** `if (cloudName && !fileUrl.includes(...))` — with
   `CLOUDINARY_CLOUD_NAME` unset the guard was skipped entirely and the
   server would `fetch()` **any** URL, including cloud metadata endpoints.
2. **Substring host matching.** `fileUrl.includes("res.cloudinary.com/<cloud>/")`
   matches anywhere in the string, so
   `https://evil.example/?x=res.cloudinary.com/mycloud/` passed.
3. **Conditional ownership.** The per-user folder check only ran
   `if (fileUrl.includes("/schools/"))`, and the upload folder is a
   client-supplied form field — omitting it removed the check.

### The fix

New module `api/_lib/documentSource.ts`, so the rules are testable in
isolation:

* Refuses everything when `CLOUDINARY_CLOUD_NAME` is unset (**fails closed**)
* `new URL()` parsing — host must **equal** `res.cloudinary.com`
* HTTPS only
* First path segment must equal the configured cloud account
* Ownership prefix check is **unconditional**
* Endpoint additionally enforces: `AbortController` timeout (15 s),
  `redirect: "error"`, `Content-Length` pre-check, real byte-length check
  after buffering (10 MB), and served-vs-declared content-type match

Parsed-host validation inherently excludes `localhost`, `127.0.0.1`,
`169.254.169.254` and private ranges — no IP blocklist to maintain.

### Verification

`tests/documentSource.test.ts` — **15 assertions**, including the exact
substring bypass, userinfo-prefixed authority, metadata endpoints, and a
file uploaded with no folder.

---

## 4. SEC-05 — No rate limiting

Any authenticated user could loop `/api/ai/chat` and exhaust the school's
Gemini quota.

New `api/_lib/rateLimit.ts`, applied to all five authenticated routes.

| Bucket | Limit | Window |
|---|---:|---:|
| `ai_chat` | 30 | 60 s |
| `tool_call` | 120 | 60 s |
| `voice_session` | 12 | 300 s |
| `document` | 15 | 3600 s |
| `redeem_invite` | 8 | 600 s |

**Design decisions, stated because they are trade-offs:**

* **Firestore, not an in-memory Map.** Vercel functions are stateless and
  horizontally scaled; a module-level counter would give an effective limit
  of (limit × instances) and reset on every cold start. Firestore is already
  a dependency — **no new package or service was added**.
* **Fixed window, not sliding.** One document write per request instead of a
  read of recent timestamps. Known trade-off: up to 2× burst across a window
  boundary, which the limits account for.
* **Fails open.** If Firestore is unavailable the request is allowed. Rate
  limiting is abuse protection, not authorization — no security decision
  depends on it, and turning a cost control into an outage would be worse.
  **Authorization always fails closed; this deliberately does not.**

Counters live in `rateLimits/{uid}_{bucket}_{window}`, denied to clients in
both directions by `firestore.rules`.

**Verification:** `tests/rateLimit.test.ts` — 7 assertions (limit enforced,
countdown accurate, user isolation, bucket isolation, message hygiene).

Fixing these tests required making the test double faithful: the fake
Firestore silently dropped `FieldValue.increment()`, storing the sentinel
object instead of incrementing. It now applies the sentinel — a double that
drops a write primitive is worse than no double.

---

## 5. SEC-06 — Voice confirmation replay / expiry

The pending confirmation had no expiry, so an offer made at the start of a
long voice session could be satisfied by a "yes" many minutes later, about a
record whose value had since changed.

* `PendingConfirmation.expiresAt` added; **2-minute** TTL
* Enforced in `api/ai/tool-call.ts` (voice) and `api/_lib/orchestrator.ts` (text)
* Stale offers are consumed on rejection so they cannot linger
* Already single-use: the offer is cleared **before** the tool runs

**Honesty correction.** The previous comment claimed a tampered client could
not skip confirmation. That was overstated, and the header now says what the
gate actually proves: the model cannot act unilaterally, arguments cannot be
swapped between preview and execution, offers cannot be replayed or reused
across users. It **cannot** prove a human spoke — an authenticated user
controls their own client. That is an acceptable boundary because everything
reachable this way is already authorized for that caller; the gate exists to
stop the LLM acting without asking, not to defend against the account owner.

**Verification:** 2 new assertions in `tests/orchestrator.test.ts`.

---

## 6. Other changes

| Item | Change | Verification |
|---|---|---|
| Phone login | UI promised "Email or Phone Number" but `signInWithEmailAndPassword` could never honour it. Removed; email-only | typecheck + build |
| Dead social buttons | Three permanently-disabled Google/Apple/Microsoft buttons removed; unused `signInWithGoogle` deleted | lint (no unused imports) |
| Form accessibility | Sign-in/sign-up fields had **no labels at all** (0 `htmlFor` app-wide). Added `sr-only` labels, `type="email"`, `autoComplete`, and an `aria-label` on the password toggle | `sr-only` present in built CSS |
| Upload validation | Client-side MIME/size checks with specific messages, mirroring the server's | typecheck |
| `react-router-dom` | 6.30.4 → **7.18.2**. Fixes 2 advisories (open redirect, deserializeErrors). All 10 router APIs used are declarative-mode and unchanged in v7 | typecheck, lint, 257 tests, build |
| `firebase-admin` | **Deliberately NOT upgraded** — see §7 | — |

---

## 6b. Multilingual UI (audit finding UX-01)

The audit found the interface was **100% English** despite an eleven-language
promise — selecting Kannada changed only the AI's reply language. A judge
choosing Tamil and seeing an English app would notice immediately.

**Implemented:** `src/i18n/` — a plain dictionary, **no new dependency**.
react-i18next would add ~40 kB and a plugin surface to solve what
`Record<Key, string>` already solves; `Intl` (in the platform) covers dates
and numbers.

* All 11 languages, ~45 keys: navigation, common actions, state messages,
  the AI surface, attendance vocabulary, settings
* Language comes from `users/{uid}.language` — the **same field** the server
  reads to pick the reply language, so interface and assistant cannot disagree
* Fallback is **per key**, not per language, so a partial locale degrades one
  label at a time
* `<html lang>` and `<html dir>` are set from it; **Urdu renders RTL**
* Wired into `BottomNav`, `StateViews` (every data screen's loading / error /
  retry), `AiChat`, `AssistantHome` and the avatar's status labels

**Deliberately not translated**, and documented rather than faked:

* School **content** — notice bodies, assignment titles, teacher and class
  names. It is written by the school and stored in Firestore; machine-
  translating a principal's notice would be worse than showing it as written.
* Connection lifecycle labels ("Voice mode ended") — brief, rarely seen.

**Verification:** `tests/i18n.test.ts` — 8 assertions including a
Unicode-block check per language, so a locale cannot silently be English
copied into a new key.

## 6c. Reduced motion (audit finding)

`globals.css` neutralises CSS animations under
`prefers-reduced-motion: reduce`, but the EDVIA robot's beacon, eye and core
animations are **SVG SMIL `<animate>` elements**, which CSS
`animation-duration` does not govern. They kept running at full speed.

New `src/hooks/useReducedMotion.ts` reads the preference in JS (and responds
to it changing mid-session). The animating elements are **not rendered** when
it is set; the avatar still changes colour, expression and halo opacity per
state, it simply stops moving.

---

## 7. Not fixed, and why

Stated plainly rather than quietly omitted.

### 8 moderate npm advisories remain

All in the `firebase-admin` transitive tree: `@google-cloud/firestore`,
`@google-cloud/storage`, `gaxios`, `google-gax`, `retry-request`,
`teeny-request`, `uuid`.

The only fix npm offers is **firebase-admin 14**, which declares
`engines: { node: ">=22" }`. This project's `vercel.json` does not pin a Node
runtime, so the deployment could be on Node 20 — where firebase-admin 14
would fail to start. **I could not verify the deployment's Node version**, so
upgrading would have risked replacing 8 moderate advisories with a total
outage.

firebase-admin **13.10.0** (`node >=18`) was installed and verified —
typecheck, 257 tests and build all passed — but it does **not** clear any of
the advisories. Since it offered no security benefit and carried
unverifiable runtime risk on the core data SDK days before a submission, it
was reverted to 12.7.0.

**Exploitability in this project:** the `uuid` issue requires a caller-supplied
`buf` argument, which firebase-admin does not use. The `gaxios` /
`teeny-request` / `retry-request` issues concern redirect and proxy handling
in the Google API HTTP client; EDVIA never passes user input into a Google
API client URL. None is reachable from user input on any EDVIA route.

**Recommended follow-up:** pin `nodejs22.x` in the Vercel project settings,
confirm the functions boot, then upgrade to firebase-admin 14 and re-run
`npm audit`.

### Firestore rules assertions are written but unexecuted

`scripts/testRules.mjs` now contains **69 assertions** (was 57), including 12
new ones for CRIT-01. The Firestore emulator is a JVM process and **Java is
not installed in this environment** (`java: command not found`), so they have
not been run here. To run them:

```bash
firebase emulators:exec --only firestore "node scripts/testRules.mjs"
```

### Not verified at runtime

* The golden demo — no Firebase service account is configured locally
  (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` are
  all empty), so `npm run seed` cannot run.
* Voice — needs a browser and a live Gemini key.
* React Router 7 — verified by typecheck, lint, full test suite and build,
  and by confirming every router API in use is declarative-mode. **Not**
  verified by loading the app in a browser.

---

## 8. Final state

| Check | Before | After |
|---|---|---|
| `npm run typecheck` | PASS | PASS |
| `npm run lint` | PASS | PASS |
| `npm test` | 220 passed | **265 passed**, 1 skipped |
| Test files | 7 | 10 |
| AI evaluation cases | 71 | **76** (64 offline, 12 live) |
| Firestore rules assertions | 57 | **69** (unexecuted) |
| `npm run build` | PASS | PASS |
| `npm audit --omit=dev` | 10 moderate | **8 moderate** (all documented) |
| Self-declared principal reads school | **YES** | **NO** — refused at 3 independent layers |
| SSRF via document endpoint | **YES** when unconfigured | **NO** — fails closed |
| Rate limiting | none | 5 routes |
| UI languages | 1 (English) | **11**, RTL-aware |
| Reduced motion honoured by avatar | **NO** (SMIL) | **YES** |
