# נְכֶסְקַל — Design system

## Product surface

Hebrew RTL workspace for reviewing a broker's apartment proposal against a
client request and a read-only property database. The product helps a human
reach a decision; it does not make the decision for them.

## Direction

Operational clarity in a field-notes workspace. A deep evergreen header gives
the tool a recognizable home; a restrained mineral ground and high-contrast
work surfaces keep long Hebrew text comfortable to scan. The form and report
remain the center of gravity, with the recommendation the strongest result
signal.

## Tokens

- **Ink:** `#20251f`; muted text `#656e63`.
- **Shell:** evergreen `#234d3a`; action `#315f43`; hover `#244b34`.
- **Canvas:** mineral `#eef0ea`; surface `#fbfcf8`; white inputs `#ffffff`.
- **Lines:** `#d9ded5` and `#c8d0c5`.
- **Match:** `#285735` on `#deeadc`.
- **Review / unknown:** `#604714` on `#f3ead3`.
- **Mismatch / stop:** `#762e27` on `#f2e1dc`.
- **Typography:** Heebo for Hebrew UI and reading; use tabular numerals for
  counts, IDs and values. Avoid decorative display faces.
- **Geometry:** compact 6–10px control and panel radii; no decorative shadows.

## Components and behavior

- A solid evergreen top bar holds the wordmark and familiar page navigation.
- Primary workflow: clear page title, one full-width input panel, then the
  recommendation and comparison evidence in the report.
- Recommendation color communicates status only; copy stays authoritative.
- Comparison rows disclose source quote and database/request value on expand.
- Form fields retain their labels, helper text, character counts and validation.
- Catalog remains a searchable, expandable list of properties.
- Responsive layout stacks report columns and keeps controls usable on narrow
  screens. Respect reduced-motion preferences and visible keyboard focus.
