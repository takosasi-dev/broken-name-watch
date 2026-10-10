// 名前の判定の本体(FR-1〜FR-7・FR-13・§9.4)。純関数で、ほかの部品を読まず、端末も見ない(INV-5)。
// 見るのは名前(パスの最後の要素。拡張子込み)の文字だけ。位置はコードポイント単位・0 始まり。
// コードポイントは表で持ち、正規表現の Unicode の性質のクラスを使わない(D-13)。VaultDoctor の checks/ に移せる形(D-3)。

export type CheckId = "invisible" | "nfd" | "windows" | "spaces" | "mojibake";
export type Severity = "error" | "warning";

export const CHECK_IDS: readonly CheckId[] = ["invisible", "nfd", "windows", "spaces", "mojibake"];
/** 文字化けの印。replacement は確実な印(FR-5)、残りは較正してから足す候補(FR-6) */
export const MOJIBAKE_SIGNALS: readonly string[] = ["replacement", "cp932-lead", "pua", "halfwidth-after-kanji"];

/** 1つの名前の、1つの判定の当たり */
export interface NameHit {
	check: CheckId;
	severity: Severity;
	detail: string;        // 例 "U+0082" / "reserved name: CON" / "signal: replacement"
	positions: number[];   // 当たった文字の位置
}

export interface NameFinding extends NameHit {
	path: string;          // 実際のパス(正規化しない)
	kind: "file" | "folder";
}

export interface NameEntry {
	path: string;
	name: string;
	kind: "file" | "folder";
}

export interface CheckOptions {
	enabled: Readonly<Record<CheckId, boolean>>;
	mojibakeSignals: readonly string[];
	excludeFolders: readonly string[];
}

export const hex = (cp: number): string => "U+" + cp.toString(16).toUpperCase().padStart(4, "0");

/** §9.4 invisible。C0・DEL・C1 は error、書式文字は warning、それ以外は null。U+200D(絵文字の結合)は対象外 */
export function invisibleSeverity(cp: number): Severity | null {
	if (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f)) return "error";
	if (cp === 0xad || cp === 0x200b || cp === 0x200c || cp === 0x200e || cp === 0x200f
		|| (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x2064) || (cp >= 0x2066 && cp <= 0x2069)
		|| cp === 0xfeff) return "warning";
	return null;
}

/** 結合文字(FR-2): U+0300〜U+036F・U+3099・U+309A */
export const isCombining = (cp: number): boolean => (cp >= 0x300 && cp <= 0x36f) || cp === 0x3099 || cp === 0x309a;

const isSpace = (cp: number): boolean => cp === 0x20 || cp === 0x3000 || cp === 0xa0;
const codeSet = (text: string): Set<number> => new Set([...text].map((c) => c.codePointAt(0) ?? 0));

const WIN_FORBIDDEN = codeSet("<>:\"\\|?*");
// 最初の . より前が予約名(§4 の Microsoft の規則)。u を付けない(付けると K や ſ のような字まで大文字小文字の同一視に入る)
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(\.|$)/i;
const CP932_LEAD = codeSet("縺繧繝");
const isKanji = (cp: number): boolean => cp >= 0x4e00 && cp <= 0x9fff;
const isHalfKana = (cp: number): boolean => cp >= 0xff61 && cp <= 0xff9f;

/** 印の名前 → その印に当たる位置かどうか(§9.4 の候補の表) */
const SIGNALS = new Map<string, (cp: number, prev: number) => boolean>([
	["replacement", (cp) => cp === 0xfffd],
	["cp932-lead", (cp) => CP932_LEAD.has(cp)],
	["pua", (cp) => cp >= 0xe000 && cp <= 0xf8ff],
	["halfwidth-after-kanji", (cp, prev) => isHalfKana(cp) && isKanji(prev)],
]);

/** 名前1つを判定する。signals は文字化けの印の名前(知らない名前は無視する) */
export function checkName(name: string, signals: readonly string[]): NameHit[] {
	const chars = [...name];
	const cps = chars.map((c) => c.codePointAt(0) ?? 0);
	const last = cps.length - 1;
	const cp = (i: number): number => cps[i] ?? -1;
	const where = (pred: (cp: number, i: number) => boolean): number[] => cps.flatMap((c, i) => (pred(c, i) ? [i] : []));
	const codes = (pos: number[]): string => [...new Set(pos.map((i) => hex(cp(i))))].join(" ");
	const hits: NameHit[] = [];

	const inv = where((c) => invisibleSeverity(c) !== null);
	if (inv.length) {
		const severity = inv.some((i) => invisibleSeverity(cp(i)) === "error") ? "error" : "warning";
		hits.push({ check: "invisible", severity, detail: codes(inv), positions: inv });
	}

	if (name !== name.normalize("NFC")) {
		// 結合文字と、1文字だけで NFC が別の字になる物(CJK 互換漢字)の位置。ハングルの字母のように位置の出ない物もある
		const pos = where((c, i) => isCombining(c) || chars[i]?.normalize("NFC") !== chars[i]);
		hits.push({ check: "nfd", severity: "warning", detail: pos.length ? codes(pos) : "not NFC", positions: pos });
	}

	const bad = where((c) => WIN_FORBIDDEN.has(c));
	const tail = cp(last) === 0x20 || cp(last) === 0x2e ? [last] : [];
	const reserved = WIN_RESERVED.exec(name)?.[1];
	if (bad.length || tail.length || reserved !== undefined) {
		const parts: string[] = [];
		if (bad.length) parts.push(`forbidden: ${[...new Set(bad.map((i) => chars[i]))].join(" ")}`);
		if (tail.length) parts.push(cp(last) === 0x20 ? "trailing space" : "trailing period");
		if (reserved !== undefined) parts.push(`reserved name: ${reserved.toUpperCase()}`);
		hits.push({ check: "windows", severity: "error", detail: parts.join("; "), positions: [...bad, ...tail] });
	}

	// 先頭・最後の拡張子の直前・最後(FR-4)。拡張子は最後の . より後ろに1文字以上あるとき
	const dot = chars.lastIndexOf(".");
	const sp = [0, dot >= 1 && dot < last ? dot - 1 : -1, last].filter((i, n, all) => i >= 0 && isSpace(cp(i)) && all.indexOf(i) === n);
	if (sp.length) hits.push({ check: "spaces", severity: "warning", detail: codes(sp), positions: sp });

	const fired: string[] = [];
	const moji = new Set<number>();
	for (const s of new Set(signals)) {
		const test = SIGNALS.get(s);
		const pos = test ? where((c, i) => test(c, cp(i - 1))) : [];
		if (pos.length) fired.push(s);
		for (const i of pos) moji.add(i);
	}
	if (fired.length) {
		hits.push({ check: "mojibake", severity: "error", detail: `signal: ${fired.join(", ")}`, positions: [...moji].sort((a, b) => a - b) });
	}
	return hits;
}

/** FR-13: path が除外フォルダの配下か。`Foo` は `Foo/` の配下だけに効く。比べる前に NFC にそろえる(文字コード・改行ルール §5) */
export function isExcluded(path: string, folders: readonly string[]): boolean {
	if (folders.length === 0) return false;
	const p = path.normalize("NFC");
	return folders.some((f) => f !== "" && p.startsWith(f.normalize("NFC") + "/"));
}

/** 名前の一覧を判定する(FR-7)。1つの名前で例外が出たら、その名前を failed に入れて続ける(§10) */
export function checkEntries(entries: Iterable<NameEntry>, o: CheckOptions): { findings: NameFinding[]; failed: string[] } {
	const findings: NameFinding[] = [];
	const failed: string[] = [];
	for (const e of entries) {
		if (isExcluded(e.path, o.excludeFolders)) continue;
		try {
			for (const hit of checkName(e.name, o.mojibakeSignals)) {
				if (o.enabled[hit.check]) findings.push({ ...hit, path: e.path, kind: e.kind });
			}
		} catch {
			failed.push(e.path);
		}
	}
	return { findings, failed };
}
