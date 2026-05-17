---
name: contract-authoring
description: Use when creating or modifying docs/contracts/**. Enforces SoT/projection separation, owner fields, companion contracts, generated companion, verification lane, transitional seams, and target deletion sections.
---

# Contract Authoring


Follow `docs/contracts/documentation-system.md` and `docs/contracts/authority-graph.md`.

Steps:
1. Identify the owner by reason-to-change, lifecycle, invariant, language, and consistency boundary.
2. Decide whether the change is a contract decision or a projection update.
3. If contract, include: owns, does not own, companion contract, generated companion, guard lane, transitional seam, target deletions.
4. Do not place policy in guides, README, records, issues, or PR descriptions.
5. Update `docs/generated/register.md` after contract changes.
6. Stop if the task is actually implementation-only.
