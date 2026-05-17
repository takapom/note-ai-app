# ドキュメントポータル

これはポータルのみです。ポリシーを再定義してはいけません。

## 参照先

- 意思決定、不変条件、所有権: `docs/contracts/**`
- コントリビューター向け手順: `docs/guides/**`
- オペレーター向け復旧手順: `docs/runbooks/**`
- 履歴と ADR: `docs/records/**`
- マシン所有の証跡とレジスター: `docs/generated/**`
- 要件入力から分配された契約: `docs/contracts/product-principles.md`, `docs/contracts/mvp-scope.md`, `docs/contracts/mvp-acceptance.md`, `docs/contracts/non-functional-requirements.md`
- 実装準備の切り分け: `docs/guides/implementation-readiness-guide.md`

## コントラクト優先ルール

このリポジトリはまずモデルを対象にし、その後で実装をそこへ収束させます。現在の実装を正当化するだけのドキュメントを書いてはいけません。実装が乖離している場合は、そのギャップを明示し、解消するための Superset タスクを作成してください。

`ai_native_note_requirements.md` は契約更新の入力です。判断が必要な場合は、分配後の `docs/contracts/**` を参照してください。

## 生成レジスター

コントラクト、ガイド、ランブック、記録、スキル、サブエージェントブリーフのマシン所有インデックスは `docs/generated/register.md` を参照してください。
