export const storyboardCss = `
body {
  margin: 0;
  background: #f3f0ea;
}

.ann-storyboard {
  min-height: 100vh;
  padding: 0.85rem 2.5rem 1.25rem;
}

.ann-storyboard__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(30rem, 1fr));
  gap: 0.9rem 3rem;
  align-items: start;
}

.ann-storyboard__panel {
  display: grid;
  gap: 0.35rem;
}

.ann-storyboard__panel--wide {
  grid-column: 1 / -1;
  width: min(47rem, 56vw);
  justify-self: center;
}

.ann-storyboard__label {
  margin: 0;
  font-size: 1.15rem;
  line-height: 1.2;
  font-weight: 700;
  color: #111;
}

.ann-storyboard__frame {
  height: 14.65rem;
  overflow: hidden;
  background: var(--ann-surface);
  border: 1px solid rgba(33, 30, 26, 0.12);
  box-shadow: 0 0.65rem 1.4rem rgba(33, 30, 26, 0.14);
}

.ann-storyboard__panel--wide .ann-storyboard__frame {
  height: 13.95rem;
}

.ann-storyboard__frame .ann-app--quiet-writing {
  grid-template-columns: 8.6rem minmax(0, 1fr);
  min-height: 100%;
  height: 100%;
  background: var(--ann-surface);
}

.ann-storyboard__frame .ann-thin-rail {
  position: relative;
  padding: 0.65rem 0.55rem;
  gap: 0.65rem;
}

.ann-storyboard__frame .ann-thin-rail__workspace {
  font-size: 0.6rem;
}

.ann-storyboard__frame .ann-thin-rail::after {
  content: "□";
  position: absolute;
  top: 0.62rem;
  right: 0.55rem;
  font-size: 0.55rem;
  color: var(--ann-ink);
}

.ann-storyboard__frame .ann-thin-rail__label,
.ann-storyboard__frame .ann-thin-rail__thought-meta,
.ann-storyboard__frame .ann-writing-chrome__status,
.ann-storyboard__frame .ann-block-status {
  font-size: 0.5rem;
}

.ann-storyboard__frame .ann-thin-rail__mark {
  display: none;
}

.ann-storyboard__frame .ann-thin-rail__list {
  gap: 0.15rem;
}

.ann-storyboard__frame .ann-thin-rail__thought {
  padding: 0.25rem 0.35rem;
  border-radius: 0.25rem;
}

.ann-storyboard__frame .ann-thin-rail__thought-title {
  font-size: 0.52rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ann-storyboard__frame .ann-thin-rail__tools {
  flex-direction: column;
  gap: 0.18rem;
}

.ann-storyboard__frame .ann-icon-button,
.ann-storyboard__frame .ann-text-button {
  min-height: 1.15rem;
  padding: 0 0.35rem;
  border-radius: 0.2rem;
  font-size: 0.5rem;
}

.ann-storyboard__frame .ann-main {
  min-height: 0;
}

.ann-storyboard__frame .ann-writing-chrome {
  padding: 0.45rem 0.8rem 0;
}

.ann-storyboard__frame .ann-note-surface {
  --ann-note-max-width: 24.5rem;
  padding: 0.75rem 0.9rem 1rem;
}

.ann-storyboard__panel--wide .ann-note-surface {
  --ann-note-max-width: 25rem;
  padding-top: 0.6rem;
}

.ann-storyboard__frame .ann-note-header h1 {
  margin-bottom: 0.32rem;
  font-size: 1.05rem;
  line-height: 1.2;
}

.ann-storyboard__frame .ann-note-header p {
  margin-bottom: 0.5rem;
  font-size: 0.5rem;
  line-height: 1.5;
}

.ann-storyboard__frame .ann-block-editor {
  gap: 0.35rem;
}

.ann-storyboard__frame .ann-block-list {
  display: grid;
  gap: 0.25rem;
}

.ann-storyboard__frame .ann-block {
  padding: 0;
}

.ann-storyboard__frame .ann-block-text {
  min-height: 0.95rem;
  font-size: 0.52rem;
  line-height: 1.55;
}

.ann-storyboard__frame .ann-block-controls,
.ann-storyboard__frame .ann-block-status {
  display: none;
}

.ann-storyboard__frame .ann-return-layer--inline {
  margin-bottom: 0.55rem;
  border-radius: 0.28rem;
}

.ann-storyboard__frame .ann-return-layer--expanded {
  padding: 0.45rem 0.55rem;
  box-shadow: none;
}

.ann-storyboard__frame .ann-return-layer__header {
  margin-bottom: 0.25rem;
}

.ann-storyboard__frame .ann-return-layer__label,
.ann-storyboard__frame .ann-inline-label {
  font-size: 0.5rem;
}

.ann-storyboard__frame .ann-return-layer__summary {
  margin: 0.14rem 0 0.35rem;
  font-size: 0.66rem;
}

.ann-storyboard__frame .ann-return-layer__points {
  gap: 0.22rem;
  margin-bottom: 0;
}

.ann-storyboard__frame .ann-return-layer__point {
  gap: 0.125rem 0.5rem;
}

.ann-storyboard__frame .ann-return-layer__point-index,
.ann-storyboard__frame .ann-return-layer__point-title {
  font-size: 0.5rem;
}

.ann-storyboard__frame .ann-return-layer__actions {
  display: none;
}

.ann-storyboard__frame .ann-ai-assist-block {
  padding: 0.45rem 0.55rem;
  border-radius: 0.28rem;
  gap: 0.22rem;
}

.ann-storyboard__frame .ann-inline-actions button {
  min-height: 1.1rem;
  padding: 0 0.42rem;
  font-size: 0.5rem;
  border-radius: 0.2rem;
}

.ann-storyboard__frame .ann-provenance-popover[data-open="true"] {
  position: absolute;
  inset: auto 0.95rem 0.95rem auto;
  width: 10.2rem;
  padding: 0.5rem;
  border-radius: 0.28rem;
  font-size: 0.5rem;
  box-shadow: 0 0.55rem 1rem rgba(33, 30, 26, 0.14);
}

.ann-storyboard__frame .ann-provenance-popover h2 {
  margin: 0 0 0.25rem;
  font-size: 0.6rem;
}

.ann-storyboard__frame .ann-provenance-popover p {
  margin: 0.18rem 0;
}

.ann-storyboard__frame .ann-provenance-popover blockquote {
  margin: 0.5rem 0 0;
  padding-left: 0.5rem;
  border-left: 2px solid var(--ann-accent);
}

.ann-storyboard__panel--write .ann-note-header p {
  display: none;
}

.ann-storyboard__panel--write .ann-note-surface {
  padding-top: 1.35rem;
}

.ann-storyboard__panel--write .ann-block-list {
  margin-top: 0.65rem;
}

.ann-storyboard__panel--return .ann-block-list {
  border-top: 1px solid var(--ann-hairline);
  padding-top: 0.35rem;
}

.ann-storyboard__panel--assist .ann-ai-assist-block {
  margin-top: 0.15rem;
}

.ann-storyboard__panel--assist .ann-note-header h1,
.ann-storyboard__panel--provenance .ann-note-header h1 {
  margin-bottom: 0.25rem;
}

.ann-storyboard__panel--assist .ann-note-header p,
.ann-storyboard__panel--provenance .ann-note-header p {
  margin-bottom: 0.35rem;
}

.ann-storyboard__panel--assist .ann-block-list,
.ann-storyboard__panel--provenance .ann-block-list {
  gap: 0.18rem;
}`;
