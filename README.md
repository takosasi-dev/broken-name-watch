# Broken Name Watch

Broken Name Watch は、vault のファイルやフォルダに、あとで困る名前が付いた直後に知らせる Obsidian プラグインです。見るのは、見えない文字・NFC にそろっていない文字・Windows で使えない名前・前後の空白・文字化けの跡です。Obsidian の起動時にも、全部の名前を 1 回調べます。

知らせるだけです。名前の変更・移動・編集・削除は 1 つもせず、ノートの本文も読みません。書くのは自分の設定ファイルだけです。ネットワークには出ません。PC でもモバイルでも動く作りです。

コマンド名だけ英語で、ほかの画面(知らせ・一覧の窓・設定)は日本語です。言語の切り替えはありません。

*English summary is at the bottom.*

## できること

- **付いた直後に調べる**: ファイルやフォルダが作られたとき・名前が変わったときに名前を調べ、約 1 秒後に知らせを 1 つ出す。
- **起動時に調べる**: Obsidian の読み込みが終わったら、全部の名前を 1 回調べる。閉じている間にできた名前も拾う。
- **5 種の検査**: 検査ごとに切れる。何に当たるかは下の表のとおり。
- **見えない文字を見える形にする**: `[U+200B]` の形で出し、名前の何文字目かも出す。
- **一覧の窓**: 壊れた名前を全部並べる。ノートを開くボタンと、パスをコピーするボタンが付く。
- **承知**: そのままにすると決めた名前の、その検査を、次から知らせない。
- **調べないフォルダ**: 書いたフォルダの配下の名前を調べない。

### 既定で ON の検査

| 画面の名前 | 当たる名前 |
|---|---|
| `見えない文字` | 制御文字(U+0000〜U+001F・U+007F・U+0080〜U+009F)か、書式文字(U+00AD・U+200B・U+200C・U+200E・U+200F・U+202A〜U+202E・U+2060〜U+2064・U+2066〜U+2069・BOM の U+FEFF)を含む名前。絵文字が使うゼロ幅接合子 U+200D には当たらない。 |
| `NFC でない` | NFC にそろえると変わる名前。`プ` ではなく `フ` と結合用の半濁点 U+309A に分かれた形、文字と結合用のアクセントに分かれた形、CJK 互換漢字。 |
| `Windows で使えない名前` | `< > : " \ \| ? *` のどれかを含む名前。最後が空白かピリオドの名前。最初のピリオドより前が予約名(`CON`・`PRN`・`AUX`・`NUL`・`COM1`〜`COM9`・`LPT1`〜`LPT9`。数字は上付きの `¹` `²` `³` も。大文字小文字は問わない)の名前。`con.txt.md` は当たり、`console.md` と `COM10.md` は当たらない。 |
| `前後の空白` | 先頭・最後の拡張子の直前・最後に、空白(U+0020・全角の U+3000・U+00A0)がある名前。 |
| `文字化けの疑い` | ON にしてある印のどれかに当たる名前。既定で ON の印は `置き換え文字`(U+FFFD)だけ。 |

### 既定で OFF の検査

`文字化けの疑い` に足せる印です。設定の `文字化けの印` で ON にします。

| 画面の名前 | 当たる名前 |
|---|---|
| `縺・繧・繝` | 縺・繧・繝 のどれかを含む名前。UTF-8 の仮名を Shift_JIS として読んだときに出る字。 |
| `私用領域の文字` | U+E000〜U+F8FF の文字を含む名前。 |
| `漢字の直後の半角カナ` | 漢字(U+4E00〜U+9FFF)のすぐ後ろに半角カナ(U+FF61〜U+FF9F)がある名前。`漢字ｶﾅ.md` のような、ふつうの名前にも当たる。 |

## 向いている vault(前提)

どの vault でも使えます。ノートの書き方は問いません。見るのは名前(パスの最後の要素。拡張子込み)だけです。既定の設定に、特定の vault に合わせた値はありません。違う OS の間で同期している vault や、Obsidian の外の道具がファイルを作る vault で役に立ちます。

Windows の決まりは、どの端末でも同じように当てます。スマートフォンや Mac で付けた名前を、Windows の PC に届く前に拾うためです。Windows を使わない vault なら、その検査を切ってください。文字化けの印は、日本語の名前に合わせてあります。

## 入れ方

Obsidian 1.14.4 以降が必要です。

### BRAT で入れる(おすすめ)

1. コミュニティプラグインの「BRAT」(Obsidian42 - BRAT)を入れて有効にする。
2. BRAT の設定 → 「Add Beta plugin」に `takosasi-dev/broken-name-watch` を入れる。
3. コミュニティプラグインの一覧で「Broken Name Watch」を有効にする。

### 手で入れる

[Releases](https://github.com/takosasi-dev/broken-name-watch/releases) から `main.js`・`manifest.json`・`styles.css` を落とし、vault の `.obsidian/plugins/broken-name-watch/` に置いて、コミュニティプラグインの一覧で有効にします。

## 使い方

### コマンド

| コマンドパレットに出る名前 | すること |
|---|---|
| `Broken Name Watch: List broken file names` | 今の全部の名前を調べて、一覧の窓を開く。 |

既定のホットキーはありません。

### 画面の見方

**知らせるとき。** ファイルやフォルダが作られた直後・名前が変わった直後と、起動時(もとからある名前の全部)です。見つかった物は、最初の 1 件から 1 秒の間ためて、1 つの知らせにまとめます。その時点でもう無い名前と、承知済みの物は落とします。何も残らなければ、知らせは出ません。

**知らせ(Notice)。**

```
Broken Name Watch: 壊れた名前が 2 件
Meeting[U+200B]notes.md(見えない文字)
フ[U+309A]_draft.md(NFC でない)
[一覧を開く]
```

- 1 行目は壊れた名前の件数。続けて先頭の 3 件が、当たった検査の名前つきで並ぶ。4 件目からは `ほか N 件` とだけ出る。
- 見えない文字・結合文字・U+00A0・U+3000 は `[U+XXXX]` の形で出る。
- 既定では、押すまで消えない。ボタン `一覧を開く` を押すと、知らせが消えて一覧の窓が開く。

**一覧の窓。**

- 見出しは `壊れた名前: 未承知 N 件・承知済み N 件`。
- 名前ごとに、パス、当たった検査の名前(テーマのエラーか警告の色)、当たった文字と位置が出る。位置は `U+200B(8 文字目)`、`U+003A「:」(2 文字目)`、`予約名 CON`、`印 replacement` の形。
- Markdown のノートなら、`手がかり(H1): …` に最初の大見出しが出る。何のノートかの手がかりになる。
- ボタンは `承知`(検査ごと)、`開く`(ファイルだけ)、`パスをコピー`。コピーするのは実際のパスで、見えない文字もそのまま入る。成功したときは何も出ない。
- 最後の行 `直し方: …` に、名前の直し方が出る。ノートは開いて上の名前を押す(PC は F2)。フォルダはファイル一覧から名前を変える。
- 一覧は、開いたときに調べた結果。名前を直したら、窓を閉じて開き直す。

**承知。** そのままにすると決めた物は `承知` を押します。プラグインは「検査とパス」の組を設定に覚え、次から知らせません。その項目は、畳んである `承知済み N 件` に移り、そこの `戻す` で元に戻せます。1 つの名前が 2 つの検査に当たっていれば、承知も 2 回押します。

## 設定

| 項目 | 既定 | 内容 |
|---|---|---|
| `見えない文字`・`NFC でない`・`Windows で使えない名前`・`前後の空白`・`文字化けの疑い` | ON | 検査ごとの ON/OFF。 |
| `置き換え文字` | ON | 文字化けの印: U+FFFD。 |
| `縺・繧・繝`・`私用領域の文字`・`漢字の直後の半角カナ` | OFF | 足せる文字化けの印。 |
| `起動時に全部の名前を調べる` | ON | 起動時に全部の名前を調べる。 |
| `まとめる時間(ミリ秒)` | 1000 | この時間の間に見つかった名前を、1 つの知らせにまとめる。 |
| `通知を出しておく時間(ミリ秒)` | 0 | 知らせを出しておく時間。0 なら、押すまで消えない。 |
| `調べないフォルダ` | 空 | 1 行に 1 つ、vault からの相対パス。`Foo` は `Foo/` の配下の全部に効き、`FooBar/` には効かない。そのフォルダ自身の名前は調べる。 |
| `承知をすべて解除` | — | 確認の窓を出してから、承知を全部解除する。説明に、承知の件数と、今どの名前にも当たっていない承知の件数が出る。 |

組の見出しは `文字化けの印`・`知らせ方`・`除外フォルダ`・`承知` です。

## 安全のための決まり

- **vault のファイル**: 1 つも作らず、書き換えず、名前を変えず、動かさず、消さない。名前を直すのは使う人。ノートの本文は開かない。使うのは名前と、手がかり用に Obsidian のメタデータキャッシュから取る大見出しだけ。
- **書くファイル**: プラグインのフォルダの `data.json`(設定と承知)だけ。書くのは、設定を変えたときと、`承知`・`戻す` を押したときだけ。`data.json` を読めない・別の版が書いた物のときは、既定の設定で動き、その旨を知らせ、ファイルを上書きしない。
- **ネットワーク**: 出ない。利用状況の送信もしない。Node.js / Electron の機能を使わないので、モバイルでも動く。
- **クリップボード**: 書くのは `パスをコピー` を押したときだけ。

## 動作確認の状況

- 版 0.1.0。Windows の Obsidian 1.14.4 で動作を確認。起動時の検査が、もとからあった制御文字入りの名前を見つけ、知らせから一覧の窓が開いた。ゼロ幅スペース入りの名前のファイルを作ると、約 1 秒後に知らせが出た。ふつうの名前では出なかった。
- iPhone・Android の実機は未確認(モバイル表示のエミュレーションで読み込みと表示まで確認)。
- 未確認: Obsidian が、NFC でない名前や U+00A0 を、そのままプラグインに渡すか。Obsidian が先にそろえているなら、`NFC でない` は出ない。
- 未確認: Obsidian の外の道具が作ったファイルが、すぐに知らされるか、次の起動時になるか。

## 分かっている限界

- 画面の文字は日本語だけ(コマンド名だけ英語)。
- 承知は「1 つの検査と、そのままのパス」に付く。名前を変える・場所を移すと承知は外れ、壊れたままなら、また知らせる。
- 1 秒の間は延びない。同期が長く届き続けると、知らせが何枚か出ることがある。
- 名前の先頭や最後の半角の空白は、知らせでもパスでも見える形にならない。出るのは詳しい欄の `U+0020(1 文字目)` だけ。
- 知らせが出ている間にプラグインを読み込み直す(更新するなど)と、前の知らせが残ったまま新しい知らせが出る。両方押して消す。
- 名前が点で始まるファイルとフォルダは、プラグインから見えないので、調べない。

## 開発

```
npm install
npm run build        # main.js を作る(型チェックつき)
npm test             # vitest
npm run lint         # eslint-plugin-obsidianmd
```

名前の検査は、`obsidian` を import しない関数です。テストは作り物の名前と偽の `obsidian` を使うので、vault は要りません。

## ライセンス

MIT。[LICENSE](LICENSE) を見てください。

---

## English summary

**Broken Name Watch** tells you right after a file or folder in your vault gets a name that will cause trouble later.

- It checks a name when a file or folder is created or renamed, and every name once at startup. One notice appears about a second later. The command `List broken file names` opens a list window.
- Five checks are on by default: invisible characters, text that is not NFC-normalized, names Windows cannot use, spaces at the edges, and suspected mojibake (U+FFFD only). Three extra mojibake signals are off by default.
- It expects nothing about how your notes are written; it looks only at names. It is most useful for vaults synced between different operating systems.
- It only tells you. It never renames, moves, edits, or deletes anything, and never reads note contents. The only file it writes is its own `data.json` (settings and acknowledgements).
- No network requests. No Node.js or Electron APIs, so it is built to run on mobile too.
- Screen language: the command name is in English; the notices, the list window, and the settings are in Japanese only, with no language switch.
- Install with BRAT: `takosasi-dev/broken-name-watch`. Requires Obsidian 1.14.4 or later.
- Tested on Obsidian 1.14.4 on Windows only. Real iPhone and Android devices are untested (in mobile emulation it loads and displays).
