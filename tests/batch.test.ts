// batch.ts(AC-7・FR-9): batchMs の間に集めて1回で出す。出す直前に、無くなったパスと承知済みを落とす。時計は手で進める。
import { describe, expect, it } from "vitest";
import { ackKey } from "../src/ack";
import { Batcher } from "../src/batch";
import type { NameFinding } from "../src/checks/nameChecks";

const finding = (path: string, check: NameFinding["check"] = "invisible"): NameFinding =>
	({ check, severity: "error", path, kind: "file", detail: "U+0082", positions: [0] });

function setup(batchMs = 1000) {
	let now = 0;
	let nextId = 1;
	const timers = new Map<number, { at: number; fn: () => void }>();
	const gone = new Set<string>();
	const acked = new Set<string>();
	const emitted: NameFinding[][] = [];
	const batcher = new Batcher({
		batchMs: () => batchMs,
		setTimer: (fn, ms) => { timers.set(nextId, { at: now + ms, fn }); return nextId++; },
		clearTimer: (id) => { timers.delete(id); },
		exists: (path) => !gone.has(path),
		isAcked: (f) => acked.has(ackKey(f)),
		emit: (findings) => { emitted.push(findings); },
	});
	const advance = (ms: number): void => {
		now += ms;
		for (const [id, t] of [...timers]) {
			if (t.at > now) continue;
			timers.delete(id);
			t.fn();
		}
	};
	return { batcher, gone, acked, emitted, advance, timers };
}

describe("Batcher", () => {
	it("AC-7: A・B を入れ、A だけ無くなってから batchMs 進めると、出るのは B の1件だけ", () => {
		const { batcher, gone, emitted, advance } = setup();
		batcher.add([finding("A.md"), finding("B.md")]);
		gone.add("A.md");
		advance(999);
		expect(emitted).toEqual([]);
		advance(1);
		expect(emitted.map((e) => e.map((f) => f.path))).toEqual([["B.md"]]);
	});

	it("AC-7: 承知済みのキーの物は出ない(承知は判定ごと)", () => {
		const { batcher, acked, emitted, advance } = setup();
		acked.add("invisible|A.md");
		batcher.add([finding("A.md"), finding("A.md", "windows"), finding("B.md")]);
		advance(1000);
		expect(emitted.map((e) => e.map(ackKey))).toEqual([["windows|A.md", "invisible|B.md"]]);
	});

	it("AC-7: 全部落ちたときは何も出さない", () => {
		const { batcher, gone, acked, emitted, advance, timers } = setup();
		acked.add("invisible|B.md");
		batcher.add([finding("A.md"), finding("B.md")]);
		gone.add("A.md");
		advance(1000);
		expect(emitted).toEqual([]);
		expect(timers.size).toBe(0);
	});

	it("batchMs の間に来た分は1回にまとまり、同じ判定・同じパスは1件。次の回は別に出る", () => {
		const { batcher, emitted, advance } = setup();
		for (let i = 1; i <= 19; i++) {
			batcher.add([finding(`t${i}.md`)]);
			advance(10);
		}
		batcher.add([finding("t1.md")]);
		advance(1000);
		expect(emitted.map((e) => e.length)).toEqual([19]);
		batcher.add([finding("later.md")]);
		advance(1000);
		expect(emitted.map((e) => e.length)).toEqual([19, 1]);
	});

	it("空の追加ではタイマーを掛けない。cancel で待っている分を捨てる", () => {
		const { batcher, emitted, advance, timers } = setup();
		batcher.add([]);
		expect(timers.size).toBe(0);
		batcher.add([finding("A.md")]);
		batcher.cancel();
		expect(timers.size).toBe(0);
		advance(5000);
		expect(emitted).toEqual([]);
	});
});
