// ==========================================================================
// In-memory Firestore double
// ==========================================================================
// Implements exactly the slice of the Admin SDK that EDVIA's School Service
// layer uses — no more. It exists so the authorization matrix, the tool
// layer and attendance integrity can be tested for real, on every run,
// without a network, credentials, Java or the emulator.
//
// This does NOT test firestore.rules (rules only run inside the emulator —
// see scripts/testRules.mjs for those). It tests the layer above them: the
// server-side authorization that is the actual boundary for AI traffic,
// since the Admin SDK bypasses rules entirely.
//
// Where behaviour differs from real Firestore, it differs by being STRICTER:
// unsupported query operators throw instead of silently returning
// everything, so a test can't accidentally pass against a query the real
// database would reject.
// ==========================================================================

export type DocData = Record<string, unknown>;

interface StoredDoc {
  id: string;
  data: DocData;
}

type WhereOp = "==" | ">=" | "<=" | "<" | ">" | "in" | "array-contains";

interface WhereClause {
  field: string;
  op: WhereOp;
  value: unknown;
}

export class FakeFirestore {
  /** collectionPath -> docId -> data */
  private store = new Map<string, Map<string, DocData>>();
  private autoId = 0;

  /** Counts reads so a test can assert a screen isn't fetching in a loop. */
  readCount = 0;
  writeCount = 0;

  reset(): void {
    this.store.clear();
    this.autoId = 0;
    this.readCount = 0;
    this.writeCount = 0;
  }

  /** Bulk-loads fixture data: { "students": { "stu_a": {...} } }. */
  load(seed: Record<string, Record<string, DocData>>): void {
    for (const [path, docs] of Object.entries(seed)) {
      const collection = this.ensure(path);
      for (const [id, data] of Object.entries(docs)) {
        collection.set(id, structuredClone(data));
      }
    }
  }

  /** Direct inspection for assertions — never used by production code. */
  peek(path: string, id: string): DocData | undefined {
    const doc = this.store.get(path)?.get(id);
    return doc ? structuredClone(doc) : undefined;
  }

  peekAll(path: string): StoredDoc[] {
    return Array.from(this.store.get(path)?.entries() ?? []).map(([id, data]) => ({
      id,
      data: structuredClone(data),
    }));
  }

  private ensure(path: string): Map<string, DocData> {
    let collection = this.store.get(path);
    if (!collection) {
      collection = new Map();
      this.store.set(path, collection);
    }
    return collection;
  }

  private nextId(): string {
    this.autoId += 1;
    return `auto_${String(this.autoId).padStart(6, "0")}`;
  }

  // ---- public API mirroring firebase-admin/firestore --------------------

  collection(path: string): FakeCollectionRef {
    return new FakeCollectionRef(this, path);
  }

  async getAll(...refs: FakeDocRef[]): Promise<FakeDocSnapshot[]> {
    return Promise.all(refs.map((ref) => ref.get()));
  }

  batch(): FakeWriteBatch {
    return new FakeWriteBatch(this);
  }

  /**
   * Transactions run the callback once against live data. Real Firestore
   * retries on contention; nothing in these tests contends, and pretending
   * otherwise would test the fake rather than the code.
   */
  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    const tx = new FakeTransaction(this);
    const result = await fn(tx);
    await tx.commit();
    return result;
  }

  // ---- internals used by the ref classes --------------------------------

  _get(path: string, id: string): DocData | undefined {
    this.readCount += 1;
    return this.store.get(path)?.get(id);
  }

  _set(path: string, id: string, data: DocData, merge: boolean): void {
    this.writeCount += 1;
    const collection = this.ensure(path);
    const existing = collection.get(id);
    collection.set(id, merge && existing ? { ...existing, ...structuredClone(data) } : structuredClone(data));
  }

  _update(path: string, id: string, patch: DocData): void {
    this.writeCount += 1;
    const collection = this.ensure(path);
    const existing = collection.get(id);
    if (!existing) throw new Error(`No document to update at ${path}/${id}`);
    collection.set(id, { ...existing, ...structuredClone(patch) });
  }

  _delete(path: string, id: string): void {
    this.writeCount += 1;
    this.store.get(path)?.delete(id);
  }

  _query(path: string, clauses: WhereClause[], order?: { field: string; dir: "asc" | "desc" }, limit?: number): StoredDoc[] {
    this.readCount += 1;
    let docs: StoredDoc[] = Array.from(this.store.get(path)?.entries() ?? []).map(([id, data]) => ({
      id,
      data: structuredClone(data),
    }));

    for (const clause of clauses) {
      docs = docs.filter((doc) => matches(doc.data[clause.field], clause));
    }

    if (order) {
      const { field, dir } = order;
      docs.sort((a, b) => {
        const av = a.data[field];
        const bv = b.data[field];
        const cmp = compare(av, bv);
        return dir === "desc" ? -cmp : cmp;
      });
    }

    return typeof limit === "number" ? docs.slice(0, limit) : docs;
  }
}

function matches(value: unknown, clause: WhereClause): boolean {
  switch (clause.op) {
    case "==":
      return value === clause.value;
    case ">=":
      return compare(value, clause.value) >= 0;
    case "<=":
      return compare(value, clause.value) <= 0;
    case ">":
      return compare(value, clause.value) > 0;
    case "<":
      return compare(value, clause.value) < 0;
    case "in": {
      const list = clause.value as unknown[];
      if (!Array.isArray(list)) throw new Error("`in` requires an array");
      // Real Firestore rejects `in` with more than 30 values. Enforcing it
      // here is how the chunking in school/people.ts stays honest.
      if (list.length > 30) throw new Error("Firestore `in` filters accept at most 30 values");
      return list.includes(value);
    }
    case "array-contains":
      return Array.isArray(value) && value.includes(clause.value);
    default:
      throw new Error(`Unsupported query operator: ${clause.op}`);
  }
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a === undefined) return -1;
  if (b === undefined) return 1;
  return String(a).localeCompare(String(b));
}

export class FakeDocSnapshot {
  constructor(
    readonly id: string,
    private readonly _data: DocData | undefined,
    readonly ref: FakeDocRef
  ) {}

  get exists(): boolean {
    return this._data !== undefined;
  }

  data(): DocData | undefined {
    return this._data ? structuredClone(this._data) : undefined;
  }
}

export class FakeDocRef {
  constructor(
    private readonly db: FakeFirestore,
    readonly path: string,
    readonly id: string
  ) {}

  async get(): Promise<FakeDocSnapshot> {
    return new FakeDocSnapshot(this.id, this.db._get(this.path, this.id), this);
  }

  async set(data: DocData, options?: { merge?: boolean }): Promise<void> {
    this.db._set(this.path, this.id, data, Boolean(options?.merge));
  }

  async update(patch: DocData): Promise<void> {
    this.db._update(this.path, this.id, patch);
  }

  async delete(): Promise<void> {
    this.db._delete(this.path, this.id);
  }

  /** Subcollections are stored under a composite path, mirroring Firestore. */
  collection(name: string): FakeCollectionRef {
    return new FakeCollectionRef(this.db, `${this.path}/${this.id}/${name}`);
  }
}

export class FakeQuery {
  constructor(
    protected readonly db: FakeFirestore,
    protected readonly path: string,
    protected readonly clauses: WhereClause[] = [],
    protected readonly order?: { field: string; dir: "asc" | "desc" },
    protected readonly limitCount?: number
  ) {}

  where(field: string, op: WhereOp, value: unknown): FakeQuery {
    return new FakeQuery(this.db, this.path, [...this.clauses, { field, op, value }], this.order, this.limitCount);
  }

  orderBy(field: string, dir: "asc" | "desc" = "asc"): FakeQuery {
    return new FakeQuery(this.db, this.path, this.clauses, { field, dir }, this.limitCount);
  }

  limit(count: number): FakeQuery {
    return new FakeQuery(this.db, this.path, this.clauses, this.order, count);
  }

  async get(): Promise<FakeQuerySnapshot> {
    const docs = this.db._query(this.path, this.clauses, this.order, this.limitCount);
    return new FakeQuerySnapshot(
      docs.map((d) => new FakeDocSnapshot(d.id, d.data, new FakeDocRef(this.db, this.path, d.id)))
    );
  }
}

export class FakeCollectionRef extends FakeQuery {
  doc(id?: string): FakeDocRef {
    return new FakeDocRef(this.db, this.path, id ?? `auto_${Math.random().toString(36).slice(2, 12)}`);
  }

  /** Auto-id insert, used by the audit log and conversation transcripts. */
  async add(data: DocData): Promise<FakeDocRef> {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

export class FakeQuerySnapshot {
  constructor(readonly docs: FakeDocSnapshot[]) {}

  get size(): number {
    return this.docs.length;
  }

  get empty(): boolean {
    return this.docs.length === 0;
  }

  forEach(fn: (doc: FakeDocSnapshot) => void): void {
    this.docs.forEach(fn);
  }
}

export class FakeWriteBatch {
  private ops: (() => void)[] = [];

  constructor(private readonly db: FakeFirestore) {}

  set(ref: FakeDocRef, data: DocData, options?: { merge?: boolean }): void {
    this.ops.push(() => this.db._set(ref.path, ref.id, data, Boolean(options?.merge)));
  }

  update(ref: FakeDocRef, patch: DocData): void {
    this.ops.push(() => this.db._update(ref.path, ref.id, patch));
  }

  delete(ref: FakeDocRef): void {
    this.ops.push(() => this.db._delete(ref.path, ref.id));
  }

  async commit(): Promise<void> {
    if (this.ops.length > 500) throw new Error("Firestore batches accept at most 500 operations");
    this.ops.forEach((op) => op());
    this.ops = [];
  }
}

export class FakeTransaction {
  private ops: (() => void)[] = [];

  constructor(private readonly db: FakeFirestore) {}

  async get(ref: FakeDocRef): Promise<FakeDocSnapshot> {
    return ref.get();
  }

  set(ref: FakeDocRef, data: DocData, options?: { merge?: boolean }): void {
    this.ops.push(() => this.db._set(ref.path, ref.id, data, Boolean(options?.merge)));
  }

  update(ref: FakeDocRef, patch: DocData): void {
    this.ops.push(() => this.db._update(ref.path, ref.id, patch));
  }

  async commit(): Promise<void> {
    this.ops.forEach((op) => op());
    this.ops = [];
  }
}

/** Shared instance the adminDb() mock returns. */
export const fakeDb = new FakeFirestore();
