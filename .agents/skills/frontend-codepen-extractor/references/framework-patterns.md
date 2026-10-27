# Framework-specific conversion patterns

Use only the section that matches the target project. These patterns are decision guides, not reasons to rewrite the app.

## First: identify the target

1. Inspect the app/package `package.json`, lockfile, entry files, and nearby components.
2. Confirm actual framework/version and whether the target is client-rendered, server-rendered, or static.
3. Reuse established local conventions and libraries before selecting new ones.
4. If the framework is uncertain or no app exists, describe the assumption before creating framework-specific files.

## React

- Prefer function components and explicit props; use the project's TypeScript/JS convention.
- Use state for values that drive rendering. Use effects only for external synchronization, not as a substitute for ordinary derived values.
- Effects must clean up listeners, observers, timers, subscriptions, and animation frames.
- Use stable callbacks/refs only when justified; avoid unnecessary memoization.
- Never read/write browser globals during render in ways that break SSR.
- Keep IDs unique for labels and ARIA relationships; use the project's established ID pattern.
- Extract CSS into the existing styling convention (CSS Module, Tailwind, etc.). Avoid global selectors.

## Vue 3

- Follow nearby Composition API or Options API conventions rather than mixing styles arbitrarily.
- Use `onMounted` / `onBeforeUnmount` or `onUnmounted` for external side effects and remove listeners/clear timers in cleanup.
- Prefer refs/computed values for rendered state; avoid direct DOM updates unless interacting with an imperative library.
- For imperative libraries, initialize after mount and destroy/dispose on unmount.
- Respect `<style scoped>` conventions, while remembering that scoped styles do not automatically scope every global selector or third-party overlay.
- Type props/emits when using TypeScript and the project's established SFC style.

## Svelte

- Match the Svelte version and its reactivity syntax from the project; do not mix Svelte 4 and Svelte 5 patterns blindly.
- Use component lifecycle and cleanup semantics supported by the installed version.
- Prefer reactive state over querying and mutating the DOM directly.
- Scope component styles and be careful with intentionally global selectors or third-party overlays.
- Clean up browser listeners, intervals, subscriptions, and animation loops when the component is destroyed.

## Vanilla TypeScript / JavaScript

- Encapsulate markup, styles, and behavior behind an ES module and a unique root element.
- Export an initializer or component API with explicit configuration/types.
- Return a `dispose()` function or use an explicit lifecycle class to remove all listeners and cancel asynchronous work.
- Use `AbortController` for related DOM listeners when compatible, or retain exact listener references for `removeEventListener`.
- Avoid global mutable variables; support multiple instances if the app can mount more than one component.
- Do not rely on `innerHTML` for untrusted data. Use safe DOM APIs and text nodes.

## Other frameworks (Angular, Solid, Lit, etc.)

- Check installed versions and existing patterns before choosing APIs.
- Use the framework's native input/state/lifecycle primitives.
- Ensure teardown for subscriptions, resources, and animation loops.
- Use the repo's template/style conventions; do not impose React/Vue patterns on another framework.

## Animation / canvas / WebGL

- Check reduced-motion preferences for nonessential effects.
- Stop `requestAnimationFrame` loops on teardown, cancel timers, and dispose of graphics/context resources as required by the library.
- Avoid rebuilding heavyweight scenes on every render. Keep resource ownership explicit.
- Provide a fallback or static state when animation or WebGL is unavailable if the UI depends on it.
- Handle resize observers/listeners with cleanup and avoid repeated allocations on every frame.

## CSS strategy by styling system

- **Tailwind:** use installed version's syntax and design tokens; avoid adding arbitrary utility sprawl or new plugins without approval.
- **CSS Modules:** move styles to the module, scope component selectors, and preserve meaningful class relationships.
- **Vue/Svelte scoped CSS:** use existing component-local styles; audit `:global`, portal/teleport content, and library-generated DOM.
- **CSS-in-JS:** use the installed library/version and existing theme/provider conventions.
- **Plain CSS:** namespace selectors under a unique component root; do not include resets that affect the host application.

## Conversion decision record

For nontrivial conversions, note:
- Why this component model was selected
- How state and lifecycle are managed
- How styles are scoped
- How assets/dependencies are supplied
- What behavior intentionally differs from the prototype
