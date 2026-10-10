// src/ を文字で調べる受け入れ基準(AC-3〜AC-6)と、manifest(AC-17 の一部)・コマンド(AC-18 の一部)。毎回のテストで回して戻りを防ぐ。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((n) => {
		const p = join(dir, n);
		return statSync(p).isDirectory() ? sources(p) : p.endsWith(".ts") ? [p] : [];
	});
}

const read = (dir: string) => sources(dir).map((p) => ({ p, text: readFileSync(p, "utf8") }));
const hits = (dir: string, words: string[]) => read(dir).flatMap(({ p, text }) => words.filter((w) => text.includes(w)).map((w) => `${p}: ${w}`));

describe("src/ の文字の検査", () => {
	it("§9.6 のファイルがある", () => {
		expect(sources("src").map((p) => p.replace(/\\/g, "/")).sort()).toEqual(["src/ack.ts", "src/batch.ts", "src/checks/nameChecks.ts",
			"src/display.ts", "src/listModal.ts", "src/main.ts", "src/notice.ts", "src/settings.ts", "src/settingsTab.ts"]);
	});

	it("AC-3: 書き込み系と本文の読み取りが 0 件(INV-1・INV-8)", () => {
		expect(hits("src", ["vault.modify", "vault.create", "vault.delete", "vault.trash", "vault.rename", "vault.process",
			"vault.append", "adapter.", "fileManager", "renameFile", "cachedRead", "vault.read("])).toEqual([]);
	});

	it("AC-4: HTML を文字で入れる書き方が 0 件(INV-4)", () => {
		expect(hits("src", ["innerHTML", "outerHTML", "insertAdjacentHTML"])).toEqual([]);
	});

	it("AC-5: Node・Electron・通信が 0 件(INV-2・INV-3)", () => {
		const mods = ["fs", "path", "electron", "child_process"].flatMap((m) => [`from "${m}"`, `from '${m}'`, `from "node:${m}"`, `from 'node:${m}'`]);
		expect(hits("src", ["require(", ...mods, "fetch(", "requestUrl", "XMLHttpRequest", "WebSocket"])).toEqual([]);
	});

	it("AC-6: checks/ は obsidian を読まず、端末を見ない(INV-5)", () => {
		expect(hits("src/checks", ["from \"obsidian\"", "from 'obsidian'", "Platform"])).toEqual([]);
		for (const f of ["src/display.ts", "src/ack.ts", "src/batch.ts", "src/settings.ts"]) {   // §2 で純関数とした物も
			expect(readFileSync(f, "utf8").includes("obsidian\""), f).toBe(false);
		}
	});

	it("正規表現の後読みと \\p{...} を使わない(古い iOS・D-13)", () => {
		expect(hits("src", ["(?" + "<=", "(?" + "<!", "\\p{"])).toEqual([]);
	});

	it("ソースに、見えない文字・結合文字・私用領域の文字などを実文字で置かない(エスケープは波かっこの形で書く)", () => {
		// 4桁の Unicode エスケープは書き込みの道具が実文字に変えることがある。入ると NFD と NFC の見分けが付かないテストになる
		const bad = (p: number) => p < 0x09 || (p > 0x0a && p < 0x20) || (p >= 0x7f && p <= 0xa0) || p === 0xad
			|| (p >= 0x300 && p <= 0x36f) || (p >= 0x1100 && p <= 0x11ff) || (p >= 0x2000 && p <= 0x200f) || (p >= 0x2028 && p <= 0x202f)
			|| (p >= 0x2060 && p <= 0x206f) || p === 0x212a || p === 0x3000 || p === 0x3099 || p === 0x309a
			|| (p >= 0xe000 && p <= 0xf8ff) || (p >= 0xf900 && p <= 0xfaff) || p === 0xfeff || p === 0xfffd;
		const found = [...read("src"), ...read("tests")].flatMap(({ p, text }) =>
			[...new Set([...text].map((c) => c.codePointAt(0) ?? 0).filter(bad))].map((cp) => `${p}: U+${cp.toString(16).toUpperCase().padStart(4, "0")}`));
		expect(found).toEqual([]);
		for (const { p, text } of [...read("src"), ...read("tests")]) expect(text === text.normalize("NFC"), p).toBe(true);
	});

	it("各ファイルの先頭に責務のコメントがある(3行以内)", () => {
		for (const { p, text } of read("src")) {
			const lines = text.split("\n");
			const n = lines.findIndex((l) => !l.startsWith("//"));
			expect(n >= 1 && n <= 3, p).toBe(true);
		}
	});

	it("INV-6: 一覧のボタンは 承知・戻す・開く・パスをコピー だけ。console.log を残さない", () => {
		const modal = readFileSync("src/listModal.ts", "utf8");
		const labels = [...modal.matchAll(/createEl\("button", \{ text: ([^}]+) \}/g)].map((m) => m[1]);
		expect(labels).toEqual(["acked ? \"戻す\" : \"承知\"", "\"開く\"", "\"パスをコピー\""]);
		expect(modal.split("<button").length + modal.split("\"button\"").length - 2).toBe(labels.length);
		expect(hits("src", ["console.log"])).toEqual([]);
	});
});

describe("manifest とコマンド", () => {
	const m = JSON.parse(readFileSync("manifest.json", "utf8")) as Record<string, unknown>;
	const main = readFileSync("src/main.ts", "utf8");

	it("AC-17: isDesktopOnly が false、id は仮決めの broken-name-watch、description は §9.1 のまま", () => {
		expect(m.isDesktopOnly).toBe(false);
		expect(m.id).toBe("broken-name-watch");
		expect(m.id).not.toBe("name-guard");
		expect(m.description).toBe("Warn right after a file or folder gets a name with invisible characters, non-NFC text, or characters Windows cannot use.");
	});

	it("AC-18: コマンドは list-broken-names の1つで、既定のホットキーが無い(FR-17)", () => {
		expect(main.split("addCommand(").length - 1).toBe(1);
		expect(main).toContain("id: \"list-broken-names\", name: \"List broken file names\"");
		expect(hits("src", ["hotkeys"])).toEqual([]);
	});

	it("D-8: create と rename は onLayoutReady の中で登録する", () => {
		const ready = main.indexOf("onLayoutReady(");
		expect(ready).toBeGreaterThan(0);
		expect(main.indexOf("vault.on(\"create\"")).toBeGreaterThan(ready);
		expect(main.indexOf("vault.on(\"rename\"")).toBeGreaterThan(ready);
	});
});
