// 設定の型・既定値・読み込みの補い(§9.2)。設定タブは settingsTab.ts に分けた(ここはテストで読むので画面の部品を読まない)。
// 欠けた項目は既定値で埋める。schemaVersion が違う・形が壊れているときは既定で返し、呼び手が data.json を上書きしない。
import { CHECK_IDS, type CheckId } from "./checks/nameChecks";

export interface Settings {
	schemaVersion: 1;
	enabled: Record<CheckId, boolean>;
	mojibakeSignals: string[];
	scanOnStartup: boolean;
	batchMs: number;
	noticeMs: number;
	excludeFolders: string[];
	acknowledged: string[];
}

export const DEFAULTS: Settings = {
	schemaVersion: 1,
	enabled: { invisible: true, nfd: true, windows: true, spaces: true, mojibake: true },
	mojibakeSignals: ["replacement"],   // D-14。ほかの印は較正の結果を見て設定で足す(FR-6)
	scanOnStartup: true,                // FR-10
	batchMs: 1000,                      // 仮(§8.6)
	noticeMs: 0,                        // 0 = 押すまで消えない(D-10)
	excludeFolders: [],
	acknowledged: [],
};

export type LoadProblem = "schema" | "broken" | null;

/** 既定値の写し(配列と表を共有しない) */
export function defaultSettings(): Settings {
	return { ...DEFAULTS, enabled: { ...DEFAULTS.enabled }, mojibakeSignals: [...DEFAULTS.mojibakeSignals], excludeFolders: [], acknowledged: [] };
}

/** フォルダの指定を vault からの相対パスにそろえる(前後の空白と / を取る) */
export const normFolder = (text: string): string => text.trim().replace(/^\/+|\/+$/g, "");

const folders = (list: readonly string[]): string[] => [...new Set(list.map(normFolder).filter((f) => f !== ""))];

/** 1行に1つのフォルダの文字 → 一覧 */
export const parseFolders = (text: string): string[] => folders(text.split(/\r?\n/));

const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const isMs = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** data.json の中身を Settings にする */
export function normalizeSettings(raw: unknown): { settings: Settings; problem: LoadProblem } {
	const base = defaultSettings();
	if (raw === null || raw === undefined) return { settings: base, problem: null };
	if (typeof raw !== "object" || Array.isArray(raw)) return { settings: base, problem: "broken" };
	const r = raw as Record<string, unknown>;
	if (r.schemaVersion !== undefined && r.schemaVersion !== 1) return { settings: base, problem: "schema" };
	const enabled = (typeof r.enabled === "object" && r.enabled !== null ? r.enabled : {}) as Record<string, unknown>;
	for (const id of CHECK_IDS) {
		const v = enabled[id];
		if (typeof v === "boolean") base.enabled[id] = v;
	}
	if (isStrList(r.mojibakeSignals)) base.mojibakeSignals = [...new Set(r.mojibakeSignals)];
	if (typeof r.scanOnStartup === "boolean") base.scanOnStartup = r.scanOnStartup;
	if (isMs(r.batchMs)) base.batchMs = r.batchMs;
	if (isMs(r.noticeMs)) base.noticeMs = r.noticeMs;
	if (isStrList(r.excludeFolders)) base.excludeFolders = folders(r.excludeFolders);
	if (isStrList(r.acknowledged)) base.acknowledged = [...new Set(r.acknowledged)];
	return { settings: base, problem: null };
}
