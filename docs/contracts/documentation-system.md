# ドキュメントシステム契約

ドキュメント種別: contract  
権威: ドキュメント種別 semantics のメタ 信頼できる唯一の情報源  
オーナー: documentation-system オーナー  
付随契約: authority-graph.md, verification-lanes.md  
生成済み companion: docs/generated/register.md  
検証レーン: docs-register-generation skill + contract-drift review  
ステータス: active

## 目的

ドキュメント種別を定義し、README/guide/issue/PR の surface がポリシーを再定義することを防ぐ。

## この契約が所有するもの


- ドキュメント種別の分類。
- contract、guide、runbook、record、generated、portal、alias ドキュメントのルール。
- docs/README.md は portal のみであるというルール。
- generated files は machine-owned evidence であり、ポリシーではないというルール。


## この契約が所有しないもの


- プロダクト semantics。
- runtime architecture。
- UI 固有のポリシー。
- database schema details。


## 不変条件


- `contract` documents は decisions、ownership、invariants に関する信頼できる唯一の情報源である。
- `guide` documents は手順を説明し、decisions について contracts にリンクバックしなければならない。
- `runbook` documents は operator recovery steps を記述する。
- `record` documents は履歴と判断背景を記録し、active policy を変更してはならない。
- `record` documents は関連する active contract を発見できる索引または参照を持たなければならない。
- `generated` documents は machine-owned evidence または registers である。
- `portal` documents は readers を誘導し、policy を再定義してはならない。
- `alias` documents は一時的な compatibility paths であり、removal criteria を含めなければならない。


## 許可されるトポロジー


`docs/README.md` -> contracts/guides/runbooks/records/generated.  
`docs/records/README.md` -> records and their related active contracts.
Guides は contracts を参照してよいが、それらを上書きしてはならない。  
生成ファイルは contracts を参照してよいが、policy authority になってはならない。


## 移行用の seam

alias ドキュメントは明示的な削除日または移行条件がある場合にのみ存在してよい。

## 削除対象

contract ownership なしに policy を含む wiki-like pages を削除する。

## ガード / 検証

docs 変更後に register generation を実行する。`docs/contracts/**` 外の policy statement は drift risk としてレビューする。
record / ADR にしか存在しない判断を実装に使う場合は、先に該当する owner contract へ反映する。
