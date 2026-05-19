# 保守性の第一原理

複数の保守性 skill を同時に使うときの共通 frame として読む。

保守しやすい code とは、将来の変更が自然に着地できるように知識が配置された code である。表面的な綺麗さではなく、変更時の振る舞いで判断する。

## 原則

- 変更は避けられない。壊れ方と直し方が局所的な構造を優先する。
- 保守性は変更の局所性で測る。変更理由は、小さく自然な file 群に対応するべきである。
- 責務とは変更理由である。runtime で何をするかだけで code を分割・統合しない。
- 依存は安定した知識へ向ける。UI、DB、framework、protocol、vendor detail が stable policy を定義してはいけない。
- 重要な制約は構造で守る。誤りの影響が大きい、繰り返される、または変更時に壊れやすいなら、type、constructor、module API、state transition、test を使う。
- 抽象化は観測された variation の後に行う。早すぎる interface や generic helper は、変化の軸が分かる前に隠してしまう。
- 読みやすさとは局所的に理解できることである。name、type、boundary、comment、test は intent、前提、影響範囲を示す。
- test は設計の観測装置である。test しづらい code は、責務の曖昧さ、強すぎる依存、隠れた副作用、観測不能な behavior を示している可能性がある。

## 標準の判断順序

1. 変更理由を特定する。
2. 同じ理由が既にどこに置かれているか確認する。
3. volatile detail と stable policy を見分ける。
4. invariant と failure meaning を探す。
5. code を動かす前に current behavior を characterize する。
6. 将来の局所性を改善する最小の structural move を行う。
7. promise を表す behavior test を追加または調整する。

## 目的ではないこと

- 特定の設計流派を押し付けない。
- 対称性のためだけに layer を追加しない。
- duplication を default で全削除しない。
- 2 つ目の具体的な力が現れる前に interface を作らない。
- より綺麗な形が想像できるだけで module を rewrite しない。
