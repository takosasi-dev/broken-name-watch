// 仕様書 §8.3 のコンソールのスクリプトから写した述語(照合の基準。実装とは別に持つ)。
// 仕様書の4桁の Unicode エスケープは、波かっこの形(正規表現は u フラグつき)に書き換えた。意味は同じ。
// 4桁の形で書くと、書き込みの道具が実文字に変えてしまい、見えない文字がソースに入る(NOTES.md)。
const inv = (p: number): boolean => p < 0x20 || (p >= 0x7f && p <= 0x9f) || p === 0xad || p === 0x200b || p === 0x200c || p === 0x200e || p === 0x200f
	|| (p >= 0x202a && p <= 0x202e) || (p >= 0x2060 && p <= 0x2064) || (p >= 0x2066 && p <= 0x2069) || p === 0xfeff;
const WIN = /[<>:"\\|?*]|[ .]$/, DEV = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(\.|$)/i;
const SP = /^[ \u{3000}\u{a0}]|[ \u{3000}\u{a0}]\.[^.]+$|[ \u{3000}\u{a0}]$/u;

export const SPEC_83 = {
	invisible: (n: string): boolean => [...n].some((c) => inv(c.codePointAt(0) ?? 0)),
	nfd: (n: string): boolean => n !== n.normalize("NFC"),
	windows: (n: string): boolean => WIN.test(n) || DEV.test(n),
	spaces: (n: string): boolean => SP.test(n),
	fffd: (n: string): boolean => n.includes("\u{fffd}"),
	cjk: (n: string): boolean => /[縺繧繝]/.test(n),
	pua: (n: string): boolean => /[\u{e000}-\u{f8ff}]/u.test(n),
	hwk: (n: string): boolean => /[\u{4e00}-\u{9fff}][\u{ff61}-\u{ff9f}]/u.test(n),
};

export type Spec83Key = keyof typeof SPEC_83;
export const SPEC_83_KEYS = Object.keys(SPEC_83) as Spec83Key[];
