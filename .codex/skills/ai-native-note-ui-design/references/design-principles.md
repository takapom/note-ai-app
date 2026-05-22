# Design Principles

Source of record: `docs/records/frontend-architecture-implementation-plan-2026-05-20.md`.

## Product feel

- Quiet work tool, not a marketing surface.
- Note First, AI Second.
- Calm density: readable and scannable, but not sparse landing-page composition.
- Provenance as trust: inspectable when needed, not always visually dominant.
- Accessibility is contract, not polish.

## Layout

- Primary surface: note title, sections, blocks, editor interactions.
- Secondary surface: digest, AI assist, memory candidates, provenance details.
- Supporting surface: navigation, status, account/workspace controls.
- Avoid nested cards, floating decorative page sections, decorative hero layouts, and ornamental backgrounds.
- Mobile must preserve the writing surface first.

## Visual hierarchy

1. Note title and user-authored blocks.
2. Section structure and block editing controls.
3. Digest, AI assist, and memory candidate surfaces.
4. Provenance and metadata.
5. Developer or configuration errors.

AI-generated content may be editable, dismissible, and inspectable, but frontend must not decide that an AI projection has become canonical user-authored source of truth.

## Interaction rules

- AI controls do not steal focus while the user is typing.
- Save, digest, memory, and AI updates preserve focus, selection, IME composition, and dirty drafts.
- Manual Organize is a command, not an AI mode switcher.
- Use icon buttons for familiar tools with accessible labels or tooltips.
- Use text buttons for explicit commands such as `Accept`, `Dismiss`, `Hold`, and `Delete`.
- Avoid visible instructional copy explaining architecture or implementation mechanics.

## No invented state

- Do not generate operation IDs, memory IDs, provenance IDs, source span IDs, note IDs, or block IDs.
- Do not create fake digest items, fake provenance, fake related notes, or fake memory candidates.
- Do not infer operation / memory / provenance mappings without caller-supplied mappings.
- Missing, empty, unavailable, or not-configured states remain visible as such.

