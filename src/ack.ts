// 承知キー(`check|path`)の作成と照合(FR-12・§9.5)。純関数。
// path は実際のパスのまま使う(正規化しない。NFD と NFC は別の名前として扱う)。
import type { NameFinding } from "./checks/nameChecks";

export const ackKey = (f: Pick<NameFinding, "check" | "path">): string => `${f.check}|${f.path}`;

/** 当たりを、承知していない物と承知済みの物に分ける */
export function splitAcked(findings: readonly NameFinding[], acknowledged: readonly string[]): { open: NameFinding[]; acked: NameFinding[] } {
	const keys = new Set(acknowledged);
	const open: NameFinding[] = [];
	const acked: NameFinding[] = [];
	for (const f of findings) (keys.has(ackKey(f)) ? acked : open).push(f);
	return { open, acked };
}

/** どの名前にも当たっていない承知(ファイルが消えた・名前が変わった。§10) */
export function staleAcks(findings: readonly NameFinding[], acknowledged: readonly string[]): string[] {
	const live = new Set(findings.map(ackKey));
	return acknowledged.filter((k) => !live.has(k));
}

export const withAck = (acknowledged: readonly string[], key: string): string[] =>
	acknowledged.includes(key) ? [...acknowledged] : [...acknowledged, key];

export const withoutAck = (acknowledged: readonly string[], key: string): string[] => acknowledged.filter((k) => k !== key);
