# GameSmith design system: "Ember on Bone"

Living reference: run `npm run dev` and open `/design-system` (hidden in production).

## Identity in one line

A warm editorial canvas (bone paper, ink type) with one accent (ember), where **ordered dither is the texture of the brand**. It comes straight from the logo: pixel wordmark, halftone sun, dithered islands.

## Principles

1. **Texture over hue.** One accent. Emphasis comes from tone and dither density, never extra colors.
2. **Editorial calm.** Generous space, serif voice, few borders. The game is the loudest thing on screen.
3. **Stepped motion.** Brand animations move in `steps()`, like sprites. No floaty easing on brand moments.
4. **Ember means agency.** Ember marks the forge action and the agent. One ember action per view.
5. **Real pixels.** Pixel art sits on a grid and scales by integers. Never blur a pixel.
6. **Quiet chrome.** Hairlines over boxes. Panels recede so conversation and preview lead.

## Color

Sampled from `public/logo.png`. Defined in `app/globals.css`.

| Role | Paper (default) | Night (`.dark`) |
|---|---|---|
| background | `#f8f4ea` bone | `#121110` night |
| foreground | `#1c1b19` ink | `#f3eee2` |
| surface (recessed, sidebars) | `#f3eee2` | `#0d0c0b` |
| card / raised | `#fcfaf5` | `#1a1917` |
| muted-foreground | `#6b6862` (5.1:1) | `#9a958a` (6.3:1) |
| primary (default action) | ink fill, bone text | bone fill, night text |
| ember (forge action) | `#e4663a` fill, **ink** text (5.1:1) | same |
| ember-text (links, agent) | `#b83f16` (5.1:1) | `#ea8158` |
| ember-soft (tinted chips) | `#fbe1d3` | `#2e1a12` |
| destructive | `#b3261e` | `#e5534b` |
| border / hairline | `#e2dacb` / `#e9e2d4` | 10% / 6% bone |

Static ramps (`bg-bone-50..950`, `bg-ember-50..900`) are for illustration and dither palettes. UI uses the semantic tokens.

Rules:
- Pure ember on paper is 3.1:1. Use it for display type and fills only, never body text.
- Paper is for reading surfaces (auth, settings, library). Night is for the workspace, where the game preview needs a dark frame.
- No new hues. Success and error states use icons and copy first; `success` and `destructive` are the only extra colors.

## Typography

| Family | Token | Use |
|---|---|---|
| Instrument Serif | `font-display` | Headlines, empty states, poetic moments. Italic + ember for emphasis. |
| Geist Sans | `font-sans` | All UI and chat. Body 15/1.55, small 13. |
| Geist Mono | `font-mono` | Tool calls, file paths, code, errors. |
| Geist Pixel | `font-pixel`, `label-pixel` | Eyebrows, chips, keys, counters. Never sentences. |

Display scale: `text-display-2xl` 72, `-xl` 56, `-lg` 44, `-md` 34, `-sm` 26. Micro label: `label-pixel` (11px, uppercase, 0.08em tracking).

## Space, shape, depth

- 4px grid (Tailwind spacing). Sections breathe: 96 to 112px between major blocks on desktop.
- Radius base 6px: `sm` chips, `md` buttons, `lg` panels, `xl` composer, `2xl` preview, `none` pixel art.
- Edges: `border-hairline` for dividers, `border-border` for panels.
- Depth: `shadow-key` (hard 2px ember-800 shadow, presses down on click) for ember actions; `shadow-float` for menus and the composer. No other shadows.
- Focus: 2px ember outline, 2px offset (global `:focus-visible`).

## Dither

The illustration engine. No stock imagery.

**`<DitherField scene palette pixel animated />`** (`components/dither/dither-field.tsx`): procedural scenes rendered through an 8x8 Bayer dither with theme colors. Palettes are token names, so fields follow the theme.

| Scene | Use |
|---|---|
| `horizon` | Auth, landing, onboarding, footers. Sky stays dark so type can sit on it. |
| `sun` | Hero and success moments (the logo's halftone sun). |
| `clouds` | Empty states, soft backdrops. |
| `forge` | Agent building a game. Animated. |
| `glow` | Idle preview, focus halos. |
| `fade` | Dissolving edges. |

**`<DitherImage src reveal />`**: duotone dither for game thumbnails, so a library of different games reads as one collection. `reveal` shows the real image on hover.

**CSS utilities**: `dither-12/25/50/75` (Bayer masks on the element's own background, cell via `--dither-cell`), `dither-coarse`, `bg-halftone` (currentColor dots), `grain` (paper noise), `pixelated`.

Rules:
- One dither field per view. It is atmosphere, not wallpaper.
- Dither pixel is 2 to 4 CSS px.
- Never set body text on a dense field. Keep it in a dark sky region or on a solid scrim.
- Animate only while the agent is working. `prefers-reduced-motion` stops all animation.
- Thumbnails dither. The live game preview never does.

## Brand components

- `<Wordmark height tone />`: pixel wordmark redrawn from the logo grid (69x15 cells). Use heights that are multiples of 15 for crisp pixels. `tone="mono"` for single color.
- `<Spark size twinkle />`: the 4-point pixel star (the dot of the i). Marks AI and agent moments. Sizes in multiples of 7.
- `<PixelLoader />`: 3x3 stepped loader for short waits inside controls.
- `<DitherProgress value? />`: dithered leading edge; indeterminate marches.

## Controls

- Button variants: `default` (ink), `ember` (forge action, key press), `outline`, `secondary`, `ghost`, `link`, `destructive`.
- Badge variants add `pixel` (status chips) and `ember` (tinted tags). Chips are square (`rounded-sm`), not pills.
- `Kbd` is set in Geist Pixel with a 2px bottom edge.
- Skeletons step instead of pulsing.

## States vocabulary

| State | Treatment |
|---|---|
| Thinking | `<Spark twinkle />` + "Thinking" |
| Short wait | `<PixelLoader />` inside the control |
| Long work (building) | `<DitherField scene="forge" animated />` + step label |
| Progress | `<DitherProgress />` |
| Empty | Serif headline, one-line prompt, one ember action, light `clouds` field below |
| Error | Destructive tint panel, mono error excerpt, "Ask the agent to fix" as the ember action |

## Icons

Lucide, 16px in UI (14px in dense rows), default stroke. The `Spark` is the only custom glyph; do not mix other icon sets.


// made by sanskar shukla 