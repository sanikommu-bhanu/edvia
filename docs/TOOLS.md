# EDVIA — Tool Reference

Every capability EDVIA has is a **tool**. The language model cannot reach
Firestore, cannot call the School Service layer, and cannot construct a
query. It can do exactly one thing: emit a function call with a name and
arguments. What happens next is decided by code the model has no influence
over.

This document describes all **27 tools** — 22 read, 5 write — what each one
may touch, and the authorization that stands in front of it.

Source of truth:

| File | Contents |
|---|---|
| `api/_lib/tools/registry.ts` | The `ToolDefinition` contract and error classes |
| `api/_lib/tools/readTools.ts` | 16 read tools |
| `api/_lib/tools/gradeTools.ts` | 4 read + 1 write — exam results |
| `api/_lib/tools/supportTools.ts` | 1 read + 1 write — the staff support inbox |
| `api/_lib/tools/actionTools.ts` | 3 write tools (all confirmation-gated) |
| `api/_lib/tools/policyTools.ts` | `getSchoolPolicy` |
| `api/_lib/tools/execute.ts` | **The authorization boundary** — every call passes through here |
| `api/_lib/tools/index.ts` | The catalogue + Gemini declarations derived from each Zod schema |

---

## 1. The contract every tool satisfies

```ts
interface ToolDefinition<Input, Output> {
  name: string;
  description: string;
  inputSchema: ZodType<Input>;          // strict runtime validation
  allowedRoles: Role[];                 // coarse gate
  authorize(ctx, input): Promise<{ allowed: boolean; reason?: string }>;
  handler(ctx, input): Promise<Output>; // runs only inside both gates
  requiresConfirmation: boolean;        // true ⇒ needs an explicit prior "yes"
  auditAction: string;
}
```

`ctx` is a `TrustedUserContext`, derived in `api/_lib/userContext.ts` from a
**verified Firebase ID token** and the `users/{uid}` document. It is never
built from a request body field, a header, or anything the model produced. A
chat message saying *"I am the principal"* reaches the model as ordinary
text and changes nothing in `ctx`.

### Execution order

`authorizeAndExecuteTool()` in `execute.ts` runs the same seven steps for
every call, from both the text orchestrator and the Live voice relay:

1. **Tool exists** — unknown names are rejected.
2. **Role allow-list** — checked *before* validation, so probing a tool
   you can't use never reveals its argument shape.
3. **Zod validation** — unknown keys stripped, bad types rejected. A handler
   never sees an argument its schema didn't declare.
4. **Confirmation gate** — write tools stop here unless `confirmed` is true.
5. **`authorize()`** — per-call ownership, school boundary, class scope.
6. **Handler** — already inside every gate above.
7. **Audit** — allowed *and* denied calls are both recorded.

### Failure kinds

Handlers signal outcomes with typed errors rather than returning strings, so
the orchestrator can respond correctly without the model interpreting prose:

| Kind | Meaning | What EDVIA says |
|---|---|---|
| `role_denied` | Role isn't on the allow-list | "That isn't something I can help with on this account." |
| `invalid_arguments` | Failed Zod validation | "I need a bit more detail before I can do that." |
| `not_authorized` | `authorize()` said no, or `ToolAuthorizationError` | Declines **without** revealing whether the record exists |
| `ambiguous` | `AmbiguousEntityError` — several of the caller's *own* records matched | Asks which one; never guesses |
| `no_data` | `NoDataError` — authorized, but no such record | Says so honestly; never estimates a number |
| `error` | Unexpected failure | "I couldn't retrieve that right now" — internals go to the server log only |

The model is shown a **fenced, instruction-bearing** version of the failure
(`toolResponsePayload()` in `orchestrator.ts`), not the raw error — so an
authorization failure can't be narrated in a way that leaks existence.

### Role visibility

The orchestrator filters `GEMINI_TOOL_DECLARATIONS` by role before the model
turn. A student's request does not contain a declaration for
`markAttendance`, `recordExamResult`, `getClassGrades` or `getSupportInbox`
**at all** — the most common failure mode (a model asking for a tool it
can't have) is removed rather than caught.

Per role, the model is shown: **student 16 · parent 16 · teacher 19 ·
principal 14** of the 27.

---

## 2. Shared authorization helpers

Two helpers in `readTools.ts` carry most of the ownership logic, so it is
written once rather than re-derived per tool.

### `resolveSubjectStudent(ctx, requestedName?)`

Answers *"which student is this request actually about?"*

| Caller role | Resolution | Can a `studentName` argument widen scope? |
|---|---|---|
| **student** | Always themself, via `ctx.studentId` | **No** — the argument is ignored entirely |
| **parent** | Matched **only within `ctx.linkedStudentIds`** | No — a non-matching name raises `ToolAuthorizationError`, so a parent can't even probe whether a child exists at the school |
| **teacher** | Name required; searched within `ctx.teacherClassIds` | Only within classes they are actually assigned to |
| **principal** | Name required; searched within `ctx.schoolId` | Only within their own school |

`ctx.conversationStudentId` — the child established earlier in the same
conversation — is consulted for parents **only after** being intersected
with `linkedStudentIds`. Conversation memory can narrow an answer; it can
never widen one.

### `resolveScopeClassId(ctx)`

The class whose shared content (assignments, exams, timetable) the caller
may see: a teacher's first assigned class, or the class of the student the
request resolves to.

> `ctx.teacherClassIds` is re-derived from the `classes` collection **on
> every request**, not cached on the profile, so revoking a class assignment
> takes effect immediately.

---

## 3. Read tools

All are `requiresConfirmation: false` and perform no writes.

### `getStudentProfile`

| | |
|---|---|
| **Purpose** | Full name, class, section, roll number |
| **Input** | `{ studentName?: string(≤80) }` |
| **Roles** | student, parent, teacher, principal |
| **Authorization** | `resolveSubjectStudent` is the ownership check |
| **Reads** | `students` |
| **Audit** | `read:student_profile` |

*Example — parent:* "What class is Rahul in?" → "Rahul is in Class 10 - A, roll number 01."

---

### `getStudentAttendance`

| | |
|---|---|
| **Purpose** | The **student's own** attendance percentage for a period |
| **Input** | `{ period: Period }` |
| **Roles** | **student only** |
| **Authorization** | Resolves to `ctx.studentId`; no name argument exists, so cross-student access is impossible by schema |
| **Reads** | `attendance` |
| **Audit** | `read:own_attendance` |

Returns `noRecords: true` for an empty window rather than a confident 0% —
"no records for that period" and "0% attendance" are different statements.

---

### `getChildAttendance`

| | |
|---|---|
| **Purpose** | A **linked child's** attendance percentage |
| **Input** | `{ childName?: string(≤80), period: Period }` |
| **Roles** | **parent only** |
| **Authorization** | Name matched only within `linkedStudentIds`; multiple children with no name → `AmbiguousEntityError` |
| **Reads** | `students`, `attendance` |
| **Audit** | `read:child_attendance` |

*Security constraint:* `childName` cannot reach the school roster. A parent
asking for a child who isn't theirs gets the same refusal whether or not
that child exists.

---

### `getAttendanceDetail`

| | |
|---|---|
| **Purpose** | The specific dates missed — backs "was he absent recently?" |
| **Input** | `{ studentName?: string(≤80), period: Period }` |
| **Roles** | student, parent, teacher |
| **Authorization** | `resolveSubjectStudent` |
| **Reads** | `attendance` (non-present rows only) |
| **Audit** | `read:attendance_detail` |

---

### `getClassAttendance`

| | |
|---|---|
| **Purpose** | Aggregate attendance for one class |
| **Input** | `{ className?: string(≤60), period: Period }` |
| **Roles** | teacher, principal |
| **Authorization** | Teacher: only classes in `teacherClassIds`. Principal: only classes in their own school. Teachers with no assigned class are refused outright. |
| **Reads** | `classes`, `attendance` |
| **Audit** | `read:class_attendance` |

---

### `getSchoolAttendance`

| | |
|---|---|
| **Purpose** | School-wide attendance with a per-class breakdown |
| **Input** | `{ period: Period }` |
| **Roles** | **principal only** |
| **Authorization** | Role gate plus `ctx.schoolId` scoping — a principal of Riverside cannot read Greenfield |
| **Reads** | `classes`, `attendance` |
| **Audit** | `read:school_attendance` |

Uses the same `getSchoolAttendanceAnalytics()` the principal dashboard calls
through `api/analytics/school.ts`, so the number EDVIA quotes and the number
on screen come from one implementation.

---

### `getAssignments` · `getExams` · `getSchedule`

| | `getAssignments` | `getExams` | `getSchedule` |
|---|---|---|---|
| **Input** | `{ status?: "pending"\|"submitted"\|"overdue"\|"completed" }` | `{ status?: "upcoming"\|"completed" }` | `{}` |
| **Roles** | student, parent, teacher | student, parent, teacher | student, parent, teacher |
| **Scope** | `resolveScopeClassId(ctx)` | same | same |
| **Reads** | `assignments` | `exams` | `classSubjects` |
| **Audit** | `read:assignments` | `read:exams` | `read:schedule` |

Class-scoped, not student-scoped: a parent sees their child's class's work,
never another class's.

---

### `getClassInformation`

| | |
|---|---|
| **Purpose** | Class details — name, teacher, size |
| **Input** | `{ className?: string(≤60) }` |
| **Roles** | student, parent, teacher, principal |
| **Authorization** | Scoped to the caller's own class(es) or, for a principal, their own school |
| **Reads** | `classes` |
| **Audit** | `read:class_information` |

---

### `getSchoolInformation`

| | |
|---|---|
| **Purpose** | The caller's own school's name and location |
| **Input** | `{}` |
| **Roles** | all four |
| **Authorization** | Reads `ctx.schoolId` only — there is no argument to point elsewhere |
| **Reads** | `schools` |
| **Audit** | `read:school_information` |

---

### `getAnnouncements` · `getResources`

| | `getAnnouncements` | `getResources` |
|---|---|---|
| **Input** | `{ category?: "school"\|"class"\|"important" }` | `{ subject?: string(≤40) }` |
| **Roles** | all four | student, parent, teacher |
| **Scope** | `ctx.schoolId` | `ctx.schoolId` |
| **Reads** | `notices` | `resources` |
| **Audit** | `read:notices` | `read:resources` |

Seeded resources carry an empty `url`, which renders as "not available for
download yet" rather than a button that 404s.

---

### `getSchoolPolicy`

| | |
|---|---|
| **Purpose** | The school's **actual written** handbook text on a topic |
| **Input** | `{ topic: string(2–120) }` |
| **Roles** | all four |
| **Authorization** | Requires a linked `schoolId` |
| **Reads** | `policies/{schoolId}/sections` |
| **Audit** | `read:policy` |

The tool description instructs the model to use this instead of general
knowledge. If no section matches, it raises `NoDataError` and EDVIA says the
handbook doesn't cover it — it does **not** compose plausible policy text.
Answers cite the real section number (e.g. §4.2).

---

### `getStudentGrades` · `getChildGrades`

| | |
|---|---|
| **Purpose** | Exam results: overall weighted percentage, per-subject breakdown, every individual paper |
| **Input** | `getStudentGrades: { subject?: string(≤40) }` · `getChildGrades: { childName?: string(≤80), subject?: string(≤40) }` |
| **Roles** | student / parent respectively |
| **Authorization** | Student → `resolveSubjectStudent(ctx)` with **no name argument in the schema at all**. Parent → intersected with `linkedStudentIds` before any read |
| **Reads** | `examResults` (school-filtered again inside the service) |
| **Audit** | `read:own_grades` · `read:child_grades` |

`getStudentGrades` deliberately declares **no** `studentName` parameter. A
student's own marks are not protected by a check that could be argued with —
there is simply no field for another name to occupy, so no phrasing and no
jailbreak can widen the subject. `eval GRA-14` asserts exactly this.

For a parent, a name that isn't one of their children is refused with a
message that does **not** confirm whether such a student exists at the
school (`eval GRA-04`). A parent with several children and none established
in the conversation gets an `AmbiguousEntityError` listing **their own**
children — never the roster.

Aggregation is weighted by maximum marks (`src/lib/gradeMath.ts`), the same
function the Grades screen uses, so the number EDVIA speaks and the number on
screen come from one implementation.

**No records is said, not guessed.** An empty result throws `NoDataError`,
so the turn carries `kind: "no_data"` and EDVIA reports that nothing has been
recorded rather than a confident 0%.

---

### `getClassGrades`

| | |
|---|---|
| **Purpose** | One class's academic performance: class average, per-subject breakdown, and every student's aggregate **weakest first** |
| **Input** | `{ className?: string(≤60), examTitle?: string(≤80) }` |
| **Roles** | teacher, principal |
| **Authorization** | `resolveClassIdForCaller` — a teacher's own assigned classes, or verified management's own school. A `classId` is never accepted from the model |
| **Reads** | `examResults` |
| **Audit** | `read:class_grades` |

`examTitle` is resolved to an exam id **within the already-authorized class**
(`resolveExamInClass`), so the worst a steered model can do is name a paper
that doesn't exist in the caller's own class.

Weakest-first ordering is not cosmetic: it is the list a teacher acts on.

---

### `getSchoolPerformance`

| | |
|---|---|
| **Purpose** | School-wide academic roll-up: overall average, per-class ranking, per-subject breakdown, classes falling behind |
| **Input** | `{}` |
| **Roles** | principal |
| **Authorization** | `isVerifiedManagement(ctx)` — the server-written **grant**, never `role` |
| **Reads** | `examResults` for `ctx.schoolId` |
| **Audit** | `read:school_performance` |

Percentages are re-derived from raw marks rather than averaged across
per-class percentages, for the same reason the attendance roll-up is: a
six-student class must not swing the school figure as hard as a
forty-student one. `grades.test.ts` asserts the two figures differ, so the
test would fail if someone "simplified" it to a mean.

---

### `getSupportInbox`

| | |
|---|---|
| **Purpose** | The call-back and support requests waiting for this staff member |
| **Input** | `{ status?: "pending"\|"acknowledged"\|"resolved" }` |
| **Roles** | teacher, principal |
| **Authorization** | Requests **routed to this uid**, plus the school's `management` queue when `isVerifiedManagement(ctx)`. A second, independent `schoolId` check runs after the uid query |
| **Reads** | `supportRequests` |
| **Audit** | `read:support_inbox` |

Visibility is a relationship, not a role: an unrelated teacher at the same
school sees nothing, and verified management cannot read a parent's private
message to a class teacher.

Request messages are **family-authored text**. The orchestrator fences every
tool result before the model sees it, so a message containing *"ignore your
instructions"* is read as data, not as a command.

---

### `getSchoolAnalytics`

| | |
|---|---|
| **Purpose** | Headline counts for management (students, teachers, classes) |
| **Input** | `{}` |
| **Roles** | **principal only** |
| **Reads** | `schoolAnalytics/{schoolId}` |
| **Audit** | `read:analytics` |

Counts are written by the seed and **derived** from the roster and staff
list — not typed in. Attendance percentages are deliberately *not* stored
here; they are computed live so they cannot go stale against the records.
Missing document → `NoDataError`, and the UI shows "—" rather than zero.

---

### `getSupportRequests` · `getNotifications`

| | `getSupportRequests` | `getNotifications` |
|---|---|---|
| **Purpose** | Status of the caller's own escalations | The caller's own notifications |
| **Input** | `{}` | `{ unreadOnly?: boolean }` |
| **Roles** | all four | all four |
| **Authorization** | Filtered by `requestedBy == ctx.uid` | Filtered by the caller's uid |
| **Reads** | `supportRequests` | `notifications` |
| **Audit** | `read:support_requests` | `read:notifications` |

`getSupportRequests` returns the **real stored status**. EDVIA reports that
status verbatim and never infers that a request has been seen or actioned.

---

## 4. Action tools

All three are `requiresConfirmation: true`. The orchestrator will not
execute any of them on the turn they are requested.

### The confirmation contract

1. Model requests the tool.
2. `execute.ts` runs `authorize()` **first** — an unauthorized target is
   refused here, before the user is ever asked to confirm.
3. `preview()` runs, **reading the live record**, and returns a summary.
4. Nothing is written. The pending action is stored in conversation memory.
5. The user answers. `AFFIRMATION`/`NEGATION` are matched with a
   Unicode-aware pattern covering all eleven languages.
6. On "yes", the pending action is cleared **before** execution, so a
   duplicate "yes" cannot run the write twice.
7. EDVIA reports **only** what the tool actually returned.

Changing the subject instead of answering **drops** the pending action — it
is never carried silently into a later "yes".

---

### `markAttendance`

| | |
|---|---|
| **Purpose** | Create or amend one student-day attendance record |
| **Input** | `{ studentName: string(1–80), status: "present"\|"absent"\|"leave", date?: /^\d{4}-\d{2}-\d{2}$/ }` |
| **Roles** | **teacher only** |
| **Authorization** | Student must resolve within `ctx.teacherClassIds`; the class must be in `ctx.schoolId` |
| **Mutates** | `attendance/{studentId}_{date}` |
| **Audit** | `write:attendance` — records `oldStatus`, `newStatus`, `changed` |

**Idempotent by construction.** The document id is
`${studentId}_${date}`, not an auto-id, so re-marking updates that day's row
rather than appending a second one. Without this, saving a class twice would
silently halve everyone's percentage.

`preview()` reads the current value first, so the question is honest:

> "Rahul Kumar is currently marked present for today. Would you like me to
> change that to absent?"

If the requested status already matches, `preview.noOp` is set and EDVIA
says *"already marked present — nothing changed"* rather than reporting a
change that didn't happen.

A malformed date fails Zod validation and **nothing is written**.

---

### `createTeacherCallRequest`

| | |
|---|---|
| **Purpose** | File a routed call-back request to a child's class teacher |
| **Input** | `{ message: string(1–1000), childName?: string(≤80) }` |
| **Roles** | student, parent |
| **Authorization** | Subject resolved through `resolveSubjectStudent`; routing derived from the student's real class |
| **Mutates** | `supportRequests` (status `pending`) |
| **Audit** | `write:support_request_teacher` |

Routing resolves `classes/{classId}.teacherId`. If no teacher is assigned
yet, the request is **still created** (nothing is lost) but routes to the
school office and says so.

**Wording is load-bearing.** On success:

> "Your call request has been submitted to the class teacher for Class 10 - A."

Never *"I've spoken to the teacher"* or *"the teacher has been contacted"* —
nothing here sends an email or places a call, and claiming otherwise is
exactly the failure the challenge calls out. A principal has no class
teacher, so the tool is not in their set at all.

---

### `createManagementSupportRequest`

| | |
|---|---|
| **Purpose** | File a request to school management |
| **Input** | `{ message: string(1–1000), childName?: string(≤80) }` |
| **Roles** | student, parent, teacher |
| **Mutates** | `supportRequests` (status `pending`, routed to management) |
| **Audit** | `write:support_request_management` |

---

### `recordExamResult`

| | |
|---|---|
| **Purpose** | Create or amend one student's mark for one paper |
| **Input** | `{ studentName: string(1–80), examTitle: string(1–80), score: 0–1000, maxScore: >0…1000 }` |
| **Roles** | **teacher only** |
| **Authorization** | Student must resolve within `ctx.teacherClassIds`; the exam must belong to **that student's class** and `ctx.schoolId`; `validateScore` must pass |
| **Mutates** | `examResults/{examId}_{studentId}` |
| **Audit** | `write:exam_result` |

**Idempotent by construction**, like `markAttendance`: the document id is
`${examId}_${studentId}`, so correcting a typo amends the paper rather than
double-counting it in the student's aggregate, the class average and the
school figure at once.

`preview()` reads the current mark first:

> "Arjun Patel is currently recorded at 46/50 for the Science Test. Would you
> like me to change that to 49/50?"

If the mark already matches, `preview.noOp` is set. A score above the
maximum, or below zero, is refused — at the Zod schema, again in
`resolveMarkEntryTarget`, and again in the School Service, all three calling
the single `gradeMath.validateScore`.

Neither `studentId`, `classId`, `examId` nor `schoolId` is an accepted
argument. The model supplies words a teacher said; the server supplies every
identifier.

---

### `updateSupportRequestStatus`

| | |
|---|---|
| **Purpose** | Acknowledge or resolve a support request in the caller's inbox |
| **Input** | `{ requestId: string(1–128), status: "acknowledged"\|"resolved" }` |
| **Roles** | teacher, principal |
| **Authorization** | The request must be routed to this uid, or be a `management` request in the caller's school with `isVerifiedManagement(ctx)`. The transition must be legal from the **live** status |
| **Mutates** | `supportRequests/{id}` — `status`, `previousStatus`, `updatedAt`, `updatedBy` |
| **Audit** | `write:support_request_status` |

`"pending"` is not in the enum: this tool moves requests forward, and there
is no argument value that walks one backwards.

**The tool cannot claim success the server didn't grant.** The handler calls
`advanceSupportRequestStatus`, which performs the authorization, the
legality check and the write inside one Firestore transaction. If that
returns a refusal, the handler *throws* — so there is no code path where
"resolved" is spoken on the strength of the model's own intention. A
replayed confirmation produces a failure the model has to relay, not a
second success.

An unauthorized `requestId` is refused with the **same** message an unknown
id gets, so request ids cannot be enumerated by trying them.

---

## 5. Role → tool matrix

| Tool | student | parent | teacher | principal |
|---|:--:|:--:|:--:|:--:|
| `getStudentProfile` | ✅ | ✅ | ✅ | ✅ |
| `getStudentAttendance` | ✅ | — | — | — |
| `getChildAttendance` | — | ✅ | — | — |
| `getAttendanceDetail` | ✅ | ✅ | ✅ | — |
| `getClassAttendance` | — | — | ✅ | ✅ |
| `getSchoolAttendance` | — | — | — | ✅ |
| `getAssignments` | ✅ | ✅ | ✅ | — |
| `getExams` | ✅ | ✅ | ✅ | — |
| `getSchedule` | ✅ | ✅ | ✅ | — |
| `getClassInformation` | ✅ | ✅ | ✅ | ✅ |
| `getSchoolInformation` | ✅ | ✅ | ✅ | ✅ |
| `getAnnouncements` | ✅ | ✅ | ✅ | ✅ |
| `getResources` | ✅ | ✅ | ✅ | — |
| `getSchoolPolicy` | ✅ | ✅ | ✅ | ✅ |
| `getSchoolAnalytics` | — | — | — | ✅ |
| `getSupportRequests` | ✅ | ✅ | ✅ | ✅ |
| `getNotifications` | ✅ | ✅ | ✅ | ✅ |
| `getStudentGrades` | ✅ | — | — | — |
| `getChildGrades` | — | ✅ | — | — |
| `getClassGrades` | — | — | ✅ | ✅ |
| `getSchoolPerformance` | — | — | — | ✅ |
| `getSupportInbox` | — | — | ✅ | ✅ |
| `markAttendance` 🔒 | — | — | ✅ | — |
| `recordExamResult` 🔒 | — | — | ✅ | — |
| `createTeacherCallRequest` 🔒 | ✅ | ✅ | — | — |
| `createManagementSupportRequest` 🔒 | ✅ | ✅ | ✅ | — |
| `updateSupportRequestStatus` 🔒 | — | — | ✅ | ✅ |
| **Total shown to the model** | **16** | **16** | **19** | **14** |

🔒 = requires explicit user confirmation before it runs.

A "—" is enforced twice: the declaration isn't shown to the model, **and**
`execute.ts` rejects the call if it arrives anyway.

---

## 6. Schema-to-model consistency

`GEMINI_TOOL_DECLARATIONS` is generated from each tool's own Zod schema by
`zodToGemini.ts`, at module load. There is no hand-maintained second copy of
any tool's argument shape, so what the model is *told* a tool accepts and
what the validator will *actually* accept cannot drift apart. An unsupported
schema throws on the first cold start rather than mid-conversation.

---

## 7. Testing

`tests/authorization.test.ts` drives the **real** `authorizeAndExecuteTool`
against an in-memory Firestore double — a pass means the shipped boundary
held, not that a re-implementation agreed with itself. It covers the full
role × tool matrix above, including every "—" cell.

`tests/attendance.test.ts` covers idempotency, the no-op preview, and the
deterministic document key. `tests/grades.test.ts` does the same for exam
results, plus the maths (weighted vs. mean), banding and score validation.
`tests/support.test.ts` covers inbox visibility, the forward-only status
machine and transactional replay protection.

See **[AI_EVALUATION.md](AI_EVALUATION.md)** for the 96-case behavioural
matrix, including injection, role spoofing and extraction attempts.
