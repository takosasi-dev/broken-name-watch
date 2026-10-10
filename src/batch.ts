// 当たりを batchMs の間ためて、1回にまとめて出す(FR-9・D-9)。
// 出す直前に、今もそのパスがあって承知していない物だけにし、全部落ちたら出さない。時計と exists は外から渡す。
import { ackKey } from "./ack";
import type { NameFinding } from "./checks/nameChecks";

export interface BatchDeps {
	batchMs: () => number;
	setTimer: (fn: () => void, ms: number) => number;
	clearTimer: (id: number) => void;
	exists: (path: string) => boolean;
	isAcked: (f: NameFinding) => boolean;
	emit: (findings: NameFinding[]) => void;
}

export class Batcher {
	private pending = new Map<string, NameFinding>();
	private timer: number | null = null;

	constructor(private readonly deps: BatchDeps) {}

	/** 当たりを足す。最初の1件でタイマーを掛け、batchMs の間に来た分は同じ回に入る(同じ判定・同じパスは1件) */
	add(findings: readonly NameFinding[]): void {
		for (const f of findings) this.pending.set(ackKey(f), f);
		if (this.pending.size === 0 || this.timer !== null) return;
		this.timer = this.deps.setTimer(() => this.flush(), this.deps.batchMs());
	}

	private flush(): void {
		this.timer = null;
		const out = [...this.pending.values()].filter((f) => this.deps.exists(f.path) && !this.deps.isAcked(f));
		this.pending.clear();
		if (out.length) this.deps.emit(out);
	}

	/** 待っている分を捨てる(プラグインを止めるとき) */
	cancel(): void {
		if (this.timer !== null) this.deps.clearTimer(this.timer);
		this.timer = null;
		this.pending.clear();
	}
}
