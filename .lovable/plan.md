# Product home-screen icons and manifests

## Scope
- Add the supplied square source marks to the project unchanged: cream-backed Daily and warm-black-backed Classic.
- Generate each product’s 180, 192, 512, maskable 512, 32, and 16 PNG files. Flatten every PNG onto its source background; keep standard icons square and add safe inset only to the maskable icon.
- Add separate Daily and Classic web manifests with the requested names, standalone display mode, product start URLs, and matching theme/background colors.
- Preserve every existing Open Graph, Twitter, canonical, title, description, and robots tag.

## Page ownership
- **Daily:** `/` and `/today`.
- **Classic:** `/classic.html` and its query-string invite/game variants; the emitted `/classic/index.html` and legacy `/play/index.html` static Classic documents receive the same Classic head through the existing prerender.
- **Neither / Daily fallback:** marketing and legal routes, `/you`, `/groups`, `/admin`, debug pages, and unknown routes keep the Daily-family favicon/manifest because they share Daily’s cream shell and root HTML document.
- The runtime `/classic` and `/classic/:roomCode` aliases will receive Classic head values in the browser, while share/invite links continue to use `/classic.html`, the existing raw-HTML Classic document. No routing or gameplay behavior changes.

## Implementation
- Add icon source/output folders under `public`, keeping the two source SVGs available as source assets.
- Use deterministic raster generation and inspect every PNG’s dimensions, alpha channel, and corner/background pixels.
- Add Daily manifest, Apple icon, Apple title, and favicon tags to the root HTML head.
- Extend the existing Classic head transformer only for product identity tags: swap Daily manifest/icon/title/favicon links for Classic equivalents without touching its metadata transformations.
- Add route-aware head switching for `/classic` aliases so browser navigation cannot retain Daily product identity.
- Add focused tests for the Classic transformer, route ownership, manifest values, no cross-linking, and generated file dimensions.

## Verification
- Fetch `/`, `/today`, and `/classic.html` without JavaScript and inspect their raw HTML.
- Confirm each product has exactly its own manifest, Apple icon, Apple title, and favicons; confirm no Classic tags in Daily HTML and no Daily tags in Classic HTML.
- Confirm fallback pages retain the chosen Daily identity and existing metadata is byte-for-byte unaffected outside the new product tags.
- Check the final build diagnostics and report every generated file with dimensions.

## Required asset handoff
The mounted uploads currently contain no pair of square cream/warm-black eye-mark SVGs. Implementation can begin as soon as those two files are attached or their exact existing filenames are identified; I will not substitute or redraw brand art.
