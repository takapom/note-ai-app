---
name: docs-register-generation
description: Use when updating machine-owned docs/generated/register.md and related evidence files.
---

# Documentation Register Generation


Generated files are projection.
Do not redefine policy in generated files.

Steps:
1. Scan contracts/guides/runbooks/records/skills/subagents.
2. Update register.
3. Update authority graph JSON if authority surface changed.
4. Do not edit contracts during generation unless explicitly requested.
