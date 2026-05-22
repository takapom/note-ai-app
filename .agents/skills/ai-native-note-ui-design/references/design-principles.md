# Design Principles

参照元 record: `docs/records/frontend-architecture-implementation-plan-2026-05-20.md`

## Product feel

- marketing surface ではなく quiet work tool。
- Note First, AI Second.
- Calm density: 読みやすく scan しやすいが、landing page のようにスカスカにしない。
- Provenance as trust: 必要なときに検査できる。常に視覚的に主張し続けない。
- Accessibility は polish ではなく contract。

## Layout

- Primary surface: note title、sections、blocks、editor interactions。
- Secondary surface: digest、AI assist、memory candidates、provenance details。
- Supporting surface: navigation、status、account / workspace controls。
- nested card、浮いた装飾 section、decorative hero layout、ornamental background は避ける。
- mobile でも writing surface を最優先で保つ。

## Visual hierarchy

1. note title と user-authored blocks。
2. section structure と block editing controls。
3. digest、AI assist、memory candidate surfaces。
4. provenance と metadata。
5. developer / configuration errors。

AI-generated content は編集・dismiss・検査できてよい。ただし frontend は、AI projection が canonical user-authored source of truth になったと判断してはいけない。

## Interaction rules

- ユーザーが typing 中に AI controls が focus を奪わない。
- save、digest、memory、AI update は focus、selection、IME composition、dirty draft を壊さない。
- Manual Organize は command であり、AI mode switcher ではない。
- familiar tool には icon button を使い、accessible label または tooltip を付ける。
- `Accept`、`Dismiss`、`Hold`、`Delete` のような明示 command には text button を使う。
- architecture や implementation mechanics を説明する visible instructional copy は避ける。

## No invented state

- operation ID、memory ID、provenance ID、source span ID、note ID、block ID を生成しない。
- fake digest item、fake provenance、fake related note、fake memory candidate を作らない。
- caller-supplied mapping なしに operation / memory / provenance mapping を推測しない。
- missing、empty、unavailable、not-configured state はそのまま表示する。
