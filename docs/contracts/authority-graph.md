# 権威グラフ契約

ドキュメント種別: contract  
権威: authority routing の信頼できる唯一の情報源  
オーナー: アーキテクチャオーナー  
付随契約: documentation-system.md, repository-topology.md, sot-and-projection.md  
生成済み companion: docs/generated/authority-graph.json  
検証レーン: authority graph レビューレーン  
ステータス: active

## 目的

truth がどこに存在し、projections が authority をどのように参照するかを定義する。

## この契約が所有するもの


- contracts、live TypeScript contracts、generated files、issues、PRs、Superset workspaces、API artifacts 間の authority graph。
- 競合する truth surfaces の優先順位ルール。
- ownership は change reason、lifecycle、language、invariant、consistency boundary に従うというルール。


## この契約が所有しないもの


- context contracts が所有する個別の business semantics。
- app-local contracts が所有する UI-local policy。
- generated evidence content。


## 不変条件


- Policy と architecture decisions は `docs/contracts/**` に存在する。
- `ai_native_note_requirements.md` は要件入力文書であり、実装判断時の SoT は `docs/contracts/**` に分配された契約である。
- Live product semantics は `contexts/*/src/contract/*` に存在する。
- オーナーローカルの UI/プロダクトポリシー は `apps/*/docs/*contract.md` に存在する。
- Machine-owned evidence は `docs/generated/**` に存在する。
- Records / ADR は historical context であり、active policy authority ではない。
- 実装判断時に record / ADR と owner contract が矛盾する場合は owner contract を優先する。
- Task traceability は GitHub issue/PR/Superset workspace に存在する。
- Generated API contracts は `apps/workspace-api/generated/**` に存在する。
- projection は自分の authority contract または live contract source を明示しなければならない。


## 許可されるトポロジー


Contracts は live contract files を認可する。  
Live contract files は implementation を認可する。  
生成ファイルは state を証明または登録する。  
Issues/PRs/Superset tasks は作業を追跡するものであり、policy ではない。
Requirements drafts は contract 更新の入力であり、contract を上書きしない。


## 移行用の seam

一時的な projection mismatch は、名前付きの canonical gap と closing task がある場合にのみ許可される。

## 削除対象

authority source を明示できない projections を削除する。

## ガード / 検証

すべての Superset task は、該当する場合 owner contract と generated companion を明示しなければならない。
