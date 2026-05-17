# Superset と Codex ワークフロー契約

ドキュメント種別: contract  
権威: agent delegation と task traceability の信頼できる唯一の情報源  
オーナー: delivery オーナー  
付随契約: verification-lanes.md, authority-graph.md, mvp-acceptance.md  
生成済み companion: docs/generated/superset-task-register.example.json  
検証レーン: Superset task review  
ステータス: active

## 目的

Superset workspaces を通じて Codex tasks を作成、追跡、レビュー、マージする方法を定義する。

## この契約が所有するもの


- Superset タスクの命名とメタデータ。
- Workspace-per-task expectation。
- Subagent role routing。
- レビューゲート。
- Task traceability rules。
- plan-first が必要な task category。


## この契約が所有しないもの


- Product decisions。
- lane mapping を超える Implementation-specific tests。


## 不変条件


- 各 task は 1 つの primary owner contract を持つ。
- 各 task は 1 つ以上の verification lanes を持つ。
- 各 task は isolated Superset workspace / branch worktree で実行される。
- Parallel tasks は同じ contract または core file family を意図的に編集してはならない。
- Codex prompts は Goal / Context / Constraints / Implementation notes / Done when / Validation を使用する。
- 1 task = 1 owner contract = 1 Superset workspace = 1 PR 相当を原則とする。
- data model change、Operation Router、Context Assembly、AI provider abstraction、Editor architecture、Turso migration、Cloudflare Agents design は plan-first とする。
- Superset tasks は作業を追跡するものであり、policy を定義しない。
- Superset workspace は traceability surface であり、SoT ではない。


## 許可されるトポロジー

Contract -> Superset task -> isolated workspace -> Codex agent -> PR/review -> generated evidence.

## 移行用の seam

Emergency hotfix tasks は explicit risk note がある場合にのみ plan-first を省略してよい。

## 削除対象

owner contract と lane を明示できない tasks を削除する。

## ガード / 検証

Superset coordinator は agent launch 前に task prompt をレビューする。
