# Design QA — 抽背名解翻面布局

Date: 2026-07-23

## Source of truth and evidence

- Reference: `/Users/ganlin/.codex/visualizations/2026/07/21/019f824f-c134-7f21-951d-00e07d07bde3/mti-drill-layout-20260723/reference-ai-layout.png`
- Original drill UI: `/Users/ganlin/.codex/visualizations/2026/07/21/019f824f-c134-7f21-951d-00e07d07bde3/mti-drill-layout-20260723/original-drill-layout.png`
- Desktop implementation: `/Users/ganlin/.codex/visualizations/2026/07/21/019f824f-c134-7f21-951d-00e07d07bde3/mti-drill-layout-20260723/after-1440x1000.png`
- Mobile implementation: `/Users/ganlin/.codex/visualizations/2026/07/21/019f824f-c134-7f21-951d-00e07d07bde3/mti-drill-layout-20260723/after-390x844.png`
- Focused comparison: `/Users/ganlin/.codex/visualizations/2026/07/21/019f824f-c134-7f21-951d-00e07d07bde3/mti-drill-layout-20260723/reference-vs-implementation.png`

## Capture conditions

- Desktop: 1440 × 1000 CSS viewport; 1440 × 964 captured pixels; DPR 1; 名解 card flipped.
- Split breakpoint: 900 × 700; AI panel and drill panel visible with zero overlap.
- Compact breakpoint: 899 × 700; single-panel overlay scrolls vertically and keeps the full drill reachable.
- Mobile: 390 × 844 CSS viewport and captured pixels; DPR 1; default and internally scrolled answer states checked.

## Comparison passes

| Surface | Result |
| --- | --- |
| Typography | Replaced the undifferentiated white-on-orange paragraph with the reference hierarchy: serif green 19 px section headings, 18 px / 1.9 desktop answer text, and 16 px / 1.82 mobile answer text. Long Chinese copy wraps without horizontal overflow. |
| Spacing and layout | Uses three stacked paper sections with consistent 14 px gaps, 12 px radii, green rails, a centered 680 px reading column, and compact mobile padding. The card has internal vertical scrolling for long answers. |
| Colors and surfaces | Reuses the app's existing paper, card, line, green, ink, and muted-gold tokens. The old saturated orange back face is removed only for 名解 cards. |
| Assets and icons | No new visual assets, dependencies, emoji decoration, SVG substitutes, or placeholder art were introduced. Existing controls and close icon remain unchanged. |
| Copy and content | Preserves the original answer, turns 采分点 into a numbered scan list, and keeps 记忆口诀 as a separate low-emphasis study aid. Compact middle-dot data is split with answer context so names such as 亚当·斯密 remain intact. Text is inserted with `textContent`. |

## Interaction and resilience

- Card click and the explicit 翻面 button both still toggle the answer face.
- 名解 renders three semantic sections when data is present; ordinary 词条 cards retain their existing colored back-face treatment.
- Desktop, tablet, compact, and mobile layouts have zero document-level horizontal overflow.
- At 390 px, all answer action/navigation controls have at least a 44 px height; the two grading actions remain 48 px.
- Long content is contained by the answer-card scroller, and 记忆口诀 remains reachable by scrolling inside the card.
- The only console entries during localhost verification were the existing cloud-sync `Failed to fetch` warnings; no new script or rendering errors appeared.

## Comparison history

1. Initial issue: the orange block treated the answer, score points, and mnemonic as one dense layer, producing weak hierarchy and difficult scanning.
2. Fix: introduced reference-aligned paper sections, numbered score points, responsive type/spacing, and contained scrolling.
3. Post-fix check: the combined reference/implementation image shows matching reading hierarchy and visual language; breakpoint and interaction checks passed.

Final result: passed
