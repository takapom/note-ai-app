# MVP Acceptance Review - 2026-05-28

ドキュメント種別: record
権威: `docs/contracts/mvp-acceptance.md` に対する実装状況の証跡
オーナー: Codex review
ステータス: active

## 目的

`docs/contracts/mvp-acceptance.md` の 17 項目に対し、現在の repo が MVP complete と言えるかを確認する。

## 判定

2026-05-28 時点では MVP complete はまだ宣言しない。repo-local の product/runtime/frontend acceptance は covered だが、GitHub issue / PR の traceability projection が最新状態に同期されていないため、#17 は blocking gap として残る。

2026-05-29 追記: GitHub traceability projection は PR #7 と issue #1-#6 の close comment に同期済み。PR #7 の review / merge 後、main branch 上でも MVP acceptance #1-#17 を covered として扱える。

## 検証結果

- `node --test tests/contracts/web-note-surface-real-browser-editor.test.mjs`: pass。Chrome-capable ローカル環境で cursor、selection、status region reserved layout を確認。
- `npm run verify`: pass。sandbox 内では real-browser editor guard は Chrome DevTools 制約により skip だが、他の contract tests は pass。
- 2026-05-29: `npm run docs:register:check`: pass。
- 2026-05-29: `npm run typecheck`: pass。
- 2026-05-29: `npm run verify`: pass。
- 2026-05-29: `gh issue list --repo takapom/note-ai-app --state all --limit 10`: issue #1-#6 は closed。
- 2026-05-29: `gh pr view 7 --repo takapom/note-ai-app`: PR #7 `Prepare MVP acceptance traceability` は open。

## Acceptance Status

| # | 条件 | 現状 | 根拠 / gap |
| --- | --- | --- | --- |
| 1 | ユーザーが一枚のノートに自然に書ける | covered | NoteSurface view model、HTML renderer、browser runtime、DOM host、block save path、hosted E2E、real-browser editor guard が pass。 |
| 2 | H1/H2/H3 が section boundary として扱われる | covered | Note Model validation、heading save projection、section boundary renderer / tests。 |
| 3 | blocks と sections が内部正本として保存される | covered | Note document persistence port、SQL adapter、block command port、Worker routing/default wiring tests。 |
| 4 | note close / tab switch / app leave で dirty section の structure job が作られる | covered | Scheduler contract/runtime、Worker structure route handler、Agent queue tests。 |
| 5 | keystroke ごとに AI が呼ばれない | covered | BlockChanged は save/edit/dirty/index のみで provider/router/audit に進まない。 |
| 6 | Context Assembly が title、description、target section、related units、memory を使う | covered | ContextEnvelope contract と runtime adapter tests。 |
| 7 | AI は operation schema に従って返す | covered | Operation schema validation、operation list validation、source span/confidence tests。 |
| 8 | Operation Router が unsafe operation を reject する | covered | forbidden/unknown operation、unsafe target、low confidence、invalid audit tests。 |
| 9 | 書いている最中に AI / agent UI が前景化せず、note editing が中断されない | covered | Quiet writing projection、inline AI/memory projection、browser runtime failure/editing tests。 |
| 10 | Next Open Digest が次回オープン時の整理結果として表示できる | covered | Scheduler digest preparation、read port、Worker route、Web digest projection / renderer tests。 |
| 11 | 整理結果は source を確認でき、必要に応じて閉じられる | covered | Return layer source inspection events、close/defer actions、renderer/runtime tests。 |
| 12 | Memory candidate がある場合は、整理結果の secondary projection として承認または拒否できる | covered | Memory review port/SQL adapter, Worker routes, Web action mapping/runtime projection tests。 |
| 13 | Provenance Popover で source を確認できる | covered | Provenance lookup port/SQL adapter, Worker route, bounded popover model/runtime tests。 |
| 14 | Markdown-compatible authoring shortcuts で書ける。ただし Markdown は内部 SoT ではない | covered | Authoring shortcut normalization tests and Note Model canonical block persistence separation。 |
| 15 | AI provider failure が発生しても note editing は継続できる | covered | Provider failure guards, browser runtime failure projection, real-browser editor guard。 |
| 16 | `docs/contracts/mvp-acceptance.md` #16 の MVP 除外 surface が入っていない | covered | Renderer/static build/integration guards for MVP-excluded surfaces。 |
| 17 | Codex task、Superset workspace、docs contract の traceability が維持される | covered in PR #7 | Repo docs/register/Superset task files are present。GitHub issue #1-#6 は current repo state と `npm run verify` evidence に基づき closed。PR #7 が acceptance review、real-browser guard、status reserved layout、runtime / frontend / local smoke updates を追跡する。 |

## Traceability Closure

2026-05-29 に GitHub traceability projection を現在の repo 状態へ同期した。

- issue #1-#6 は、current repo state と `npm run verify` pass を根拠として close 済み。
- PR #7 がこの review record、real-browser test harness 修正、status reserved layout 修正、runtime / frontend / local smoke updates を追跡する。
- `npm run docs:register:check` と `npm run verify` は PR #7 branch 上で pass。

## Follow-up

- PR #7 を review / merge する。
- merge 後の main branch で `npm run docs:register:check` と `npm run verify` を再実行し、MVP complete 判定を main branch の証跡として固定する。
