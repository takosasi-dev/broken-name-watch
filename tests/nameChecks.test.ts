// 判定の表(§9.4)の「出る例」「出ない例」(AC-2)と、位置・重さ・文字化けの印・除外・フォルダの扱い。
// §8.3 のコンソールの述語(仕様書から写した物)と、合成の名前で結果が同じになることも確かめる(AC-12 の下支え)。
import { describe, expect, it } from "vitest";
import { checkEntries, checkName, isExcluded, type CheckId, type CheckOptions, type NameEntry } from "../src/checks/nameChecks";
import { SPEC_83, SPEC_83_KEYS, type Spec83Key } from "./spec83";

const hit = (name: string, check: CheckId, signals: string[] = ["replacement"]) => checkName(name, signals).find((h) => h.check === check);
const ALL: CheckOptions = {
	enabled: { invisible: true, nfd: true, windows: true, spaces: true, mojibake: true },
	mojibakeSignals: ["replacement"],
	excludeFolders: [],
};
const entry = (path: string, kind: "file" | "folder" = "file"): NameEntry => ({ path, name: path.slice(path.lastIndexOf("/") + 1), kind });

// §9.4 の表を写した物(実在のファイル名だった例は、同じ形の作り物に替えた)
const TABLE: Record<CheckId, { yes: string[]; no: string[] }> = {
	invisible: { yes: ["開発ログ\u00826-09-05.md", "\u{FEFF}メモ.md", "a\u{200B}b.md"], no: ["\u{1F468}\u{200D}\u{1F4BB}.md", "2026-09-26.md"] },
	nfd: { yes: ["フ\u{309A}.md", "\u{F900}.md"], no: ["プ.md", "ｶﾀｶﾅ.md"] },
	windows: { yes: ["a:b.md", "x?.md", "CON.md", "con.txt.md", "COM¹.md", "a.", "a "], no: ["console.md", "CONFIG.md", "COM10.md", "14-1_A.B. Sample & Co.md"] },
	spaces: { yes: [" a.md", "a .md", "メモ\u{3000}.md"], no: ["a b.md", "Sample App設定(下書きの写し).md"] },
	mojibake: { yes: ["x\u{FFFD}.md"], no: ["00_XYZ_INDEX_全体像と優先順位.md", "髢狗匱.md"] },
};

// §8.2 (b) の合成の例(仕様書の表の「化けた名前」と同じ作り方。先頭の英字は作り物に替えた)
const SYNTH = ["00_XYZ_INDEX_蜈ｨ菴灘ワ縺ｨ蜆ｪ蜈磯\u{F8F0}\u{FFFD}菴\u{FFFD}.md", "髢狗匱繝ｭ繧ｰ", "XY讖溘Ξ繝昴\u{FFFD}ｼ繝\u{FFFD}"];

describe("§9.4 の表(AC-2)", () => {
	for (const [check, { yes, no }] of Object.entries(TABLE) as [CheckId, { yes: string[]; no: string[] }][]) {
		it(`${check}: 出る例は全部当たり、出ない例は全部当たらない`, () => {
			for (const name of yes) expect(hit(name, check), JSON.stringify(name)).toBeDefined();
			for (const name of no) expect(hit(name, check), JSON.stringify(name)).toBeUndefined();
		});
	}
});

describe("重さ・位置・detail", () => {
	it("invisible: C0・DEL・C1 は error、書式文字は warning。位置はコードポイント単位で 0 始まり", () => {
		expect(hit("開発ログ\u00826-09-05.md", "invisible")).toEqual({ check: "invisible", severity: "error", detail: "U+0082", positions: [4] });
		expect(hit("a\u{200B}b.md", "invisible")).toMatchObject({ severity: "warning", detail: "U+200B", positions: [1] });
		expect(hit("\u007Fa\u0000", "invisible")).toMatchObject({ severity: "error", detail: "U+007F U+0000", positions: [0, 2] });
		expect(hit("a\u{00AD}b\u0082", "invisible")?.severity).toBe("error");   // 両方あれば重い方
		for (const cp of [0xad, 0x200b, 0x200c, 0x200e, 0x200f, 0x202a, 0x202e, 0x2060, 0x2064, 0x2066, 0x2069, 0xfeff]) {
			expect(hit(`a${String.fromCodePoint(cp)}`, "invisible")?.severity, cp.toString(16)).toBe("warning");
		}
		for (const cp of [0x200d, 0x2065, 0x202f, 0x2029, 0xa0, 0x3000]) {
			expect(hit(`a${String.fromCodePoint(cp)}b`, "invisible"), cp.toString(16)).toBeUndefined();
		}
	});

	it("サロゲートペアの後ろでも位置は文字の数で数える", () => {
		expect(hit("\u{1F468}\u0082.md", "invisible")?.positions).toEqual([1]);
	});

	it("nfd: 結合文字と、1文字で NFC が変わる字の位置を出す。NFC の名前に残る結合文字は当たらない", () => {
		expect(hit("フ\u{309A}_nfd.md", "nfd")).toEqual({ check: "nfd", severity: "warning", detail: "U+309A", positions: [1] });
		expect(hit("a\u{F900}.md", "nfd")).toMatchObject({ detail: "U+F900", positions: [1] });
		expect(hit("e\u{0301}.md", "nfd")?.positions).toEqual([1]);
		expect(hit("x\u{0300}.md", "nfd")).toBeUndefined();          // 合成先が無いので NFC のまま
		expect(hit("\u{1100}\u{1161}.md", "nfd")).toMatchObject({ detail: "not NFC", positions: [] });   // ハングルの字母
	});

	it("windows: 文字・末尾・予約名", () => {
		expect(hit("a:b?.md", "windows")).toEqual({ check: "windows", severity: "error", detail: "forbidden: : ?", positions: [1, 3] });
		expect(hit("x?", "windows")?.positions).toEqual([1]);
		expect(hit("a.", "windows")).toMatchObject({ detail: "trailing period", positions: [1] });
		expect(hit("a ", "windows")).toMatchObject({ detail: "trailing space", positions: [1] });
		expect(hit("con.txt.md", "windows")).toMatchObject({ detail: "reserved name: CON", positions: [] });
		expect(hit("LPT³", "windows")?.detail).toBe("reserved name: LPT³");
		for (const name of ["nul", "Aux.md", "com9.md", "PRN.tar.gz"]) expect(hit(name, "windows"), name).toBeDefined();
		for (const name of ["COM0.md", "LPT.md", "nulls.md", "a.con", "\u{212A}on.md", "a\u{3000}"]) expect(hit(name, "windows"), name).toBeUndefined();
		for (const c of "<>:\"\\|?*") expect(hit(`a${c}b`, "windows"), c).toBeDefined();
	});

	it("spaces: 先頭・最後の拡張子の直前・最後。空白は U+0020・U+3000・U+00A0", () => {
		expect(hit(" a .md", "spaces")).toEqual({ check: "spaces", severity: "warning", detail: "U+0020", positions: [0, 2] });
		expect(hit("メモ\u{3000}.md", "spaces")).toMatchObject({ detail: "U+3000", positions: [2] });
		expect(hit("a\u{00A0}", "spaces")?.positions).toEqual([1]);
		expect(hit(" ", "spaces")?.positions).toEqual([0]);
		expect(hit("a .b.md", "spaces")).toBeUndefined();          // 最後の拡張子の直前ではない
		expect(hit("a .", "spaces")).toBeUndefined();              // . の後ろに文字が無い(windows の末尾には当たる)
		expect(hit("a\t.md", "spaces")).toBeUndefined();           // タブは invisible の担当
	});

	it("1つの名前が複数の判定に当たる(末尾の空白は windows と spaces)", () => {
		expect(checkName("a ", ["replacement"]).map((h) => h.check)).toEqual(["windows", "spaces"]);
	});
});

describe("文字化けの印(FR-5・FR-6)", () => {
	it("replacement だけなら U+FFFD だけに当たる", () => {
		expect(hit("x\u{FFFD}.md", "mojibake")).toEqual({ check: "mojibake", severity: "error", detail: "signal: replacement", positions: [1] });
		expect(SYNTH.map((n) => hit(n, "mojibake") !== undefined)).toEqual([true, false, true]);
	});

	it("候補の印ごとの、合成の例3つの検出(§8.6 の較正の表と同じ数)", () => {
		const detected = (signal: string) => SYNTH.map((n) => hit(n, "mojibake", [signal]) !== undefined);
		expect(detected("cp932-lead")).toEqual([true, true, true]);
		expect(detected("pua")).toEqual([true, false, false]);
		expect(detected("halfwidth-after-kanji")).toEqual([true, true, false]);
	});

	it("当たった印の名前と位置をまとめる。知らない印と空の一覧は当たらない", () => {
		expect(hit("髢狗匱繝ｭ繧ｰ", "mojibake", ["replacement", "cp932-lead", "halfwidth-after-kanji"]))
			.toMatchObject({ detail: "signal: cp932-lead, halfwidth-after-kanji", positions: [3, 4, 5, 6] });
		expect(hit("x\u{FFFD}縺", "mojibake", ["no-such-signal", "constructor"])).toBeUndefined();
		expect(hit("x\u{FFFD}縺", "mojibake", [])).toBeUndefined();
	});

	it("ふつうの名前には候補の印も当たらない", () => {
		const all = ["replacement", "cp932-lead", "pua", "halfwidth-after-kanji"];
		for (const name of ["00_XYZ_INDEX_全体像と優先順位.md", "開発ログ", "ｶﾀｶﾅ.md", "kanaｶﾅ漢字.md", "2026-09-26.md"]) {
			expect(hit(name, "mojibake", all), name).toBeUndefined();
		}
		expect(hit("漢字ｶﾅ.md", "mojibake", all)?.detail).toBe("signal: halfwidth-after-kanji");   // この印の誤検出の形
	});
});

describe("checkEntries(FR-7・FR-13・§10)", () => {
	it("壊れたフォルダはフォルダ自身を1件として出し、配下は自分の名前で判定する", () => {
		const { findings } = checkEntries([entry("dir\u0082", "folder"), entry("dir\u0082/ok.md"), entry("ok/フ\u{309A}.md")], ALL);
		expect(findings.map((f) => [f.path, f.kind, f.check])).toEqual([["dir\u0082", "folder", "invisible"], ["ok/フ\u{309A}.md", "file", "nfd"]]);
	});

	it("OFF にした判定は出さない", () => {
		const o = { ...ALL, enabled: { ...ALL.enabled, nfd: false } };
		expect(checkEntries([entry("フ\u{309A}.md"), entry("a\u0082.md")], o).findings.map((f) => f.check)).toEqual(["invisible"]);
	});

	it("除外フォルダ: Foo は Foo/ の配下だけに効き、FooBar/ と Foo 自身には効かない", () => {
		const o = { ...ALL, excludeFolders: ["Foo"] };
		const paths = ["Foo/a\u0082.md", "Foo/sub/b\u0082.md", "FooBar/c\u0082.md", "x/Foo/d\u0082.md"];
		expect(checkEntries(paths.map((p) => entry(p)), o).findings.map((f) => f.path)).toEqual(["FooBar/c\u0082.md", "x/Foo/d\u0082.md"]);
		expect(isExcluded("Foo", ["Foo"])).toBe(false);
		expect(isExcluded("フ\u{309A}/a.md", ["プ"])).toBe(true);     // 比べるときは NFC にそろえる
		expect(isExcluded("a/b.md", [""])).toBe(false);
	});

	it("1つの名前で例外が出ても、ほかの名前の判定は続ける", () => {
		const boom = { path: "boom.md", kind: "file" as const, get name(): string { throw new Error("x"); } };
		const { findings, failed } = checkEntries([boom, entry("a\u0082.md")], ALL);
		expect(failed).toEqual(["boom.md"]);
		expect(findings.map((f) => f.path)).toEqual(["a\u0082.md"]);
	});
});

describe("§8.3 のコンソールの述語と同じ結果になる", () => {
	const mine: Record<Spec83Key, (n: string) => boolean> = {
		invisible: (n) => hit(n, "invisible") !== undefined, nfd: (n) => hit(n, "nfd") !== undefined,
		windows: (n) => hit(n, "windows") !== undefined, spaces: (n) => hit(n, "spaces") !== undefined,
		fffd: (n) => hit(n, "mojibake") !== undefined, cjk: (n) => hit(n, "mojibake", ["cp932-lead"]) !== undefined,
		pua: (n) => hit(n, "mojibake", ["pua"]) !== undefined, hwk: (n) => hit(n, "mojibake", ["halfwidth-after-kanji"]) !== undefined,
	};

	it("部品を3つまで並べた合成の名前すべてで一致する", () => {
		const parts = ["a", "B", ".", " ", "\u{3000}", "\u{00A0}", ":", "?", "\\", "\u0082", "\u0009", "\u{200B}", "\u{200D}", "\u{309A}", "フ", "プ",
			"\u{FFFD}", "con", "COM1", "lpt¹", "nul.", "縺", "\u{E000}", "\u{F8FF}", "漢", "ｶ", "\u{F900}", "\u{1F468}", ".md"];
		let count = 0;
		const diff: string[] = [];
		const each = (name: string) => {
			count++;
			for (const k of SPEC_83_KEYS) if (SPEC_83[k](name) !== mine[k](name)) diff.push(`${k}: ${JSON.stringify(name)}`);
		};
		for (const a of parts) {
			each(a);
			for (const b of parts) {
				each(a + b);
				for (const c of parts) each(a + b + c);
			}
		}
		expect(count).toBe(parts.length + parts.length ** 2 + parts.length ** 3);
		expect(diff.slice(0, 10)).toEqual([]);
	});
});
