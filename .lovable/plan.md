# Refine the Classic How to Play demo

## What will change
- Restyle the demo shell, player chips, board panel, spacing, card sizing, die, and action row to match the live Classic play view on its khaki surface.
- Replace element-attached tooltips with one reserved bubble slot below the board. A moving connector will point from that fixed bubble to the active spotlight.
- Increase explanatory copy by one type-scale step and render it in Geist.
- Add an automatic two-beat sequence to every step: animation then explanation by default, with reduced motion showing both settled state and explanation immediately.
- Review and lightly revise copy so it describes completed actions where needed.
- Keep manual Back, Next, and Skip behavior; one Next tap advances one full step.

## Step sequencing
1. Show then tell — the nine-card deal is visible first.
2. Show then tell — the die rolls and lands first.
3. Show then tell — the first card flips up and back.
4. Show then tell — the second card flips up and back.
5. Show then tell — WHOOP’s two flips play first.
6. Tell then show — the rule that calling is always available must precede its demonstration.
7. Show then tell — the board-wide claim pulse and caller state appear first.
8. Show then tell — the two selections lock and resolve before the explanation.
9. Show then tell — score and replacement cards update first.
10. Show then tell — the winner rolls the next rule first.
11. Show then tell — the incorrect pair resolves as a miss first.
12. Show then tell — score return, exposed cards, and unavailable state settle first.
13. Tell then show — the two-call limit is a standing rule with no independent event to observe first.
14. Show then tell — WHOOP calls, selects, matches, and takes the die first.
15. Tell then show — the closing play choice is instructional navigation, not an animated game event.

## Technical details
- Add named demo explanation-delay/fade constants in the shared animation timing file.
- Simplify the spotlight component to dim regions and expose their measured target point; render the bubble and connector once at the demo level.
- Reserve a stable maximum-height bubble area sized for the longest copy at 390×520, without scrolling or layout movement.
- Preserve all reducer, game-rule, arbiter, and Daily code.
- Validate all 15 steps at 390×520, plus a taller phone and desktop; verify reduced-motion settled frames.
