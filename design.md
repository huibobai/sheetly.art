# Design: sheetly.art

The locked system for the generator redesign. Pages share it.

## System
- Genre: playful
- Shape of the first page: Workbench
- Theme: brand (vibe: "cream mat, die-cut sheet")
- Axes: cream/rounded/berry · posture: full-palette

## Tokens
`app/tokens.css` is the source of truth. Paper is the cutting-mat cream, ink is the existing navy, accent is the berry. Display is Fredoka via `next/font`. Body is Geist via `next/font`. Raised surfaces use a hard offset shadow and a tinted paper-3 fill.

## Controls
One filled berry pill (`.btn-primary`) and one ghost pill (`.btn`). Press moves 1px. Focus rings are instant. Marketing controls are 48px tall.

## Signature
The die-cut sheet is the first screen. Before a photo, it is CSS geometry. After a photo, the existing sheet canvas replaces it.
