---
name: operation-contract-implementation
description: Use when implementing AI operation schema, Operation Router, or operation tests.
---

# Operation Contract Implementation


Read `docs/contracts/operation-return-contract.md` and `docs/guides/operation-schema-guide.md`.

Rules:
- AI returns operations, not free-form results.
- Source spans required for visible or memory-affecting operations.
- Confidence required where relevant.
- Unknown operations rejected.
- User-authored blocks cannot be directly rewritten.
- Add accept/reject/no_op tests.
