# Frontend Boundary Review Checklist

参照元 record: `docs/records/frontend-architecture-implementation-plan-2026-05-20.md`

## Backend-owned semantics

frontend が次を判断していたら flag する:

- AI operation safety.
- memory context eligibility.
- section boundaries.
- StructureJob scheduling.
- canonical mutation / promotion of AI output.
- whether AI output can directly mutate Note / Section / Block source of truth.

## Backend pollution

UI display convenience だけのために backend API を変えていたら flag する。例:

- `cardColor`
- `isExpandedByDefault`
- `rightPanelSection`
- `componentVariant`
- `cssClassName`

product meaning を表す backend field は許容する。例:

- `origin`
- `provenance`
- `operationPolicy`
- `status`
- `sourceSpan`
- `triggerReason`
- `proposalState`

## Dependency direction

Flag:

- `shared-ui` が product module を import している。
- API client が React または UI module を import している。
- feature component が `fetch` を直接呼んでいる。
- presenter が API を呼んでいる。
- `app/` が product rule を持っている。
- API path literal が `runtime/api-client` の外に散っている。

## UI design

Flag:

- AI content が user-authored content と区別できない。
- digest、memory、AI surface が writing を邪魔している。
- mobile layout で secondary AI UI が note surface を隠している。
- AI/user distinction が color-only。
- focus、keyboard、pending、error state が不足している。

## No invented state

次の捏造を flag する:

- operation IDs.
- memory IDs.
- provenance IDs.
- source span IDs.
- note or block IDs.
- fake digest items.
- fake provenance.
- fake related notes.
- fake memory candidates.
