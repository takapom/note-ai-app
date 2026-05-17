---
name: superset-task-delegation
description: Use when creating or reviewing Superset tasks for Codex agents. Enforces owner contract, verification lanes, and workspace isolation.
---

# Superset Task Delegation


Read `docs/contracts/superset-codex-workflow.md`.

For each task:
1. Name owner contract.
2. Name verification lane(s).
3. Name allowed files or directories.
4. State non-goals.
5. Use Goal / Context / Constraints / Done when / Validation.
6. For complex work, ask Codex to plan first.
7. Avoid parallel tasks that edit same contract or core file family.
