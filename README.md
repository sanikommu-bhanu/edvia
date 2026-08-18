# EDVIA — AI-Powered School Companion

**Smarter Schooling. Stronger Together.**

This is the **Prompt 1** deliverable: complete product foundation and UI/UX for
EDVIA, ready for the AI intelligence layer (Prompt 2) and final integration/
hardening (Prompt 3).

## Getting started

```bash
npm install
cp .env.example .env.local   # optional — the app runs on mock data without this
npm run dev
```

Open the printed local URL. The app is mobile-first — use your browser's
device toolbar (375–430px width) for the intended experience, though every
screen is responsive up to desktop.

**Demo sign-in:** on the Sign In screen, use `henryjames@example.com` with
any password to drop straight into a fully-seeded student account. Or tap
**Sign Up** to create a new account for any of the four roles.

## What's implemented

- Full onboarding → role selection → auth → school selection → language
  selection → EDVIA intro → permissions flow
- Sign in / sign up / forgot password / OTP verification, all functional
  against a local mock backend
- Four complete role experiences: **Student, Parent, Teacher, Principal**,
  each with its own dashboard, navigation, and screens per the spec
  (classes, assignments, exams, attendance incl. teacher's mark-attendance
  flow, analytics with real charts, etc.)
- Shared screens: Calendar, Notice Board, Resources, Notifications, Profile,
  Support/Escalation Center
- Full AI experience UI: assistant home, chat, immersive voice mode with all
  8 agent states (idle/listening/thinking/processing/tool_execution/
  speaking/success/error) wired into a shared `EdviaRobot` component,
  response/sources screen, and document scanning UI
- Real browser permission requests (camera/mic/notifications) — nothing is
  faked
- A clean service layer (`src/services/`) so every screen already reads and
  writes through an abstraction that's a drop-in swap for real Firebase/
  Cloudinary/Gemini calls

## What's intentionally a placeholder (by design, per spec)

- **AI reasoning**: `src/services/ai/ai.service.ts` returns a clearly-labeled
  placeholder response. Prompt 2 replaces its body with real Gemini calls,
  function calling, and the tool registry — the chat/voice UI never claims
  intelligence it doesn't have.
- **Firebase/Cloudinary**: services fall back to a realistic local mock
  (`src/services/mockDb.ts`, backed by `localStorage`) when no project
  credentials are configured, so the whole app is clickable today. Swap in
  real Firestore/Storage calls without touching any component.
- **Voice mode**: UI and state machine are complete; actual audio streaming
  (Gemini Live) connects in Prompt 2.

## Architecture

```
src/
  app/            AuthContext, global CSS
  components/ui/  Button, Input, Card, Badge, Tabs, Avatar, ProgressBar
  components/shared/  EdviaRobot, SubjectIcon, StatCard, EmptyState
  layouts/        RoleShell, BottomNav, TopBar
  pages/          onboarding, auth, setup, student, parent, teacher,
                   principal, shared, ai
  services/       firebase/, cloudinary/, ai/, + one file per domain
                   (school, attendance, assignments, exams, notices,
                   resources, notifications, calendar, support)
  types/          single source of truth for every data shape
  config/         languages, roles, nav
```

Business logic stays in `services/`; components only render and call
services. Every service function's signature is written to match what a
Firestore/Cloudinary/Gemini-backed implementation would look like, so Prompt
2/3 is a matter of filling in bodies, not restructuring.

## Prompt 2 — AI intelligence layer

The AI orchestration layer now lives under `api/` as Vercel serverless
functions (Node runtime) — this is required, not optional: `GEMINI_API_KEY`
must never reach the browser, and identity/role/school/child-linkage must
be derived from a verified Firebase ID token server-side, never trusted
from anything the client sends.

```
api/
  ai/
    chat.ts            POST — main text conversation endpoint
    conversation.ts    DELETE — clear a conversation's memory ("New conversation")
    voice-session.ts   POST — issues an ephemeral Gemini Live credential
    tool-call.ts        POST — used by voice sessions to run a tool through
                         the SAME authorization path as text (see below)
    document.ts         POST — Gemini multimodal explain/summarize for an
                         already-uploaded (Cloudinary) document/image
  _lib/
    config.ts            GEMINI_MODEL / GEMINI_LIVE_MODEL / GEMINI_API_KEY (server-only)
    firebaseAdmin.ts      Admin SDK init + ID token verification
    userContext.ts        Resolves TRUSTED role/school/child-links from Firestore
    gemini.ts              Gemini client
    persona.ts              System instruction + per-role tone
    security.ts              Prompt-injection screening, content fencing, redaction
    orchestrator.ts            The conversation loop: memory → model → tool
                                decision → authorize → execute → response
    memory.ts                    Compact structured conversation memory (Firestore)
    audit.ts                      Every tool decision — allowed or denied — logged
    tools/
      registry.ts                 ToolDefinition type + role-check helper
      execute.ts                  Shared authorize+execute path (text AND voice)
      readTools.ts                 13 read tools (attendance, assignments, exams,
                                    schedule, notices, resources, analytics, ...)
      actionTools.ts                markAttendance + the two support-request tools
                                    (all requiresConfirmation: true)
      policyTools.ts                 getSchoolPolicy — lightweight keyword RAG
                                     over Firestore-stored policy sections
      index.ts                       Aggregates tools + Gemini function declarations
```

**Client side:** `src/services/ai/ai.service.ts` now calls `/api/ai/chat`
with a Firebase ID token instead of returning a placeholder. New hooks —
`useConversation`, `useEdvia`, `useVoiceAssistant` — are the only way chat/
voice screens touch AI state, per the spec's requirement that components
never call Gemini directly. `AiChat.tsx` and `AiVoiceMode.tsx` are updated
to use them, including a confirm/cancel UI for write actions and source
chips for policy-grounded answers.

### Security model (the actual boundary, not the model)

- **Identity**: every request verifies a Firebase ID token server-side
  (`userContext.ts`); role/school/child-links come from Firestore, never
  from client-submitted fields.
- **Tools, not free-form access**: the model can only request a named tool
  with Zod-validated arguments. `authorizeAndExecuteTool()` is the single
  choke point both text chat and voice tool-calls go through — voice can't
  bypass what text enforces.
- **Confirmation**: any tool marked `requiresConfirmation: true`
  (`markAttendance`, both support-request tools) never executes on the
  model's first request — the orchestrator returns a `PendingConfirmation`
  and only runs the tool after an explicit affirmative follow-up turn.
- **Audit**: every allow/deny/error is written to `auditLogs` via
  `writeAuditLog()`, without storing free-text message bodies.
- **Prompt injection**: `security.ts` screens user input, fences all
  untrusted content (tool results, retrieved policy text) before it re-enters
  the model context, and the persona instructs the model to treat embedded
  instructions in that content as data, never commands.
- **Firestore rules** (`firestore.rules`) are defense-in-depth behind the
  Admin-SDK server boundary — school-scoped read-only for the client, all
  writes server-only.

### What needs real credentials/testing to fully verify

I built this without network access, so none of the following has been run
against live services — budget time for this before considering Prompt 2
complete:

1. **`@google/genai` API surface** — the orchestrator and voice hook are
   written against the documented function-calling / Live API patterns, but
   the exact method names (`ai.models.generateContent`, `ai.live.connect`,
   `ai.authTokens.create`, the Live message event shape) should be
   re-verified against current docs; the Live API in particular has moved
   between SDK versions. Each call is isolated to one file so a signature
   fix is localized.
2. **Firestore schema** — `scripts/seedFirestore.mjs` seeds collections
   matching what the tools query (`students`, `classes`, `attendance`,
   `assignments`, `exams`, `notices`, `resources`, `policies/{schoolId}/sections`,
   `schoolAnalytics`). Run it (after filling in a real teacher UID) against
   a dev project and adjust field names if your actual data model differs.
3. **Real Firebase Auth wiring** — Prompt 1's `auth.service.ts` still signs
   in against local mock data by default so the UI works without secrets.
   `getIdToken()` returns `null` in that mode by design — AI features fall
   back to a clearly-labeled explanation rather than fake reasoning. Wiring
   real `signInWithEmailAndPassword` / `onAuthStateChanged` (noted with
   `TODO(Prompt 3)` comments in `auth.service.ts`) is what turns this on.
4. **Voice**: full bidirectional audio streaming, interruption handling, and
   the tool-call relay are implemented per the architecture the spec
   requires, but have not been exercised against a live Gemini Live session.

This scaffold was written without network access, so `npm install` /
`vite build` could not be run to verify compilation here. The code follows
strict TypeScript conventions throughout (no `any`, explicit types on every
service boundary) — run `npm run build` locally as a first step; if anything
surfaces, it should be limited to minor import/typing fixes.
