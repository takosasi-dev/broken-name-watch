// プラグイン全体のつなぎを、偽の obsidian で確かめる(AC-8〜AC-11・AC-18 の論理の部分。実機での確かめは NOTES.md)。
// obsidian は型だけのパッケージでテストから読めないので、src/main.ts を esbuild で束ね、require("obsidian") に偽物を渡して動かす。
// 偽物が持つのは src が使う物だけ。型の食い違いは tsc が src を本物の d.ts と突き合わせて見ている。
import { runInThisContext } from "node:vm";
import { build } from "esbuild";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NameFinding } from "../src/checks/nameChecks";
import type { Settings } from "../src/settings";

interface ElInfo { text?: string; cls?: string }

/** createDiv・createEl・createSpan だけを持つ偽の要素 */
class El {
	children: El[] = [];
	open = false;
	private listeners = new Map<string, () => void>();
	constructor(readonly tag: string, readonly text = "", readonly cls = "") {}
	private add(tag: string, o?: ElInfo): El {
		const e = new El(tag, o?.text ?? "", o?.cls ?? "");
		this.children.push(e);
		return e;
	}
	createDiv(o?: ElInfo): El { return this.add("div", o); }
	createSpan(o?: ElInfo): El { return this.add("span", o); }
	createEl(tag: string, o?: ElInfo): El { return this.add(tag, o); }
	empty(): void { this.children = []; }
	addClass(): void {}
	addEventListener(type: string, fn: () => void): void { this.listeners.set(type, fn); }
	click(): void { this.listeners.get("click")?.(); }
	all(): El[] { return [this, ...this.children.flatMap((c) => c.all())]; }
	texts(): string[] { return this.all().map((e) => e.text).filter((t) => t !== ""); }
	button(text: string, nth = 0): El | undefined { return this.all().filter((e) => e.tag === "button" && e.text === text)[nth]; }
}

class FakeFile {
	constructor(public path: string) {}
	get name(): string { return this.path.slice(this.path.lastIndexOf("/") + 1); }
	get extension(): string { return this.name.includes(".") ? this.name.slice(this.name.lastIndexOf(".") + 1) : ""; }
}
class FakeFolder extends FakeFile {
	isRoot(): boolean { return this.path === "/"; }
}

class FakeNotice {
	hidden = false;
	constructor(readonly message: El | string, readonly duration?: number) { notices.push(this); }
	hide(): void { this.hidden = true; }
	lines(): string[] { return typeof this.message === "string" ? [this.message] : this.message.texts(); }
}

class FakeModal {
	contentEl = new El("div");
	modalEl = new El("div");
	title = "";
	isOpen = false;
	constructor(readonly app: unknown) {}
	setTitle(title: string): this { this.title = title; return this; }
	open(): void { this.isOpen = true; modals.push(this); this.onOpen(); }
	close(): void { this.isOpen = false; this.onClose(); }
	onOpen(): void {}
	onClose(): void {}
}

interface TabLike {
	getSettingDefinitions(): { heading?: string; items: { name: string; desc: string; control?: { key: string } }[] }[];
	getControlValue(key: string): unknown;
	setControlValue(key: string, value: unknown): Promise<void>;
}

class FakePlugin {
	stored: unknown = null;
	saved: Settings[] = [];
	cleanups: (() => void)[] = [];
	commands: { id: string; name: string; hotkeys?: unknown }[] = [];
	tab: TabLike | null = null;
	constructor(readonly app: unknown, readonly manifest: { name: string }) {}
	loadData(): Promise<unknown> { return Promise.resolve(this.stored); }
	saveData(data: Settings): Promise<void> { this.saved.push(JSON.parse(JSON.stringify(data)) as Settings); return Promise.resolve(); }
	addCommand(c: { id: string; name: string }): void { this.commands.push(c); }
	addSettingTab(tab: TabLike): void { this.tab = tab; }
	register(fn: () => void): void { this.cleanups.push(fn); }
	registerEvent(): void {}
}

interface PluginLike extends FakePlugin {
	settings: Settings;
	onload(): Promise<void>;
	scan(): { findings: NameFinding[]; failed: string[] };
	staleAckCount(): number;
	saveSettings(): Promise<void>;
	openList(): void;
}

const notices: FakeNotice[] = [];
const modals: FakeModal[] = [];
const fakeObsidian = {
	Notice: FakeNotice, Modal: FakeModal, Plugin: FakePlugin, TFolder: FakeFolder,
	ConfirmationModal: class extends FakeModal {},
	PluginSettingTab: class { constructor(readonly app: unknown, readonly plugin: unknown) {} update(): void {} },
};

const bundle = await build({ entryPoints: ["src/main.ts"], bundle: true, external: ["obsidian"], format: "cjs", target: "es2021", write: false, logLevel: "silent" });
const mod = { exports: {} as { default?: new (app: unknown, manifest: { name: string }) => PluginLike } };
const wrapper = runInThisContext(`(function (module, exports, require) {${bundle.outputFiles[0]?.text ?? ""}\n})`) as
	(module: typeof mod, exports: typeof mod.exports, require: (id: string) => unknown) => void;
wrapper(mod, mod.exports, (id) => {
	if (id !== "obsidian") throw new Error(`外の部品を読もうとした: ${id}`);
	return fakeObsidian;
});
const PluginClass = mod.exports.default;

type Handler = (file: FakeFile, oldPath?: string) => void;

class World {
	files = new Map<string, FakeFile>([["/", new FakeFolder("/")]]);
	h1 = new Map<string, string>();
	handlers = new Map<string, Handler[]>();
	ready: (() => void)[] = [];
	openedFiles: string[] = [];
	app = {
		vault: {
			on: (event: string, h: Handler) => { this.handlers.set(event, [...(this.handlers.get(event) ?? []), h]); return {}; },
			getAllLoadedFiles: () => [...this.files.values()],
			getAbstractFileByPath: (path: string) => this.files.get(path) ?? null,
			getFileByPath: (path: string) => { const f = this.files.get(path); return f && !(f instanceof FakeFolder) ? f : null; },
		},
		metadataCache: {
			getFileCache: (f: FakeFile) => (this.h1.has(f.path) ? { headings: [{ level: 2, heading: "x" }, { level: 1, heading: this.h1.get(f.path) }] } : null),
		},
		workspace: {
			onLayoutReady: (cb: () => void) => { this.ready.push(cb); },
			getLeaf: () => ({ openFile: (f: FakeFile) => { this.openedFiles.push(f.path); return Promise.resolve(); } }),
		},
	};
	put(path: string, folder = false): FakeFile {
		const f = folder ? new FakeFolder(path) : new FakeFile(path);
		this.files.set(path, f);
		return f;
	}
	fire(event: string, file: FakeFile, oldPath?: string): void {
		for (const h of this.handlers.get(event) ?? []) h(file, oldPath);
	}
	/** プラグインを読み込み、レイアウトの準備ができた所まで進める */
	async start(data: unknown = null, layoutReady = true): Promise<PluginLike> {
		if (!PluginClass) throw new Error("束ねた main に default が無い");
		const plugin = new PluginClass(this.app, { name: "Broken Name Watch" });
		plugin.stored = data;
		await plugin.onload();
		if (layoutReady) for (const cb of this.ready) cb();
		return plugin;
	}
}

const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const U82 = "開発ログ\u{82}6-09-05.md";
const NFD = "フ\u{309A}_nfd.md";
const copied: string[] = [];
let clipboardFails = false;

/** 手で進める時計(window.setTimeout の代わり) */
const clock = {
	now: 0,
	nextId: 1,
	timers: new Map<number, { at: number; fn: () => void }>(),
	set(fn: () => void, ms: number): number {
		this.timers.set(this.nextId, { at: this.now + ms, fn });
		return this.nextId++;
	},
	advance(ms: number): void {
		this.now += ms;
		for (const [id, t] of [...this.timers]) {
			if (t.at > this.now) continue;
			this.timers.delete(id);
			t.fn();
		}
	},
};

beforeEach(() => {
	clock.now = 0;
	clock.timers.clear();
	vi.stubGlobal("window", { setTimeout: (fn: () => void, ms: number) => clock.set(fn, ms), clearTimeout: (id: number) => { clock.timers.delete(id); } });
	vi.stubGlobal("createFragment", () => new El("fragment"));
	vi.stubGlobal("navigator", { clipboard: { writeText: (t: string) => (clipboardFails ? Promise.reject(new Error("x")) : (copied.push(t), Promise.resolve())) } });
	notices.length = 0;
	modals.length = 0;
	copied.length = 0;
	clipboardFails = false;
});

describe("監視と通知(FR-7〜FR-10)", () => {
	it("D-8: レイアウトの準備ができるまで create と rename を登録しない(起動時の読み込みの create を拾わない)", async () => {
		const w = new World();
		await w.start(null, false);
		expect([...w.handlers.keys()]).toEqual([]);
		for (const cb of w.ready) cb();
		expect([...w.handlers.keys()]).toEqual(["create", "rename"]);
	});

	it("AC-8: 外でできた2つの名前を、Notice 1つに2行で知らせる。押すまで消えない。ボタンは「一覧を開く」", async () => {
		const w = new World();
		await w.start();
		w.fire("create", w.put(U82));
		w.fire("create", w.put(NFD));
		w.fire("create", w.put("ng_ok.md"));
		clock.advance(999);
		expect(notices).toEqual([]);
		clock.advance(1);
		expect(notices.map((n) => [n.lines(), n.duration])).toEqual([[
			["Broken Name Watch: 壊れた名前が 2 件", "開発ログ[U+0082]6-09-05.md(見えない文字)", "フ[U+309A]_nfd.md(NFC でない)", "一覧を開く"], 0]]);
	});

	it("AC-9: 19 個続けてできたら Notice は1つで「19 件」。壊れた名前のフォルダは1行だけで、中の ok.md は出ない", async () => {
		const w = new World();
		await w.start();
		for (let i = 1; i <= 19; i++) w.fire("create", w.put(`t\u{82}${i}.md`));
		clock.advance(1000);
		expect(notices.length).toBe(1);
		expect(notices[0]?.lines()[0]).toBe("Broken Name Watch: 壊れた名前が 19 件");
		expect(notices[0]?.lines().slice(4)).toEqual(["ほか 16 件", "一覧を開く"]);
		w.fire("create", w.put("dir\u{82}", true));
		w.fire("create", w.put("dir\u{82}/ok.md"));
		clock.advance(1000);
		expect(notices[1]?.lines()).toEqual(["Broken Name Watch: 壊れた名前が 1 件", "dir[U+0082](見えない文字)", "一覧を開く"]);
	});

	it("§10: 良い名前を壊れた名前に変えたら知らせる。作ってすぐ消えた名前は知らせない", async () => {
		const w = new World();
		await w.start();
		const f = w.put("ng_ok.md");
		w.files.delete("ng_ok.md");
		f.path = "ng\u{82}renamed.md";
		w.files.set(f.path, f);
		w.fire("rename", f, "ng_ok.md");
		const tmp = w.put("tmp\u{82}.md");
		w.fire("create", tmp);
		w.files.delete(tmp.path);
		clock.advance(1000);
		expect(notices.map((n) => n.lines().slice(0, -1))).toEqual([["Broken Name Watch: 壊れた名前が 1 件", "ng[U+0082]renamed.md(見えない文字)"]]);
	});

	it("AC-11・FR-10: 起動時の全件判定で、もとからある壊れた名前をそれぞれ1回だけ知らせる(vault のルートは除く)", async () => {
		const w = new World();
		w.put(U82);
		w.put(NFD);
		w.put("ok.md");
		await w.start();
		w.fire("create", w.files.get(U82) ?? w.put(U82));     // 同じ回に同じ名前のイベントが来ても1行
		clock.advance(1000);
		expect(notices.map((n) => n.lines().slice(0, -1))).toEqual([
			["Broken Name Watch: 壊れた名前が 2 件", "開発ログ[U+0082]6-09-05.md(見えない文字)", "フ[U+309A]_nfd.md(NFC でない)"]]);
	});

	it("scanOnStartup が false なら起動時は知らせない(一覧には出る)。noticeMs の値を Notice に渡す", async () => {
		const w = new World();
		w.put(U82);
		const plugin = await w.start({ scanOnStartup: false, noticeMs: 8000, batchMs: 200 });
		clock.advance(1000);
		expect(notices).toEqual([]);
		expect(plugin.scan().findings.map((f) => f.path)).toEqual([U82]);
		w.fire("create", w.put(NFD));
		clock.advance(200);
		expect(notices.map((n) => n.duration)).toEqual([8000]);
	});

	it("止めるときに待っている分を捨てる", async () => {
		const w = new World();
		const plugin = await w.start();
		w.fire("create", w.put(U82));
		for (const fn of plugin.cleanups) fn();
		clock.advance(5000);
		expect(notices).toEqual([]);
	});
});

describe("一覧のモーダルと承知(FR-11・FR-12・FR-14・FR-15・AC-10)", () => {
	async function opened(data: unknown = null) {
		const w = new World();
		w.put(U82);
		w.h1.set(U82, "2026-09-05 開発ログ");
		w.put("dir\u{82}", true);
		w.put("dir\u{82}/a .md");
		w.put(NFD);
		const plugin = await w.start(data);
		clock.advance(1000);
		notices[0]?.message instanceof El && notices[0].message.button("一覧を開く")?.click();
		const modal = modals[0];
		if (!modal) throw new Error("モーダルが開かない");
		return { w, plugin, modal };
	}

	it("Notice の「一覧を開く」でモーダルが開き、Notice は閉じる。見える形のパス・判定の名前・位置・H1 の手がかり・直し方が出る", async () => {
		const { modal } = await opened();
		expect(notices[0]?.hidden).toBe(true);
		expect(modal.title).toBe("壊れた名前: 未承知 4 件・承知済み 0 件");
		expect(modal.contentEl.texts()).toEqual([
			"開発ログ[U+0082]6-09-05.md", "見えない文字", "U+0082(5 文字目)", "承知", "手がかり(H1): 2026-09-05 開発ログ", "開く", "パスをコピー",
			"dir[U+0082]", "見えない文字", "U+0082(4 文字目)", "承知", "パスをコピー",
			"dir[U+0082]/a .md", "前後の空白", "U+0020(2 文字目)", "承知", "開く", "パスをコピー",
			"フ[U+309A]_nfd.md", "NFC でない", "U+309A(2 文字目)", "承知", "開く", "パスをコピー",
			"直し方: ノートは開いて上の名前を押す(PC は F2)。フォルダはファイル一覧で右クリック → Rename",
		]);
	});

	it("INV-6: ボタンは 承知・戻す・開く・パスをコピー だけ。フォルダの項目には「開く」を出さない", async () => {
		const { modal } = await opened({ acknowledged: [`nfd|${NFD}`] });
		const buttons = modal.contentEl.all().filter((e) => e.tag === "button").map((e) => e.text);
		expect([...new Set(buttons)].sort()).toEqual(["パスをコピー", "戻す", "承知", "開く"]);
		expect(buttons.filter((t) => t === "開く").length).toBe(3);
		expect(buttons.filter((t) => t === "パスをコピー").length).toBe(4);
	});

	it("「開く」でそのノートを開いてモーダルを閉じる。消えていたら Notice で知らせる", async () => {
		const { w, modal } = await opened();
		w.files.delete(NFD);
		modal.contentEl.button("開く", 2)?.click();
		await flush();
		expect(w.openedFiles).toEqual([]);
		expect(notices.at(-1)?.lines()).toEqual(["見つかりません: フ[U+309A]_nfd.md"]);
		modal.contentEl.button("開く", 0)?.click();
		await flush();
		expect(w.openedFiles).toEqual([U82]);
		expect(modal.isOpen).toBe(false);
	});

	it("FR-15: 「パスをコピー」は実際のパス(見える形にしない物)を入れる。失敗したら Notice で知らせる", async () => {
		const { modal } = await opened();
		modal.contentEl.button("パスをコピー", 0)?.click();
		await flush();
		expect(copied).toEqual([U82]);
		clipboardFails = true;
		const before = notices.length;
		modal.contentEl.button("パスをコピー", 1)?.click();
		await flush();
		expect(notices.slice(before).map((n) => n.lines())).toEqual([["パスをコピーできませんでした。"]]);
	});

	it("AC-10: 承知 → 保存して承知済みへ → 再起動で知らせない → 戻す → 再起動でまた知らせる", async () => {
		const { plugin, modal } = await opened();
		modal.contentEl.button("承知", 0)?.click();
		await flush();
		expect(plugin.saved.at(-1)?.acknowledged).toEqual([`invisible|${U82}`]);
		expect(modal.title).toBe("壊れた名前: 未承知 3 件・承知済み 1 件");
		const details = modal.contentEl.all().find((e) => e.tag === "details");
		expect(details?.open).toBe(false);                                  // 承知済みは折りたたむ
		expect(details?.texts().slice(0, 5)).toEqual(["承知済み 1 件", "開発ログ[U+0082]6-09-05.md", "見えない文字", "U+0082(5 文字目)", "戻す"]);

		notices.length = 0;
		modals.length = 0;
		const again = await opened(plugin.saved.at(-1));
		expect(notices[0]?.lines()).toEqual(["Broken Name Watch: 壊れた名前が 3 件", "dir[U+0082](見えない文字)", "a .md(前後の空白)", "フ[U+309A]_nfd.md(NFC でない)", "一覧を開く"]);
		expect(again.modal.title).toBe("壊れた名前: 未承知 3 件・承知済み 1 件");

		again.modal.contentEl.button("戻す")?.click();
		await flush();
		expect(again.plugin.saved.at(-1)?.acknowledged).toEqual([]);
		expect(again.modal.title).toBe("壊れた名前: 未承知 4 件・承知済み 0 件");

		notices.length = 0;
		modals.length = 0;
		await opened(again.plugin.saved.at(-1));
		expect(notices[0]?.lines()[0]).toBe("Broken Name Watch: 壊れた名前が 4 件");
	});

	it("AC-10: 設定で nfd を OFF にすると、Notice にも一覧にも出ない。除外フォルダの配下も出ない", async () => {
		const { modal } = await opened({ enabled: { nfd: false }, excludeFolders: ["dir\u{82}"] });
		expect(notices[0]?.lines()).toEqual(["Broken Name Watch: 壊れた名前が 2 件", "開発ログ[U+0082]6-09-05.md(見えない文字)", "dir[U+0082](見えない文字)", "一覧を開く"]);
		expect(modal.title).toBe("壊れた名前: 未承知 2 件・承知済み 0 件");
		expect(modal.contentEl.texts().join("\n")).not.toContain("nfd.md");
	});

	it("壊れた名前が無ければ、その旨と直し方だけを出す(コマンドから開く)", async () => {
		const w = new World();
		w.put("ok.md");
		const plugin = await w.start();
		plugin.openList();
		expect(modals[0]?.title).toBe("壊れた名前: 未承知 0 件・承知済み 0 件");
		expect(modals[0]?.contentEl.texts().length).toBe(2);
	});
});

describe("設定とコマンド(FR-12・FR-16・FR-17・§9.2)", () => {
	it("AC-18: コマンドは1つで、既定のホットキーが無い", async () => {
		const plugin = await new World().start();
		expect(plugin.commands.map((c) => [c.id, c.name, c.hotkeys])).toEqual([["list-broken-names", "List broken file names", undefined]]);
	});

	it("FR-16: 設定画面に、判定ごとの ON/OFF・文字化けの印・起動時の判定・時間・除外フォルダ・承知の全解除がある", async () => {
		const plugin = await new World().start();
		const groups = plugin.tab?.getSettingDefinitions() ?? [];
		expect(groups.map((g) => g.heading)).toEqual([undefined, "文字化けの印", "知らせ方", "除外フォルダ", "承知"]);
		expect(groups.flatMap((g) => g.items.map((i) => i.control?.key ?? i.name))).toEqual([
			"check:invisible", "check:nfd", "check:windows", "check:spaces", "check:mojibake",
			"signal:replacement", "signal:cp932-lead", "signal:pua", "signal:halfwidth-after-kanji",
			"scanOnStartup", "batchMs", "noticeMs", "excludeFolders", "承知をすべて解除"]);
	});

	it("設定画面の値の読み書き。不正な時間は保存しない", async () => {
		const plugin = await new World().start();
		const tab = plugin.tab;
		if (!tab) throw new Error("設定タブが無い");
		expect([tab.getControlValue("check:nfd"), tab.getControlValue("signal:replacement"), tab.getControlValue("signal:cp932-lead"),
			tab.getControlValue("batchMs"), tab.getControlValue("noticeMs"), tab.getControlValue("excludeFolders")]).toEqual([true, true, false, 1000, 0, ""]);
		await tab.setControlValue("check:nfd", false);
		await tab.setControlValue("signal:cp932-lead", true);
		await tab.setControlValue("signal:cp932-lead", true);
		await tab.setControlValue("batchMs", 500);
		await tab.setControlValue("excludeFolders", "Foo/\n\n 日報 ");
		await tab.setControlValue("scanOnStartup", false);
		expect(plugin.saved.at(-1)).toMatchObject({ enabled: { nfd: false, invisible: true }, mojibakeSignals: ["replacement", "cp932-lead"],
			batchMs: 500, excludeFolders: ["Foo", "日報"], scanOnStartup: false });
		const n = plugin.saved.length;
		await tab.setControlValue("noticeMs", -1);
		await tab.setControlValue("batchMs", 1.5);
		expect(plugin.saved.length).toBe(n);
		await tab.setControlValue("signal:replacement", false);
		expect(plugin.settings.mojibakeSignals).toEqual(["cp932-lead"]);
		expect(tab.getControlValue("excludeFolders")).toBe("Foo\n日報");
	});

	it("FR-12: 承知の件数と、どの名前にも当たっていない承知の件数(判定の ON/OFF と除外フォルダに左右されない)", async () => {
		const w = new World();
		w.put(U82);
		w.put("skip", true);
		w.put(`skip/${NFD}`);
		const plugin = await w.start({ acknowledged: [`invisible|${U82}`, `nfd|skip/${NFD}`, "invisible|gone\u{82}.md"],
			enabled: { invisible: false }, excludeFolders: ["skip"] });
		expect(plugin.staleAckCount()).toBe(1);
		const clear = plugin.tab?.getSettingDefinitions().at(-1)?.items[0];
		expect(clear?.desc).toBe("承知 3 件。うち、どの名前にも当たっていない承知 1 件。");
	});

	it("§9.2: schemaVersion が違うときは既定値で動かし、知らせて、data.json を上書きしない", async () => {
		const plugin = await new World().start({ schemaVersion: 2, noticeMs: 5 });
		expect(plugin.settings.noticeMs).toBe(0);
		expect(notices.map((n) => n.lines()[0])).toEqual(["Broken Name Watch: data.json の形が違うので既定の設定で動いています(data.json は書き換えていません)。"]);
		plugin.settings.acknowledged.push("invisible|x");
		await plugin.saveSettings();
		expect(plugin.saved).toEqual([]);

		const ok = await new World().start();
		await ok.saveSettings();
		expect(ok.saved.length).toBe(1);
	});
});
