---
name: топology-review
description: Use when a task touches multiple layers or changes dependencies. Checks repository topology boundaries and forbidden shortcuts.
---

# Topology Review


Read `docs/contracts/repository-topology.md`.

Review:
- Does the change cross an allowed topology edge?
- Did a shared package gain ownership without reason-to-change?
- Did runtime code start owning product semantics?
- Did UI start owning note model semantics?
- Did generated artifacts become authority?
- Is a transitional seam declared if a bridge/fallback exists?
Return violations and required contract updates.
