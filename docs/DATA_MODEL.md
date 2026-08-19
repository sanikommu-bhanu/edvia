# EDVIA — Data Model

One Firestore database. One schema. The browser and EDVIA's AI tools read
the **same collections** — there is no separate "AI database" and no
client-side mock store, which is what makes the teacher→parent demo hold up:
a record written by a teacher tapping *Save Attendance* and one written by
the `markAttendance` tool are byte-identical.

* Rules: `firestore.rules`
* Indexes: `firestore.indexes.json`
* Types: `src/types/index.ts`
* Seed: `scripts/seedData.mjs` (description) + `scripts/seedFirestore.mjs` (writer)

---

## 1. Collections at a glance

| Collection | Purpose | Client read | Client write |
|---|---|:--:|:--:|
| `schools` | School identity | own school | ✗ |
| `users` | Account profile, role, links | own doc | limited |
| `teachers` | Teaching staff roster | own school | ✗ |
| `students` | Student records | scoped | ✗ |
| `classes` | Class/section records | scoped | ✗ |
| `attendance` | One row per student-day | scoped | **✗ server-only** |
| `classSubjects` | Timetable rows | class-scoped | ✗ |
| `assignments` | Homework | class-scoped | ✗ |
| `exams` | Tests and results | class-scoped | ✗ |
| `notices` | Announcements | own school | ✗ |
| `resources` | Study materials | own school | ✗ |
| `policies/{schoolId}/sections` | Handbook text | own school | ✗ |
| `calendarEvents` | School calendar | own school | ✗ |
| `schoolAnalytics` | Headline counts | principal | ✗ |
| `notifications` | Per-user notifications | own | read-state only |
| `supportRequests` | Escalations | own / routed-to | **✗ server-only** |
| `inviteCodes` | Single-use account linking | ✗ | **✗ server-only** |
| `conversationMemory` | AI conversation state | ✗ | **✗ server-only** |
| `auditLogs` | Immutable audit trail | **✗** | **✗** |

Everything not listed is denied by the catch-all
`match /{document=**} { allow read, write: if false; }`.

---

## 2. Relationships

```
schools ──┬── teachers        (teachers.schoolId)
          ├── classes ────┬── students      (students.classId)
          │               ├── classSubjects (timetable)
          │               ├── assignments
          │               └── exams
          ├── notices · resources · calendarEvents · policies/sections
          └── schoolAnalytics (doc id == schoolId)

users ────┬── student  → students     (users.studentId)
          ├── parent   → students[]   (users.linkedStudentIds)
          ├── teacher  → classes[]    (classes.teacherId == users.uid)
          └── principal→ school-wide  (role + schoolId)

students ── attendance  (doc id: `${studentId}_${date}`)

users ── supportRequests (requestedBy) ── routedToUid → users
users ── conversationMemory (userId) ── messages/ (subcollection)
```

The **link fields are the security-critical ones**: `studentId`,
`linkedStudentIds`, `teacherId` and `classIds` are exactly what the tool
layer trusts to decide whose records a request may read. They are written
**server-side only**, by `api/onboarding/redeem-invite.ts`, against a
single-use invite code — never by a client.

---

## 3. Collections in detail

### `schools/{schoolId}`

| Field | Type | Notes |
|---|---|---|
| `name` | string | e.g. "Greenfield International School" |
| `location` | string | e.g. "Bengaluru, Karnataka" |

**Access:** read if `schoolId == mySchoolId()`. Write denied.

---

### `users/{uid}`

Doc id is the Firebase Auth uid.

| Field | Type | Written by | Notes |
|---|---|---|---|
| `fullName` | string | client | |
| `email` | string | client | |
| `role` | `student\|parent\|teacher\|principal` | client, **at creation only** | **Immutable afterwards** |
| `schoolId` | string | client, **once** | May move `""` → value exactly once, then locked |
| `language` | LanguageCode | client | One of 11 |
| `studentId` | string | **server** | students/{id} — student role |
| `linkedStudentIds` | string[] | **server** | parent role |
| `teacherId` | string | **server** | teacher role |
| `classIds` | string[] | **server** | Classes whose shared content this account may read |
| `photoUrl` | string? | client | Cloudinary |

**Access:** read/write own doc only. The `unchanged()` rule helper excludes
`role`, `studentId`, `linkedStudentIds`, `teacherId` and `classIds` from
what a client update may touch — see [SECURITY.md §2](SECURITY.md#2-authentication).

Subcollection `readState/{docId}` — per-user notice/notification read flags,
writable by the owner.

---

### `teachers/{teacherId}`

| Field | Type | Notes |
|---|---|---|
| `fullName` | string | e.g. "Mr. Devendra Singh" |
| `subject` | string | Primary teaching subject |
| `schoolId` | string | |
| `classTeacherOf` | string \| null | classId, or null for subject-only staff |

The staff roster is the single source for timetable rows, assignment
authors and class-teacher labels, and `schoolAnalytics.totalTeachers` is
**derived by counting it** rather than typed in.

> **Seed invariant, enforced by `tests/seed.test.ts`:** no staff member
> shares a first name with any student in their school. Student lookup
> resolves by first name as one of its match tiers, so a collision would
> turn a confident answer into an "which one do you mean?" mid-demo.

---

### `students/{studentId}`

| Field | Type | Notes |
|---|---|---|
| `fullName` | string | |
| `rollNumber` | string | Two digits, `01`-based within a class |
| `classId` | string | classes/{id} |
| `className` | string | Denormalised, e.g. "Class 10 - A" |
| `section` | string | |
| `schoolId` | string | |
| `photoUrl` | string? | |

**Access:** read if principal of that school, **or** the doc is in
`myStudentIds()` (own record / a linked child), **or** its `classId` is in
`myClassIds()`. Write denied.

**Index:** `schoolId ASC, classId ASC`.

---

### `classes/{classId}`

| Field | Type | Notes |
|---|---|---|
| `className` | string | |
| `schoolId` | string | |
| `teacherId` | string | Firebase **uid** once claimed; `"__unclaimed__"` until then |
| `classTeacherName` | string \| null | Display label from the staff roster |
| `studentCount` | number | |

`teacherId` holding a uid (not a `tch_*` id) is what makes escalation
routing work: `createTeacherCallRequest` resolves it to route a call-back
request to a real account.

**Access:** read if principal of that school or `classId in myClassIds()`.
Write denied — `teacherId` is claimed only inside the invite transaction.

---

### `attendance/{studentId}_{date}` ⭐

**The most important collection in the system.**

| Field | Type | Notes |
|---|---|---|
| `studentId` | string | |
| `classId` | string | |
| `schoolId` | string | |
| `status` | `present\|absent\|leave` | |
| `date` | string | ISO `yyyy-mm-dd` |
| `markedBy` | string | uid, or `"seed"` |
| `markedAt` | string | ISO timestamp |
| `previousStatus` | status \| null | Set when a record is amended |

**The document id is deterministic: `${studentId}_${date}`.** Not an
auto-id. This is what makes attendance idempotent — re-marking the same
student on the same day **updates** that row instead of appending a second
one. Without it, saving a class twice would silently halve everyone's
percentage.

Both writers (`api/attendance/mark.ts` for the UI, the `markAttendance` tool
for the AI) call the same `api/_lib/school/attendance.ts` function, so the
key is computed in exactly one place: `attendanceDocId()`.

**Access:** read under the same relationship test as `students`. **All
client writes are `if false`** — writes go through server routes that
re-verify the teacher's class assignment with the Admin SDK.

**Indexes:** `studentId+date` (both directions), `classId+date`,
`schoolId+date`.

#### One percentage formula

`src/lib/attendanceMath.ts` is imported by **both** the browser and the
server (it is in `tsconfig.api.json`'s include list precisely so this is
possible). The dashboard and EDVIA cannot disagree about a percentage,
because there is only one implementation of it.

`noRecords: true` is returned for an empty window — "no records for that
period" and "0% attendance" are different statements, and EDVIA says the
former.

---

### `classSubjects/{classId}_sub_{n}`

| Field | Type |
|---|---|
| `subject`, `teacherName`, `room`, `schedule`, `iconKey` | string |
| `classId`, `schoolId`, `teacherId` | string |
| `progressPercent` | number |

**Access:** class-scoped (`canReadClassContent()`).

---

### `assignments/{id}` · `exams/{id}`

| `assignments` | Type |  | `exams` | Type |
|---|---|---|---|---|
| `subject`, `title`, `description` | string | | `title`, `subject` | string |
| `dueDate` | ISO date | | `date` | ISO date |
| `status` | `pending\|submitted\|overdue\|completed` | | `status` | `upcoming\|completed` |
| `teacherName` | string | | `score` | `{obtained,total}`? |
| `classId`, `schoolId` | string | | `classId`, `schoolId` | string |

**Access:** class-scoped. **Indexes:** `classId+status+dueDate`,
`classId+status+date`.

Class-scoped rather than student-scoped: a parent sees their child's class's
work, never another class's.

---

### `notices/{id}` · `resources/{id}` · `calendarEvents/{id}`

| `notices` | | `resources` | | `calendarEvents` | |
|---|---|---|---|---|---|
| `title`, `body` | string | `title`, `type`, `subject` | string | `title` | string |
| `category` | `school\|class\|important` | `fileSizeKb` | number | `date` | ISO date |
| `date` | ISO date | `uploadedAt` | ISO date | `type` | `ptm\|test\|event\|holiday` |
| `schoolId` | string | `url` | string | `schoolId` | string |

**Access:** school-scoped. **Indexes:** `schoolId+date DESC`,
`schoolId+category+date DESC`, `schoolId+subject`, `schoolId+date ASC`.

Seeded resources carry an **empty `url`** deliberately — it renders as "not
available for download yet" rather than a button that 404s. No fabricated
CDN links.

---

### `policies/{schoolId}/sections/{sectionId}`

| Field | Type | Notes |
|---|---|---|
| `title` | string | e.g. "Attendance Policy" |
| `section` | string | e.g. "4.2" — cited in AI answers |
| `content` | string | The real handbook text |
| `keywords` | string[] | Topic matching |

**Access:** school-scoped read. Write denied.

If no section matches a query, `getSchoolPolicy` raises `NoDataError` and
EDVIA says the handbook doesn't cover it. It never composes plausible policy
text.

---

### `schoolAnalytics/{schoolId}`

| Field | Type | Notes |
|---|---|---|
| `totalStudents` | number | **Derived** from the roster |
| `totalTeachers` | number | **Derived** from the staff list |
| `totalClasses` | number | **Derived** from the roster |
| `updatedAt` | ISO timestamp | |

**Attendance percentages are deliberately absent.** They are computed live
from `attendance` by `getSchoolAttendanceAnalytics()`, so they can never go
stale against the records. A missing document yields `NoDataError` and the
UI shows "—" rather than 0 — "no data" and "zero students" are different
statements.

**Access:** principal of that school only.

---

### `notifications/{id}`

| Field | Type |
|---|---|
| `userId`, `title`, `body`, `type` | string |
| `timestamp` | ISO |
| `read` | boolean |

**Access:** own only. **Indexes:** `userId+timestamp DESC`,
`userId+read+timestamp DESC`.

---

### `supportRequests/{autoId}`

| Field | Type | Notes |
|---|---|---|
| `recipientType` | `teacher\|management` | |
| `routedToUid` | string \| null | Resolved class-teacher uid |
| `routedToLabel` | string | e.g. "the class teacher for Class 10 - A" |
| `message` | string | |
| `studentContext` | string \| null | e.g. "Rahul Kumar · Class 10 - A" |
| `studentId` | string \| null | |
| `status` | `pending\|acknowledged\|resolved\|cancelled` | Starts `pending` |
| `createdAt` | ISO | |
| `requestedBy`, `requestedByRole`, `schoolId` | string | |

**Access:** read if `requestedBy` or `routedToUid` is you. Writes are
server-only.

This collection is what makes escalation *real*: EDVIA says
*"submitted"* only once a row exists with an id and a status, and reports
that stored status verbatim. It never claims a human was contacted.

**Indexes:** `requestedBy+createdAt DESC`, `routedToUid+createdAt DESC`.

---

### `inviteCodes/{code}`

| Field | Type | Notes |
|---|---|---|
| `code` | string | Doc id, e.g. `GISD-PAR-RAHUL` |
| `role` | Role | Must match the redeemer's role |
| `schoolId` | string | Must match the redeemer's school |
| `studentId` | string? | student/parent codes |
| `classIds` | string[]? | teacher codes |
| `used`, `usedBy`, `usedAt` | boolean/string/ISO | Single-use |
| `createdAt` | ISO | |

**Access:** fully server-only. Redemption is a Firestore **transaction**, so
two devices racing the same code cannot both succeed.

---

### `conversationMemory/{conversationId}`

| Field | Type | Notes |
|---|---|---|
| `userId` | string | **Ownership** — checked on every access |
| `role`, `language` | string | |
| `currentStudentId` | string? | The subject of the conversation |
| `currentStudentName` | string? | |
| `lastIntent` | AIIntent? | |
| `pendingConfirmation` | object \| null | The write awaiting a "yes" |
| `turnCount` | number | |

Subcollection `messages/{seq}` — a bounded window of recent turns.

**Access:** server-only. `conversationId` is client-supplied and doubles as
the document id, so every path goes through `getOwnedMemory()`, which throws
`ForbiddenError` if the memory belongs to someone else — and deliberately
does **not** "start fresh" under the same id, which would trade a disclosure
bug for a data-loss one.

**Nothing stored here grants access.** `currentStudentId` is re-intersected
with the caller's real `linkedStudentIds` at tool time. Memory can narrow a
result; it can never widen one.

---

### `auditLogs/{autoId}`

| Field | Type |
|---|---|
| `userId`, `role`, `schoolId`, `action` | string |
| `toolName`, `reason` | string? |
| `args` | object? — sanitized |
| `details` | object? — e.g. `{oldStatus, newStatus, changed}` |
| `result` | `success\|denied\|error` |
| `timestamp` | ISO |

**Access:** `read, write: if false` — no client path at all, in either
direction. Written only through the Admin SDK.

Denied attempts are recorded alongside successful ones. Message bodies,
passwords and tokens are never stored. **Index:** `schoolId+timestamp DESC`.

---

## 4. Seed data

`npm run seed` writes ~2,100 documents describing two real schools.

| | Greenfield (demo) | Riverside (isolation) |
|---|---|---|
| Classes | 5 | 1 |
| Students | 41 | 4 |
| Teaching staff | 8 | 1 |
| Attendance | 45 school days × 41 students | 45 × 4 |
| Assignments / exams / notices / resources / events | ✓ | timetable only |
| Policy handbook | 4 sections | — |

Riverside exists so **cross-school isolation can be demonstrated rather than
asserted**: sign in as its principal and ask about Greenfield.

### Determinism

Attendance is generated from `seededRandom(studentId:date)` — a re-run
produces the same history, so a figure quoted in a rehearsed demo is still
the figure on screen tomorrow. Two students (Vikram in 10-A, Karan in 10-B)
have deliberately high absence rates, which is what makes the principal's
*"which class needs attention?"* resolve to a genuine answer computed from
records.

Every student is **present today**, so the golden demo's question — *"Rahul
is currently marked present, change to absent?"* — is honest.

### Invariants (enforced by `tests/seed.test.ts`, 24 assertions)

* 30–50 students, 4–6 classes, 5–10 teachers
* No two students in one school share a **first name**
* No teacher shares a first name with a student in their school
* Every student has a class, a unique id and a roll number from `01`
* Every class has a class teacher from the staff roster
* Exactly one parent invite code per student; codes are unique
* Every code references records that exist, in the right school
* Rahul Kumar resolves unambiguously in Greenfield
* At least one student is below the 75% policy threshold
* Class averages differ by more than 2 points

Because `scripts/seedData.mjs` imports nothing and reads no environment,
these run in the normal `npm test` pass without a service account.

### Layout

| File | Role |
|---|---|
| `scripts/seedData.mjs` | Pure description — roster, staff, profiles, invite codes |
| `scripts/seedData.d.mts` | Types for it |
| `scripts/seedFirestore.mjs` | The writer — batched, idempotent |

Splitting them is what lets the invariants be *checked* rather than hoped
for. Every document has a deterministic id, so re-running updates in place
rather than duplicating.

---

## 5. Indexes

All 16 composite indexes are in `firestore.indexes.json`; deploy with
`firebase deploy --only firestore:indexes`. They exist because a missing
index in Firestore is a **runtime** failure, not a slow query — EDVIA would
report "I couldn't retrieve that right now" for a query that should work.
