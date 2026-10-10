// Broken Name Watch の入口: 設定・コマンド・作成と名前の変更の監視(onLayoutReady の中で登録。D-8)・起動時の全件判定(FR-10)。
// vault から取るのは名前の一覧だけ。書き込みは saveData() による自分の data.json だけ(INV-1)。
import { Notice, Plugin, TFolder, type TAbstractFile } from "obsidian";
import { ackKey, staleAcks } from "./ack";
import { Batcher } from "./batch";
import { checkEntries, type NameEntry, type NameFinding } from "./checks/nameChecks";
import { noticeLines } from "./display";
import { ListModal } from "./listModal";
import { showFindingsNotice } from "./notice";
import { DEFAULTS, defaultSettings, normalizeSettings, type Settings } from "./settings";
import { BrokenNameWatchSettingTab } from "./settingsTab";

export default class BrokenNameWatchPlugin extends Plugin {
	settings: Settings = defaultSettings();
	/** data.json を読めなかった・形が違ったとき。既定で動かし、data.json を上書きしない(§9.2) */
	private locked = false;

	private readonly batcher = new Batcher({
		batchMs: () => this.settings.batchMs,
		setTimer: (fn, ms) => window.setTimeout(fn, ms),
		clearTimer: (id) => window.clearTimeout(id),
		exists: (path) => this.app.vault.getAbstractFileByPath(path) !== null,
		isAcked: (f) => this.settings.acknowledged.includes(ackKey(f)),
		emit: (findings) => showFindingsNotice(noticeLines(this.manifest.name, findings), this.settings.noticeMs, () => this.openList()),
	});

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new BrokenNameWatchSettingTab(this.app, this));
		this.addCommand({ id: "list-broken-names", name: "List broken file names", callback: () => this.openList() });
		this.register(() => this.batcher.cancel());
		// 起動時の読み込みでは既存の全ファイルに create が出るので、レイアウトの準備ができてから登録する(D-8)
		this.app.workspace.onLayoutReady(() => {
			const onName = (file: TAbstractFile): void => this.batcher.add(this.check([file]).findings);
			this.registerEvent(this.app.vault.on("create", onName));
			this.registerEvent(this.app.vault.on("rename", onName));
			if (this.settings.scanOnStartup) this.batcher.add(this.scan().findings);
		});
	}

	openList(): void {
		new ListModal(this).open();
	}

	/** 全件判定(FR-10・FR-11)。vault のルートは除く(FR-7) */
	scan(): { findings: NameFinding[]; failed: string[] } {
		return this.check(this.app.vault.getAllLoadedFiles());
	}

	/** 設定画面の「どの名前にも当たっていない承知」の件数(FR-12)。判定の ON/OFF と除外フォルダに左右されない数にする */
	staleAckCount(): number {
		const all = this.check(this.app.vault.getAllLoadedFiles(), { ...this.settings, enabled: DEFAULTS.enabled, excludeFolders: [] });
		return staleAcks(all.findings, this.settings.acknowledged).length;
	}

	private check(files: TAbstractFile[], options: Settings = this.settings): { findings: NameFinding[]; failed: string[] } {
		const entries: NameEntry[] = [];
		for (const f of files) {
			const folder = f instanceof TFolder;
			if (folder && f.isRoot()) continue;
			entries.push({ path: f.path, name: f.name, kind: folder ? "folder" : "file" });
		}
		return checkEntries(entries, options);
	}

	async loadSettings(): Promise<void> {
		let raw: unknown = null;
		let broken = false;
		try {
			raw = await this.loadData();
		} catch {
			broken = true;
		}
		const { settings, problem } = normalizeSettings(raw);
		this.settings = settings;
		if (!broken && !problem) return;
		this.locked = true;
		const why = problem === "schema" ? "data.json の形が違う" : "data.json を読めない";
		new Notice(`${this.manifest.name}: ${why}ので既定の設定で動いています(data.json は書き換えていません)。`, 0);
	}

	async saveSettings(): Promise<void> {
		if (this.locked) new Notice(`${this.manifest.name}: data.json を読めなかったので、設定と承知を保存しません。`);
		else await this.saveData(this.settings);
	}
}
