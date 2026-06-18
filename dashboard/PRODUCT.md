# Product

## Register

product

## Users

Small team managing voice AI agents and telephony infrastructure. They configure agent prompts, connect phone numbers, launch test calls, and monitor call outcomes. Their context is operational: they open the dashboard to do a specific task (update a prompt, check a call, assign a number) and close it. Speed and clarity matter more than delight.

## Product Purpose

Intervoo is a control plane for voice AI agents built on LiveKit. It lets operators create agent profiles with persisted prompts, connect Vobiz phone numbers, dispatch test calls from a playground, and review call artifacts (recordings, transcripts). The dashboard is the operational interface; the Python agent service is the runtime.

## Brand Personality

Precise. Focused. Confident.

Three words: **precise, focused, confident**. The tool disappears into the task. No decoration that doesn't serve clarity. No motion that doesn't convey state. The interface should feel like a well-tuned instrument: every element earns its place, spacing creates rhythm, hierarchy is obvious without thinking.

Voice: direct, specific, no marketing language. Labels say what things do. Descriptions explain what happens when you act.

## Anti-references

- **Generic SaaS dashboard**: the card-grid, gradient-accent, hero-metric layout. Cookie-cutter admin panels with identical card patterns repeated endlessly.
- **Over-decorated admin**: heavy borders, nested cards, excessive badges and tags. Feels cluttered and busy. Card-inside-card layouts.
- **Dark-mode developer tool**: terminal-like, monospace-heavy, dark backgrounds. Too niche for a small-team operational product.
- **AI slop admin panels**: oversized empty spacing, random sparkle icons, vague helper copy, gradient hero treatment, and identical rounded cards.

## Design Principles

1. **Tool disappears into the task.** Users open the dashboard to do something specific. Every screen should make the primary action obvious and the path to it short.
2. **Earn familiarity through consistency.** Same button shape, same form vocabulary, same spacing rhythm across every screen. Consistency is a virtue, not boring.
3. **Density over decoration.** Show useful information. Don't wrap content in decorative containers. Sections are defined by typography and spacing, not card borders.
4. **State is always visible.** Loading, empty, error, success: every state has a clear visual treatment. No guessing whether something is working.
5. **One accent, used sparingly.** Primary actions and current selection get the accent color. Everything else is neutral. Color carries meaning, not decoration.

## Accessibility & Inclusion

WCAG AA compliance. 4.5:1 contrast for body text, 3:1 for large text. Keyboard navigation for all interactive elements. Reduced motion support via `prefers-reduced-motion`. Semantic HTML structure for screen readers.
