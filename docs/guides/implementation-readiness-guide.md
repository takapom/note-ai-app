# 実装準備ガイド

ドキュメント種別: ガイド。権威: `docs/contracts/superset-codex-workflow.md`, `docs/contracts/verification-lanes.md`, `docs/contracts/mvp-acceptance.md`。

## 目的

このガイドは、docs/contracts で固定された target model を、実装タスクへ落とし込む前に確認するための手順です。ここでは新しいポリシーを定義しません。実装上の違和感が、未決定のためか、契約の記載漏れのためか、単なる task slicing の不足かを切り分けます。

## 結論

現時点の docs で実装は開始できます。ただし「アプリ全体を一気に作る」にはまだ粗すぎます。実装は Superset tasks の順に、1 task = 1 owner contract = 1 verification lane を保って進める必要があります。

違和感の主因は次の 3 つです。

1. contract は target model を固定しているが、scaffold 直後なので package choices と fixture はまだ最小である。
2. 各領域の不変条件は揃っているが、実装タスクごとの file ownership と test fixture がまだ薄い。
3. `.agents/skills/**` と `.codex/prompts/**` がこの環境では書き込み不可で、skills 側の文言が docs の最新契約に追随できていない。

## 実装前チェック

各実装タスクの前に次を確認します。

1. Owner contract が 1 つに絞れている。
2. Companion contracts が読まれている。
3. Projection surface が明確である。
4. 変更してよい files/directories が明確である。
5. Verification lane が実行可能、または not-yet-available として明示されている。
6. MVP acceptance のどの項目を進めるかが明確である。
7. NFR に触れる場合、writing flow、source/provenance、failure tolerance、observability の影響が明確である。

## 未決定性の分類

### 実装前に契約更新が必要なもの

- MVP scope の追加または削除。
- AI が user-authored block を変更できる条件の変更。
- external integration を MVP に入れる判断。
- persistent AI chat panel や AI mode switcher の追加。
- canonical DB と Agent-local SQL の境界変更。
- Operation policy の分類変更。

### plan-first で決めてよいもの

- workspace layout の細部。
- TypeScript schema library の具体選択。
- Turso migration runner。
- editor library。
- test runner。
- route handler の exact file placement。
- observability sink の初期実装。

### 実装中に fixture として具体化するもの

- Note / Section / Block の sample data。
- operation accept/reject/no_op cases。
- context budget truncation cases。
- next open digest display cases。
- memory candidate accept/reject cases。
- provider failure cases。

## 実装タスクの最低入力

各 task prompt は次を含むべきです。

- Goal。
- Owner contract。
- Companion contracts。
- Allowed files/directories。
- Non-goals。
- Implementation notes。
- Done when。
- Validation。

## 最初の実装順序

実装順序は `docs/contracts/mvp-scope.md` と `superset/tasks/*.md` に従います。

1. repo scaffold と検証コマンドの具体化。
2. live TypeScript domain contracts。
3. operation schema。
4. Operation Router。
5. Unified Note Surface skeleton。
6. note leave scheduler。
7. Context Assembly。
8. runtime provider registry。
9. Next Open Digest。
10. Provenance Popover。
11. generated register check。

## 現在の検証コマンド

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run verify`
- `npm run docs:register:check`

この sandbox で `npm run ...` が拒否される場合は、`docs/contracts/verification-lanes.md` に記載した直接コマンドを使用します。

## レビュー観点

実装レビューでは、完成度よりも境界の崩れを先に見ます。

- user-authored text が正本のままか。
- AI-derived structure が projection のままか。
- AI が operations のみを返すか。
- Operation Router を経由しているか。
- source spans と confidence が落ちていないか。
- keystroke LLM call がないか。
- note close / tab switch / app leave lifecycle を守っているか。
- UI が single surface を守っているか。
- runtime が product semantics を所有していないか。
- generated artifacts が authority になっていないか。

## skills 側の注意

`.agents/skills/**` はこの workspace では書き込み不可です。skills の説明が古い場合でも、実装判断は `docs/contracts/**`、`AGENTS.md`、`agents/subagents/*.md` を優先してください。書き込み権限が復旧したら、skills の description と手順を日本語化し、最新 contract list に追随させます。
