// 承知キー(FR-12・§9.5): `check|path`。path は正規化しない。
import { describe, expect, it } from "vitest";
import { ackKey, splitAcked, staleAcks, withAck, withoutAck } from "../src/ack";
import type { NameFinding } from "../src/checks/nameChecks";

const finding = (check: NameFinding["check"], path: string): NameFinding =>
	({ check, severity: "warning", path, kind: "file", detail: "", positions: [] });

describe("承知キー", () => {
	it("check|path の形。NFD と NFC は別の名前として扱う", () => {
		expect(ackKey(finding("invisible", "開発ログ\u00826-09-05.md"))).toBe("invisible|開発ログ\u00826-09-05.md");
		expect(ackKey(finding("nfd", "フ\u{309A}.md"))).not.toBe(ackKey(finding("nfd", "プ.md")));
	});

	it("承知は判定ごと。承知していない物と承知済みに分ける", () => {
		const fs = [finding("windows", "a "), finding("spaces", "a "), finding("nfd", "dir/フ\u{309A}.md")];
		const { open, acked } = splitAcked(fs, ["spaces|a ", "nfd|dir/プ.md"]);
		expect(open.map(ackKey)).toEqual(["windows|a ", "nfd|dir/フ\u{309A}.md"]);
		expect(acked.map(ackKey)).toEqual(["spaces|a "]);
	});

	it("どの名前にも当たっていない承知(消えた・名前が変わった)。同じ名前で作り直せば、また当たる", () => {
		const acks = ["invisible|gone\u0082.md", "windows|a|b.md"];
		expect(staleAcks([finding("windows", "a|b.md")], acks)).toEqual(["invisible|gone\u0082.md"]);
		expect(staleAcks([finding("windows", "a|b.md"), finding("invisible", "gone\u0082.md")], acks)).toEqual([]);
	});

	it("足す・戻す(元の配列は変えない。同じキーを2つ持たない)", () => {
		const acks = ["a|x"];
		expect(withAck(acks, "b|y")).toEqual(["a|x", "b|y"]);
		expect(withAck(acks, "a|x")).toEqual(["a|x"]);
		expect(withoutAck(["a|x", "b|y"], "a|x")).toEqual(["b|y"]);
		expect(acks).toEqual(["a|x"]);
	});
});
