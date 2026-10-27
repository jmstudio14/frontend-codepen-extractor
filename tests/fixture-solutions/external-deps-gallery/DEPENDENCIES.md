# External dependencies

| Dependency | Source | Risk | Action |
| --- | --- | --- | --- |
| lodash (`_.shuffle`, `_.capitalize`) | `cdn.jsdelivr.net/npm/lodash` with no version or integrity hash | The latest version could change or be compromised; the page breaks offline | Replaced with native array and string code; script tag removed |
| Inter web font | `fonts.googleapis.com` | Third-party request on every load; no fallback family | Removed the remote stylesheet; `Inter, system-ui, sans-serif` uses Inter only when installed locally |
| Gallery photos | `picsum.photos` (hotlinked) | Third-party availability, licensing and tracking | Replaced with the local `assets/photo-*.svg` placeholders |
