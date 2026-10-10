// 設定画面(FR-16。getSettingDefinitions、1.13.0 以降): 判定ごとの ON/OFF・文字化けの印・起動時の判定・時間・除外フォルダ・承知の件数と全解除。
// 保存は Plugin.saveData() だけ(INV-1)。承知の全解除は確認の窓を出してから行う。
import { App, ConfirmationModal, PluginSettingTab, type SettingDefinition, type SettingDefinitionItem } from "obsidian";
import { CHECK_IDS, MOJIBAKE_SIGNALS, type CheckId } from "./checks/nameChecks";
import { CHECK_LABEL } from "./display";
import type BrokenNameWatchPlugin from "./main";
import { parseFolders } from "./settings";

const CHECK_DESC: Record<CheckId, string> = {
	invisible: "制御文字(C0・DEL・C1)と、ゼロ幅スペースや BOM のような書式文字を含む名前。",
	nfd: "NFC にそろっていない名前(「フ」と結合用の半濁点に分かれた形や、CJK 互換漢字)。",
	windows: "< > : \" \\ | ? * を含む名前、最後が空白かピリオドの名前、予約名(CON・NUL・COM1 など)。",
	spaces: "先頭・最後の拡張子の直前・最後に空白(半角・全角・U+00A0)がある名前。",
	mojibake: "下の「文字化けの印」のどれかに当たる名前。",
};

const SIGNAL_TEXT: Record<string, [string, string]> = {
	replacement: ["置き換え文字", "U+FFFD を含む。変換で落ちた字の跡で、確実な印。"],
	"cp932-lead": ["縺・繧・繝", "この3つの漢字のどれかを含む。UTF-8 の仮名を Shift-JIS として読んだときに出る。"],
	pua: ["私用領域の文字", "U+E000〜U+F8FF の文字を含む。"],
	"halfwidth-after-kanji": ["漢字の直後の半角カナ", "漢字のすぐ後ろに半角カナがある。"],
};

const CHECK_KEY = "check:";
const SIGNAL_KEY = "signal:";

export class BrokenNameWatchSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly owner: BrokenNameWatchPlugin) {
		super(app, owner);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const s = this.owner.settings;
		const toggle = (name: string, desc: string, key: string): SettingDefinition => ({ name, desc, control: { type: "toggle", key } });
		return [
			{ type: "group", items: CHECK_IDS.map((id) => toggle(CHECK_LABEL[id], CHECK_DESC[id], CHECK_KEY + id)) },
			{ type: "group", heading: "文字化けの印", items: MOJIBAKE_SIGNALS.map((sig) => {
				const [name, desc] = SIGNAL_TEXT[sig] ?? [sig, ""];
				return toggle(name, desc, SIGNAL_KEY + sig);
			}) },
			{ type: "group", heading: "知らせ方", items: [
				toggle("起動時に全部の名前を調べる", "Obsidian が閉じている間にできた名前も拾う。", "scanOnStartup"),
				{ name: "まとめる時間(ミリ秒)", desc: "この時間の間に見つかった名前を、1つの通知にまとめる。",
					control: { type: "number", key: "batchMs", min: 0, step: 100 } },
				{ name: "通知を出しておく時間(ミリ秒)", desc: "0 なら、押すまで消えない。",
					control: { type: "number", key: "noticeMs", min: 0, step: 1000 } },
			] },
			{ type: "group", heading: "除外フォルダ", items: [
				{ name: "調べないフォルダ", desc: "1行に1つ、vault からの相対パスで書く。そのフォルダの配下の名前を調べない。",
					control: { type: "textarea", key: "excludeFolders", rows: 3 } },
			] },
			{ type: "group", heading: "承知", items: [
				{ name: "承知をすべて解除", desc: `承知 ${s.acknowledged.length} 件。うち、どの名前にも当たっていない承知 ${this.owner.staleAckCount()} 件。`,
					disabled: () => this.owner.settings.acknowledged.length === 0,
					action: () => this.confirmClear() },
			] },
		];
	}

	getControlValue(key: string): unknown {
		const s = this.owner.settings;
		if (key.startsWith(CHECK_KEY)) return s.enabled[key.slice(CHECK_KEY.length) as CheckId];
		if (key.startsWith(SIGNAL_KEY)) return s.mojibakeSignals.includes(key.slice(SIGNAL_KEY.length));
		if (key === "excludeFolders") return s.excludeFolders.join("\n");
		if (key === "scanOnStartup") return s.scanOnStartup;
		if (key === "batchMs") return s.batchMs;
		if (key === "noticeMs") return s.noticeMs;
		return undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const s = this.owner.settings;
		if (key.startsWith(CHECK_KEY)) {
			s.enabled[key.slice(CHECK_KEY.length) as CheckId] = value === true;
		} else if (key.startsWith(SIGNAL_KEY)) {
			const sig = key.slice(SIGNAL_KEY.length);
			s.mojibakeSignals = s.mojibakeSignals.filter((x) => x !== sig);
			if (value === true) s.mojibakeSignals.push(sig);
		} else if (key === "excludeFolders") {
			s.excludeFolders = parseFolders(String(value));
		} else if (key === "scanOnStartup") {
			s.scanOnStartup = value === true;
		} else if (key === "batchMs" || key === "noticeMs") {
			const n = Number(value);
			if (!Number.isInteger(n) || n < 0) return;   // 不正な値は保存しない
			s[key] = n;
		}
		await this.owner.saveSettings();
	}

	private confirmClear(): void {
		const n = this.owner.settings.acknowledged.length;
		new ConfirmationModal(this.app)
			.setTitle("承知をすべて解除")
			.setContent(`承知 ${n} 件を解除します。解除した名前は、次の起動時にまた知らせます。`)
			.addButton((b) => b.setButtonText("解除する").setDestructive().onClick(async () => {
				this.owner.settings.acknowledged = [];
				await this.owner.saveSettings();
				this.update();
			}))
			.addCancelButton()
			.open();
	}
}
