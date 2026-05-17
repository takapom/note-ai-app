# Codex レビューテンプレート

現在の diff を次に照らしてレビューする:

- `AGENTS.md`
- `docs/contracts/product-principles.md`
- `docs/contracts/repository-topology.md`
- `docs/contracts/operation-return-contract.md`
- 変更が触れた contract

確認すること:

- SoT vs projection confusion
- topology violation
- keystroke ごとの AI structuring
- user-authored block の direct rewrite
- missing source spans
- missing confidence
- accidental AI chat panel
- accidental AI mode switcher
- external integration scope creep
- missing tests
- undocumented contract change

返すもの:

- verdict: accept / request changes
- violations
- risky files
- required follow-up tasks
