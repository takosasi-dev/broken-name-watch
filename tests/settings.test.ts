// 設定の既定値(AC-14)と、data.json の読み込みの補い(§9.2・§10)。
import { describe, expect, it } from "vitest";
import { DEFAULTS, defaultSettings, normalizeSettings, parseFolders } from "../src/settings";

describe("既定値(AC-14)", () => {
	it("mojibakeSignals は replacement だけ、noticeMs は 0、除外と承知は空", () => {
		expect(DEFAULTS.mojibakeSignals).toEqual(["replacement"]);
		expect(DEFAULTS.noticeMs).toBe(0);
		expect(DEFAULTS.excludeFolders).toEqual([]);
		expect(DEFAULTS.acknowledged).toEqual([]);
	});

	it("§9.2 の残りの既定値", () => {
		expect(DEFAULTS).toMatchObject({ schemaVersion: 1, scanOnStartup: true, batchMs: 1000,
			enabled: { invisible: true, nfd: true, windows: true, spaces: true, mojibake: true } });
	});

	it("写しを変えても既定値は変わらない", () => {
		const s = defaultSettings();
		s.acknowledged.push("x");
		s.mojibakeSignals.push("pua");
		s.enabled.nfd = false;
		expect(defaultSettings()).toEqual(DEFAULTS);
		expect(DEFAULTS.acknowledged).toEqual([]);
	});
});

describe("normalizeSettings", () => {
	it("data.json が無ければ既定値", () => {
		expect(normalizeSettings(null)).toEqual({ settings: DEFAULTS, problem: null });
		expect(normalizeSettings(undefined).problem).toBeNull();
	});

	it("欠けている項目・型の違う項目は既定値で埋める", () => {
		const { settings, problem } = normalizeSettings({
			schemaVersion: 1, enabled: { nfd: false, windows: "no" }, batchMs: -5, noticeMs: 8000, scanOnStartup: false,
			mojibakeSignals: ["replacement", "cp932-lead", "cp932-lead"], excludeFolders: [" /Foo/bar/ ", "", "Foo/bar"], acknowledged: [1, 2],
		});
		expect(problem).toBeNull();
		expect(settings).toEqual({ ...DEFAULTS, enabled: { ...DEFAULTS.enabled, nfd: false }, noticeMs: 8000, scanOnStartup: false,
			mojibakeSignals: ["replacement", "cp932-lead"], excludeFolders: ["Foo/bar"] });
	});

	it("承知キーはそのまま持つ(見えない文字や | を含んでも変えない)", () => {
		const acknowledged = ["invisible|開発ログ\u00826-09-05.md", "windows|a|b.md", "nfd|フ\u{309A}.md"];
		expect(normalizeSettings({ acknowledged }).settings.acknowledged).toEqual(acknowledged);
	});

	it("schemaVersion が違う・形が壊れているときは既定値で返し、問題を知らせる(呼び手が data.json を上書きしない)", () => {
		expect(normalizeSettings({ schemaVersion: 2, noticeMs: 5 })).toEqual({ settings: DEFAULTS, problem: "schema" });
		expect(normalizeSettings("oops")).toEqual({ settings: DEFAULTS, problem: "broken" });
		expect(normalizeSettings([1])).toEqual({ settings: DEFAULTS, problem: "broken" });
	});
});

describe("parseFolders", () => {
	it("1行に1つ。前後の空白と / を取り、空の行と重なりを落とす", () => {
		expect(parseFolders("Foo\r\n /日報/ \n\nFoo\n/")).toEqual(["Foo", "日報"]);
	});
});
