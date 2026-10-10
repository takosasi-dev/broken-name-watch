// 見える形(D-15・INV-7)・Notice の行(§9.5)・当たった文字と位置の文。
import { describe, expect, it } from "vitest";
import { checkEntries, checkName, type CheckOptions, type NameFinding } from "../src/checks/nameChecks";
import { baseName, describeHit, groupByPath, noticeLines, visible } from "../src/display";

const ALL: CheckOptions = {
	enabled: { invisible: true, nfd: true, windows: true, spaces: true, mojibake: true },
	mojibakeSignals: ["replacement"],
	excludeFolders: [],
};
const find = (...paths: string[]): NameFinding[] =>
	checkEntries(paths.map((path) => ({ path, name: baseName(path), kind: "file" as const })), ALL).findings;

describe("visible", () => {
	it("見えない文字・結合文字・U+00A0・U+3000 を [U+XXXX] にする", () => {
		expect(visible("開発ログ\u00826-09-05.md")).toBe("開発ログ[U+0082]6-09-05.md");
		expect(visible("フ\u{309A}_nfd.md")).toBe("フ[U+309A]_nfd.md");
		expect(visible("\u{FEFF}a\u{200B}b\u0000c\u007F")).toBe("[U+FEFF]a[U+200B]b[U+0000]c[U+007F]");
		expect(visible("a\u{00A0}b\u{3000}c\u{0301}\u{3099}")).toBe("a[U+00A0]b[U+3000]c[U+0301][U+3099]");
	});

	it("見える文字はそのまま(絵文字の結合の U+200D・半角の空白・サロゲートペアも)", () => {
		for (const s of ["2026-09-26.md", "\u{1F468}\u{200D}\u{1F4BB}.md", "a b.md", "プ.md", "ｶﾀｶﾅ", "x\u{FFFD}"]) expect(visible(s)).toBe(s);
	});
});

describe("noticeLines(§9.5)", () => {
	it("1行目は件数、続けて見える形の名前と判定の名前", () => {
		expect(noticeLines("Broken Name Watch", find("開発ログ\u00826-09-05.md", "フ\u{309A}_nfd.md"))).toEqual([
			"Broken Name Watch: 壊れた名前が 2 件",
			"開発ログ[U+0082]6-09-05.md(見えない文字)",
			"フ[U+309A]_nfd.md(NFC でない)",
		]);
	});

	it("名前は先頭3件まで。4件目からは「ほか N 件」(19 件が一度に壊れたとき)", () => {
		const lines = noticeLines("T", find(...Array.from({ length: 19 }, (_, i) => `t\u0082${i + 1}.md`)));
		expect(lines).toEqual(["T: 壊れた名前が 19 件", "t[U+0082]1.md(見えない文字)", "t[U+0082]2.md(見えない文字)", "t[U+0082]3.md(見えない文字)", "ほか 16 件"]);
	});

	it("1つの名前が複数の判定に当たれば1行にまとめ、件数は名前で数える。フォルダの中の名前は最後の要素だけ出す", () => {
		const findings = find("dir/a ", "b.md", "c\u0082?.md");
		expect(groupByPath(findings).map((g) => g.findings.length)).toEqual([2, 2]);
		expect(noticeLines("T", findings)).toEqual(["T: 壊れた名前が 2 件", "a (Windows で使えない名前・前後の空白)", "c[U+0082]?.md(見えない文字・Windows で使えない名前)"]);
	});
});

describe("describeHit", () => {
	const desc = (name: string, signals = ["replacement"]) => checkName(name, signals).map((h) => describeHit(name, h));

	it("位置は 1 始まりの「N 文字目」。見えない文字はコードポイントだけ、見える文字は字も添える", () => {
		expect(desc("開発ログ\u00826-09-05.md")).toEqual(["U+0082(5 文字目)"]);
		expect(desc("フ\u{309A}.md")).toEqual(["U+309A(2 文字目)"]);
		expect(desc("a:b?.md")).toEqual(["U+003A「:」(2 文字目)、U+003F「?」(4 文字目)"]);
		expect(desc(" a.md")).toEqual(["U+0020(1 文字目)"]);
		expect(desc("メモ\u{3000}.md")).toEqual(["U+3000(3 文字目)"]);
	});

	it("予約名と文字化けの印は言葉で足す", () => {
		expect(desc("con.txt.md")).toEqual(["予約名 CON"]);
		expect(desc("x\u{FFFD}縺.md", ["replacement", "cp932-lead"])).toEqual(["U+FFFD「\u{FFFD}」(2 文字目)、U+7E3A「縺」(3 文字目)、印 replacement, cp932-lead"]);
		expect(desc("\u{1100}\u{1161}.md")).toEqual([""]);
	});

	it("位置が多いときは 8 か所までで、残りは数だけ", () => {
		expect(desc("\u0082".repeat(11))[0]?.endsWith("U+0082(8 文字目)、ほか 3 か所")).toBe(true);
	});
});
