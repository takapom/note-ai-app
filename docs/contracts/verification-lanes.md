# 検証レーン契約

ドキュメント種別: contract  
権威: validation lanes の信頼できる唯一の情報源  
オーナー: quality オーナー  
付随契約: documentation-system.md, superset-codex-workflow.md, non-functional-requirements.md, mvp-acceptance.md  
生成済み companion: docs/generated/verification-lanes.json  
検証レーン: generated lane register を通じた itself  
ステータス: active

## 目的

各 change type で確認しなければならない内容を定義する。

## この契約が所有するもの


- 検証レーンの分類。
- lane ごとの Required checks。
- レビュー責務。
- MVP acceptance checklist。


## この契約が所有しないもの


- Specific CI provider YAML。
- Test runner implementation。


## 不変条件


レーン:
- contract lane: contract consistency、generated register、authority graph.
- note model lane: schema tests、section boundary tests.
- operation lane: schema validation、router accept/reject/revert tests.
- scheduler lane: BlockChanged で AI なし、note leave が job を作成すること。
- context lane: K limits、budget、title/description usage.
- frontend lane: unified surface、chat panel なし、AI blocks inline.
- runtime lane: provider abstraction、Turso canonical boundaries、note structure route handler と StructureJob Agent handler が policy-free connection boundary であること。
- security lane: source spans、context minimization、untrusted instruction leakage なし。
- api/event lane: UI events、backend events、route handlers が `api-events.md` に沿っていること。
- NFR lane: writing flow、layout stability、AI failure tolerance、observability event が `non-functional-requirements.md` に沿っていること。
- acceptance lane: `mvp-acceptance.md` の 15 項目を MVP complete 判定に使うこと。

## 現在のコマンド

scaffold 後の標準コマンド:

- typecheck: `npm run typecheck`
- lint: `npm run lint`
- unit tests: `npm run test`
- full verification: `npm run verify`
- generated register check: `npm run docs:register:check`
- contract checks: `npm run contracts:verify`

この環境で `npm run ...` が実行できない場合は、同等の直接コマンドを使用する。

- typecheck: `tsc -p tsconfig.json --noEmit`
- lint: `node scripts/verify-contracts.mjs --lint`
- unit tests: `node --test tests/**/*.test.mjs`
- generated register check: `node scripts/generate-doc-register.mjs --check`


## 許可されるトポロジー

すべての Superset task は少なくとも 1 つの lane を選択する。

## 移行用の seam

初期 scaffold タスクでは未実装の lane checks を not-yet-available としてマークしてよいが、上記の標準コマンドを維持し、未実装の理由を述べなければならない。

## 削除対象

validation lane assignment のない tasks を削除する。

## ガード / 検証

Codex review は lane results、not-yet-available checks、blocking MVP gaps を一覧にしなければならない。
