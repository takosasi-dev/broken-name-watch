// 名前を見える形にする(D-15・INV-7): 見えない文字・結合文字・U+00A0・U+3000 を [U+XXXX] にする。
// 判定の日本語の名前、Notice の行、当たった文字と位置の文(§9.5)もここで作る。純関数。
import { hex, invisibleSeverity, isCombining, type CheckId, type NameFinding, type NameHit } from "./checks/nameChecks";

export const CHECK_LABEL: Record<CheckId, string> = {
	invisible: "見えない文字",
	nfd: "NFC でない",
	windows: "Windows で使えない名前",
	spaces: "前後の空白",
	mojibake: "文字化けの疑い",
};

/** Notice に名前を並べる件数(§9.5)。残りは「ほか N 件」 */
const NOTICE_NAMES = 3;
/** 一覧の1行に並べる位置の数。残りは「ほか N か所」 */
const MAX_POSITIONS = 8;

const shown = (cp: number): boolean => invisibleSeverity(cp) !== null || isCombining(cp) || cp === 0xa0 || cp === 0x3000;

/** 見える形。例 `開発ログ[U+0082]6-09-05.md` */
export function visible(text: string): string {
	let out = "";
	for (const c of text) {
		const cp = c.codePointAt(0) ?? 0;
		out += shown(cp) ? `[${hex(cp)}]` : c;
	}
	return out;
}

/** パスの最後の要素(判定する名前) */
export const baseName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

export interface NameGroup {
	path: string;
	kind: "file" | "folder";
	findings: NameFinding[];
}

/** 同じパスの当たりを1つにまとめる(1つの名前が複数の判定に当たっても1行。§10)。順は最初に出た順 */
export function groupByPath(findings: readonly NameFinding[]): NameGroup[] {
	const groups = new Map<string, NameGroup>();
	for (const f of findings) {
		const g = groups.get(f.path);
		if (g) g.findings.push(f);
		else groups.set(f.path, { path: f.path, kind: f.kind, findings: [f] });
	}
	return [...groups.values()];
}

/** Notice の行(§9.5)。1行目は件数、続けて先頭3件の「見える形の名前(判定の名前)」、4件目からは「ほか N 件」 */
export function noticeLines(title: string, findings: readonly NameFinding[]): string[] {
	const groups = groupByPath(findings);
	const lines = [`${title}: 壊れた名前が ${groups.length} 件`];
	for (const g of groups.slice(0, NOTICE_NAMES)) {
		lines.push(`${visible(baseName(g.path))}(${g.findings.map((f) => CHECK_LABEL[f.check]).join("・")})`);
	}
	if (groups.length > NOTICE_NAMES) lines.push(`ほか ${groups.length - NOTICE_NAMES} 件`);
	return lines;
}

/** 当たった文字と位置(例 `U+0082(5 文字目)`)。位置で言えない当たり(予約名・文字化けの印)は detail から足す */
export function describeHit(name: string, hit: NameHit): string {
	const chars = [...name];
	const parts = hit.positions.slice(0, MAX_POSITIONS).map((i) => {
		const c = chars[i] ?? "";
		const literal = c !== " " && visible(c) === c ? `「${c}」` : "";
		return `${hex(c.codePointAt(0) ?? 0)}${literal}(${i + 1} 文字目)`;
	});
	if (hit.positions.length > MAX_POSITIONS) parts.push(`ほか ${hit.positions.length - MAX_POSITIONS} か所`);
	for (const seg of hit.detail.split("; ")) {
		if (seg.startsWith("reserved name: ")) parts.push(`予約名 ${seg.slice("reserved name: ".length)}`);
		if (seg.startsWith("signal: ")) parts.push(`印 ${seg.slice("signal: ".length)}`);
	}
	return parts.join("、");
}
