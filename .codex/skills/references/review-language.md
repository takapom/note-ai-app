# 保守性レビューの言葉

保守性判断を PR comment や final review に落とすときに読む。

## 推奨する言い方

- 「これは 2 つの変更理由を混ぜています。X は ... のとき変わり、Y は ... のとき変わります。」
- 「この依存は stable policy から volatile detail へ向いています。将来の provider 変更が policy edit を要求します。」
- 「この invariant は caller の注意で守られています。invalid state を表現不能にする、または construction 時に reject する形にできますか。」
- 「この abstraction は 1 つの observed case しか隠していません。2 つ目の variation で変化の軸が見えるまで concrete code を保つ方がよいです。」
- 「この test は caller が依存する behavior ではなく implementation route を assert しています。」
- 「この refactor は、まず behavior を固定し、次に decision を 1 つ移し、その後 duplicated path を消す順序で進められます。」

## 避ける言い方

- 「clean ではない。」
- 「SOLID に反している。」
- 「もっと reusable にする。」
- 「service/helper/factory を使う。」
- 「なんとなく違和感がある。」

## 有用な出力形式

```markdown
Finding: [risk を 1 文で]
Why it matters: [非局所化または unsafe になる将来変更]
Evidence: [file/function/diff の根拠]
Suggested move: [最小の structural improvement]
Test signal: [守るべき behavior]
```
