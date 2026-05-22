# 非機能要件契約

ドキュメント種別: contract  
権威: MVP 非機能要件の信頼できる唯一の情報源  
オーナー: quality オーナー  
付随契約: product-principles.md, frontend-ui.md, operation-return-contract.md, security-privacy.md, verification-lanes.md  
生成済み companion: docs/generated/verification-lanes.json  
検証レーン: security lane + frontend lane + runtime lane  
ステータス: active

## 目的

書き心地、安全性、provenance、一貫性、revert、security/privacy、prompt injection、performance/cost、reliability、observability の最低基準を MVP の横断制約として固定する。

## この契約が所有するもの

- UX latency と layout stability の制約。
- AI safety と operation validation の制約。
- provenance と explainability の最低基準。
- consistency、undo/revert、security/privacy、prompt injection 対策。
- performance/cost、reliability、observability の実装前提。

## この契約が所有しないもの

- 具体的な SLO 数値。
- observability vendor。
- cost dashboard UI。
- provider-specific retry policy。

## 不変条件

- ユーザー入力は AI 処理によってブロックされてはならない。
- block edit は即時反映される。
- AI Assist Block insertion はユーザーのカーソル位置を奪ってはならない。
- 入力中に AI による layout shift を発生させてはならない。
- AI は user-authored block を承認なしに直接 rewrite してはならない。
- AI Assist Block はユーザーの個別承認を必須にせず inline に現れてよいが、AI-origin label、source availability、編集/削除可能性を失ってはならない。
- AI は operations のみを返す。
- schema validation を通過しない AI operation は適用されない。
- external action は MVP では実行しない。
- AI-generated block と memory は source を持つ。
- `出典` から source、operation type、classification、related memory、confidence を確認できる。
- user block は正本であり、AI structure は eventual consistency の projection である。
- stale structure は stale として扱う。
- AI Assist Block は削除可能であり、AI operation は revert 可能に設計する。
- workspace/user isolation を守る。
- AI に送る context は必要最小限にする。
- note text、external text、memory は untrusted content として扱い、system instruction として扱わない。
- LLM は keystroke ごとに呼ばない。
- structure job は section scope を基本とし、context_hash dedupe と top K retrieval を使う。
- AI provider failure が発生しても note editing は継続できる。
- structure job failure は retry または failed status として扱う。
- note leave event の取りこぼしは next open で回収する。
- structure job count、failure rate、cost、AI Assist Block edit/delete/source-inspection rate、Memory candidate acceptance/rejection rate を観測可能にする。

## 許可されるトポロジー

この契約は frontend、scheduler、operation、context、runtime、security の各 contract を横断して制約する。各 layer は自分の実装でこの契約を満たすが、横断 policy を局所実装に閉じ込めてはならない。

## 移行用の seam

初期 scaffold では observability の出力先が console/test fixture でもよいが、event names と測定対象は残す。

## 削除対象

writing flow をブロックする AI calls、source のない AI suggestions、untrusted content を instruction として扱う prompt builders を削除する。

## ガード / 検証

レビューはこの契約の NFR を、該当する verification lane の受け入れ条件として扱わなければならない。
