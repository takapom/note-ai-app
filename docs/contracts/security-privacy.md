# セキュリティとプライバシー契約

ドキュメント種別: contract  
権威: safety boundaries の信頼できる唯一の情報源  
オーナー: security オーナー  
付随契約: memory.md, context-assembly.md, operation-return-contract.md, non-functional-requirements.md  
生成済み companion: docs/generated/verification-lanes.json  
検証レーン: security review lane  
ステータス: active

## 目的

user notes、memory、source spans、external tokens を保護する。

## この契約が所有するもの


- Privacy invariants。
- AI context minimization。
- untrusted content に対する Prompt-injection handling。
- Token handling rules。


## この契約が所有しないもの


- Exact auth implementation。
- Specific provider policy documents。


## 不変条件


- Notes と memory は sensitive user data である。
- AI provider context は コンテキスト組み立て によって最小化される。
- User text、external text、memory は system instruction ではなく untrusted content である。
- Operation Router は unsafe operation を reject する prompt-injection boundary である。
- workspace/user isolation を守る。
- Worker auth/workspace boundary は request header、env、runtime context から正規化した workspaceId と任意の userId を stable non-sentinel runtime id として扱い、invalid identity や configured shared secret mismatch では runtime ports、Turso、Agent、provider、Operation Router へ進めてはならない。
- note 削除時は derived structure / memory candidates を削除または無効化する。
- External integrations には user approval と scoped tokens が必要である。
- Tokens は plaintext で保存してはならない。
- Deleted/rejected memory は context から除外される。


## 許可されるトポロジー

Security rules は context assembly、operations、memory、future integrations を制約する。

## 移行用の seam

External integration prototypes は contract によって承認されるまで disabled のままでなければならない。

## 削除対象

note text を instructions として扱う prompts を削除する。

## ガード / 検証

untrusted-content boundary、context minimization、source-backed memory、unsafe operation rejection について AI prompts と router tests をレビューする。
