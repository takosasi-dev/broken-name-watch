// 当たりの Notice を1つ出す(FR-9・§9.5)。行の文字は display.ts が見える形で作った物を受け取る(INV-7)。
// 要素は createFragment・createDiv・createEl だけで組む(INV-4)。
import { Notice } from "obsidian";

export function showFindingsNotice(lines: readonly string[], durationMs: number, onOpenList: () => void): void {
	const frag = createFragment();
	for (const line of lines) frag.createDiv({ cls: "bnw-notice-line", text: line });
	const button = frag.createEl("button", { cls: "bnw-notice-button", text: "一覧を開く" });
	const notice = new Notice(frag, durationMs);
	button.addEventListener("click", () => {
		notice.hide();
		onOpenList();
	});
}
