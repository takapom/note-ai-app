# MVP 受け入れ契約

ドキュメント種別: contract  
権威: MVP 完了条件の信頼できる唯一の情報源  
オーナー: product オーナー  
付随契約: mvp-scope.md, verification-lanes.md, non-functional-requirements.md  
生成済み companion: docs/generated/register.md  
検証レーン: product review lane + contract lane  
ステータス: active

## 目的

MVP が成立したと言える条件を、実装タスクの完了条件とは別に固定する。

## この契約が所有するもの

- MVP 全体の受け入れ条件。
- post-MVP と混同してはならない合格基準。
- Codex/Superset task の traceability に関する最終確認。

## この契約が所有しないもの

- individual task の Done when。
- UI visual polish の詳細。
- production launch checklist。
- post-MVP roadmap。

## 不変条件

MVP は次を満たすまで完了とみなさない。

1. ユーザーが一枚のノートに自然に書ける。
2. H1/H2/H3 が section boundary として扱われる。
3. blocks と sections が内部正本として保存される。
4. note close / tab switch / app leave で dirty section の structure job が作られる。
5. keystroke ごとに AI が呼ばれない。
6. Context Assembly が title、description、target section、related units、memory を使う。
7. AI は operation schema に従って返す。
8. Operation Router が unsafe operation を reject する。
9. AI Assist Block が同じノート内に表示される。
10. Next Open Digest が表示できる。
11. Memory candidate をノート内で承認または拒否できる。
12. Provenance Popover で source を確認できる。
13. AI provider failure が発生しても note editing は継続できる。
14. MVP に AI chat panel、AI mode switcher、external integration が入っていない。
15. Codex task、Superset workspace、docs contract の traceability が維持される。

## 許可されるトポロジー

MVP acceptance は product、note model、scheduler、context、operation、memory、frontend、runtime、verification の各 contract を統合して判断する。

## 移行用の seam

未実装項目は `not-yet-available` として明示してよいが、MVP complete として扱ってはならない。

## 削除対象

acceptance criteria を満たさないまま MVP complete と宣言する release notes、task summaries、PR descriptions を削除または修正する。

## ガード / 検証

MVP review はこの契約の 15 項目を checklist として実行し、未達項目を follow-up task ではなく blocking gap として扱わなければならない。
