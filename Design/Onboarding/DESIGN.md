# Design System Strategy: The Cognitive Sanctuary

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Architect."** 

Standard productivity tools often feel cluttered, shouting for attention with heavy borders and chaotic grids. This system rejects that "generic SaaS" noise in favor of an editorial, high-end experience. We treat the interface as a physical workspace—a sanctuary where focus is protected. 

The aesthetic moves beyond "flat" design into **Sophisticated Tonalism**. By utilizing intentional asymmetry, expansive white space, and high-contrast typography scales, we create a layout that feels curated rather than generated. We prioritize the "breathing room" around data as much as the data itself, ensuring the user feels calm, proactive, and secure.

---

## 2. Color & Surface Philosophy
The palette is rooted in `background: #f8f9fa` (a soft, surgical white) and driven by `primary: #1A73E8` (Neuron Blue). However, the premium feel is found in the transitions between the neutral tiers.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to section off content. Traditional "boxes" are an admission of failure in hierarchy. 
- Boundaries must be defined solely through **background color shifts**. 
- To separate a sidebar from a main feed, use `surface-container-low` against the `surface` background. 
- For content modules, use `surface-container-lowest` (pure white) to create a natural "lift" from the light gray base.

### Surface Hierarchy & Nesting
Treat the UI as layered sheets of fine paper. 
1. **Base Layer:** `surface` (#f8f9fa) — The infinite canvas.
2. **Structural Sections:** `surface-container-low` (#f3f4f5) — Large layout regions (Sidebars, Nav).
3. **Primary Focus Cards:** `surface-container-lowest` (#ffffff) — Where the user does their work.
4. **Active/Overlay Elements:** `surface-container-highest` (#e1e3e4) — Temporary states or high-utility tools.

### The Glass & Signature Texture Rule
To achieve the "Sanctuary" feel, use **Glassmorphism** for floating elements (Modals, Hover Menus). 
- **Token:** Use `surface_variant` at 70% opacity with a `24px` backdrop-blur.
- **CTAs:** Apply a subtle linear gradient to main buttons, transitioning from `primary` (#005bbf) to `primary_container` (#1a73e8) at a 135-degree angle. This prevents the "flat" look and adds a sense of tactile energy.

---

## 3. Typography: The Editorial Voice
We use a high-contrast pairing to distinguish between "Thinking" (Headings) and "Doing" (Body).

*   **Display & Headlines (Manrope):** These are the architectural anchors. Use **Bold** weight with a **-2% letter-spacing (tight tracking)**. This creates an authoritative, "locked-in" feel common in premium print magazines.
*   **Body & Titles (Inter):** Chosen for its clinical legibility. It provides the "Proactive" and "Secure" personality traits, ensuring data is never misread.

| Level | Font | Size | Weight | Intent |
| :--- | :--- | :--- | :--- | :--- |
| **Display-LG** | Manrope | 3.5rem | Bold | High-impact moments |
| **Headline-MD** | Manrope | 1.75rem | Bold | Primary section headers |
| **Title-MD** | Inter | 1.125rem | Medium | Content groupings |
| **Body-LG** | Inter | 1rem | Regular | Long-form reading |
| **Label-MD** | Inter | 0.75rem | Bold (Caps) | Utility and metadata |

---

## 4. Elevation & Depth
Depth in this system is achieved through **Tonal Layering**, not structural shadows.

*   **The Layering Principle:** A `surface-container-lowest` card placed on a `surface-container-low` background creates a "soft lift." This is our primary method of elevation.
*   **Ambient Shadows:** For floating elements (e.g., Command Palettes), use an "Extra-Diffused" shadow.
    *   *Offset:* 0px 20px | *Blur:* 40px | *Color:* `on-surface` (#191c1d) at **4% opacity**.
*   **The Ghost Border:** If a boundary is strictly required for accessibility, use a 1px stroke of `outline-variant` at **20% opacity**. It should be felt, not seen.

---

## 5. Components & Interaction Patterns

### Buttons
*   **Primary:** Gradient fill (`primary` to `primary_container`), `8px` (Round Eight) corner radius. No border. Text: White.
*   **Secondary:** `surface-container-high` fill. Text: `primary`. 
*   **Interaction:** On hover, the button should not "glow"; it should subtly shift its vertical position (move up 1px) and increase shadow diffusion to simulate physical lift.

### Input Fields
*   **The Neutral State:** Use `surface-container-lowest` with a subtle `outline-variant` (20% opacity) "Ghost Border."
*   **Focus State:** The border opacity increases to 100% `primary`, and a 4px soft "Neuron Blue" outer glow appears using a blur without an offset.

### Cards & Lists
*   **Strict Rule:** No divider lines between list items. Use **Vertical White Space** (16px or 24px from the spacing scale) to separate elements. 
*   **Selection:** An active list item should change its background to `primary_fixed` (#d8e2ff) and add a `primary` vertical "pill" (4px width) to the left edge to denote focus.

### The "Cognitive" Tooltip
*   Tooltips should be `inverse_surface` with a `surface_variant` text color. They should appear with a slight "spring" animation (Scale 0.95 to 1.0) to feel proactive and responsive.

---

## 6. Do’s and Don'ts

### Do:
*   **Embrace Asymmetry:** Place your primary action buttons in unexpected but ergonomic locations (e.g., bottom-right floating or top-left editorial alignment).
*   **Use Tonal Depth:** Always ask "Can I use a color shift instead of a line?"
*   **Tighten Headlines:** Ensure Manrope headlines are always bold and tightly tracked to maintain the "Architect" persona.

### Don’t:
*   **Never use pure black shadows:** Shadows must always be low-opacity and tinted by the surface color.
*   **Avoid "Bento Box" Grid Overload:** Do not trap every piece of content in a border. Let elements float on the `surface` when they don't require high-tier containment.
*   **No Heavy Dividers:** 100% opaque lines are the enemy of clarity in this system. Use white space.

---

## 7. Roundedness Scale (The "Round Eight" Standard)
All components follow a mathematical progression based on **0.5rem (8px)** to maintain visual harmony.

*   **Small (2px):** Checkboxes, tight UI elements.
*   **Medium (6px):** Small buttons, tags.
*   **Large (8px):** The Standard. Default for Buttons, Cards, and Inputs.
*   **Extra Large (12px):** Modals, large feature containers.
*   **Full (9999px):** Pills, search bars.