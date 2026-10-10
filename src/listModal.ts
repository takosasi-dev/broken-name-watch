// 一覧のモーダル(FR-11)。開いたときに全件を判定し、未承知と承知済みに分けて出す。閉じて開き直すまで判定はやり直さない(§10)。
// 項目にできるのは 開く・パスをコピー・承知・戻す だけ(INV-6)。名前は見える形で出し(INV-7)、本文は開かない(INV-8)。
import { Modal, Notice } from "obsidian";
import { ackKey, splitAcked, withAck, withoutAck } from "./ack";
import type { NameFinding } from "./checks/nameChecks";
import { baseName, CHECK_LABEL, describeHit, groupByPath, visible, type NameGroup } from "./display";
import type BrokenNameWatchPlugin from "./main";

const HOW_TO_FIX = "直し方: ノートは開いて上の名前を押す(PC は F2)。フォルダはファイル一覧で右クリック → Rename";

export class ListModal extends Modal {
	private findings: NameFinding[] = [];
	private failed: string[] = [];
	private ackedOpen = false;

	constructor(private readonly plugin: BrokenNameWatchPlugin) {
		super(plugin.app);
	}

	onOpen(): void {
		({ findings: this.findings, failed: this.failed } = this.plugin.scan());
		this.modalEl.addClass("bnw-modal");
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		const { open, acked } = splitAcked(this.findings, this.plugin.settings.acknowledged);
		const openGroups = groupByPath(open);
		const ackedGroups = groupByPath(acked);
		this.setTitle(`壊れた名前: 未承知 ${openGroups.length} 件・承知済み ${ackedGroups.length} 件`);

		if (openGroups.length === 0) contentEl.createDiv({ cls: "bnw-empty", text: "承知していない壊れた名前はありません。" });
		for (const g of openGroups) this.renderGroup(contentEl, g, false);

		if (ackedGroups.length) {
			const details = contentEl.createEl("details", { cls: "bnw-acked" });
			details.open = this.ackedOpen;
			details.addEventListener("toggle", () => { this.ackedOpen = details.open; });
			details.createEl("summary", { text: `承知済み ${ackedGroups.length} 件` });
			for (const g of ackedGroups) this.renderGroup(details, g, true);
		}

		if (this.failed.length) {
			const box = contentEl.createDiv({ cls: "bnw-failed" });
			box.createDiv({ cls: "bnw-failed-title", text: `判定できなかった名前 ${this.failed.length} 件` });
			for (const path of this.failed) box.createDiv({ cls: "bnw-path", text: visible(path) });
		}
		contentEl.createDiv({ cls: "bnw-howto", text: HOW_TO_FIX });
	}

	private renderGroup(parent: HTMLElement, g: NameGroup, acked: boolean): void {
		const item = parent.createDiv({ cls: "bnw-item" });
		item.createDiv({ cls: "bnw-path", text: visible(g.path) });
		const name = baseName(g.path);
		for (const f of g.findings) {
			const row = item.createDiv({ cls: "bnw-finding" });
			row.createSpan({ cls: `bnw-check bnw-${f.severity}`, text: CHECK_LABEL[f.check] });
			row.createSpan({ cls: "bnw-detail", text: describeHit(name, f) });
			row.createEl("button", { text: acked ? "戻す" : "承知" }).addEventListener("click", () => void this.setAck(f, !acked));
		}
		const h1 = this.h1Hint(g);
		if (h1 !== undefined) item.createDiv({ cls: "bnw-hint", text: `手がかり(H1): ${h1}` });
		const actions = item.createDiv({ cls: "bnw-actions" });
		if (g.kind === "file") actions.createEl("button", { text: "開く" }).addEventListener("click", () => void this.openFile(g.path));
		actions.createEl("button", { text: "パスをコピー" }).addEventListener("click", () => void this.copyPath(g.path));
	}

	/** FR-14: md の最初の H1。metadataCache から取り、本文は開かない */
	private h1Hint(g: NameGroup): string | undefined {
		const file = g.kind === "file" ? this.app.vault.getFileByPath(g.path) : null;
		if (!file || file.extension !== "md") return undefined;
		return this.app.metadataCache.getFileCache(file)?.headings?.find((h) => h.level === 1)?.heading;
	}

	private async setAck(f: NameFinding, on: boolean): Promise<void> {
		const s = this.plugin.settings;
		s.acknowledged = on ? withAck(s.acknowledged, ackKey(f)) : withoutAck(s.acknowledged, ackKey(f));
		await this.plugin.saveSettings();
		this.render();
	}

	private async openFile(path: string): Promise<void> {
		const file = this.app.vault.getFileByPath(path);
		if (!file) {
			new Notice(`見つかりません: ${visible(path)}`);
			return;
		}
		this.close();
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	/** FR-15: 実際のパス(見える形にしない物)をクリップボードに入れる */
	private async copyPath(path: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(path);
		} catch {
			new Notice("パスをコピーできませんでした。");
		}
	}
}
