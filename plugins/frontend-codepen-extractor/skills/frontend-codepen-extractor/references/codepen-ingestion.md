# CodePen ingestion and diagnostics

## Source acquisition ladder

Use the first available method; do not bypass login, paywalls, access controls, or site restrictions.

1. **User-provided URL with accessible source panels:** inspect the actual HTML/Markup, CSS, JS, preprocessors, external resources, and settings.
2. **Exported ZIP/files:** inspect the exported files and note any differences between embed page and exported source.
3. **Pasted panels:** request/preserve each panel separately and ask for preprocessor/external-resource settings when material.
4. **Screenshot only:** use it for visual intent, not as proof of the underlying implementation. Ask for source if behavior must be replicated.

If no method exposes the source, stop source-specific refactoring and state exactly what is missing. Do not hallucinate hidden settings or CDN dependencies.

## Preprocessor diagnostics

| Panel | Common inputs | Conversion requirement |
|---|---|---|
| Markup | HTML, Pug/Jade, Haml, Slim, Markdown | Produce semantic markup compatible with the target framework. |
| Styles | CSS, SCSS/Sass, Less, Stylus, PostCSS | Convert variables, nesting, mixins, imports, and vendor syntax to the target pipeline. |
| Script | JavaScript, Babel/ESNext, TypeScript, CoffeeScript | Convert syntax and runtime dependencies; preserve behavior and type-safety conventions. |

Do not infer a preprocessor solely from syntax if there could be multiple interpretations. Record ambiguous syntax and test the conversion.

## Dependency inventory

Look for direct imports and less obvious dependencies:
- external `<script>`/`<link>` tags and CSS `@import`
- icon/font kits and web fonts
- `window.*` globals such as library globals
- animation/physics/rendering tools (e.g., GSAP, Three.js, Matter.js)
- UI frameworks and helper libraries
- asset URLs, data URLs, and relative paths
- event handlers or CodePen-specific assumptions

A dependency may only be present in CodePen Settings and absent from panel source. Ask for those settings if a missing behavior suggests external resources.

## Behavior map

For each interaction, capture trigger, state change, visible result, error/empty behavior, and cleanup requirement. Include keyboard interaction and reduced-motion considerations when applicable.
