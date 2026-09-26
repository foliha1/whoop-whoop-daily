# Architecture decisions

- Stage non-critical media after first paint and deduplicate image decode promises, so entry screens never compete with full game assets.