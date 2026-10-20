# Rich-Text Sanitization Contract

## 1. Scope / Trigger

Use this contract whenever rich text is imported, federated, merged, migrated,
saved to PocketBase, or rendered with Svelte `{@html}` / DOM `innerHTML`.
Sanitization is a cross-layer invariant: backend persistence is the source of
truth, while frontend sanitization protects unsaved previews and historical or
cached content.

## 2. Signatures

Backend owner: `db/util/sanitize.go`.

```go
func SanitizedHTMLChanges(record *core.Record) map[string]string
func SanitizeHTMLFieldsWithLimits(record *core.Record)
func SanitizeHTML() func(e *core.RecordEvent) error
func SanitizeHTMLText(value string) string
func SanitizeHTMLTextWithLimit(value string, maxRunes int) string
func SanitizeHTMLTextForCollectionWithLimit(collection, value string, maxRunes int) string
```

Frontend owner: `web/src/lib/util/sanitize_html.ts`.

```ts
function sanitizeHTML(value: unknown): string;
function sanitizeWaypointHTML(value: unknown): string;
```

Historical cleanup owner:
`db/migrations/1791110000_sanitize_stored_html.go`.

## 3. Contracts

- Backend sanitization covers the rich-text fields registered in `htmlFields`
  and runs before PocketBase field validation on every model save.
- Ordinary writes are sanitized without truncation and then validated. Imports,
  derived values, and historical cleanup may use an explicit field limit.
- Images are forbidden by default. Only `waypoints.description` may retain an
  `<img>`, and only when `src` matches
  `https://down-files.2bulu.com/f/<allow-listed path/query>`.
- An accepted waypoint image may retain only `src` and `alt`. Do not allow
  `srcset`, `sizes`, `style`, `background`, event handlers, or other attributes.
- Block alternate remote-media request paths: `picture`, `source`, `video`,
  `audio`, `track`, `iframe`, `object`, and `embed`, including `poster` and
  legacy `background` attributes.
- Frontend code must use `sanitizeWaypointHTML` only for waypoint descriptions.
  Every other `{@html}` / `innerHTML` rich-text sink uses `sanitizeHTML`.
- Sanitize Markdown output after Markdown conversion and immediately before
  rendering; never assume stored, cached, federated, or provider HTML is safe.
- The historical backfill must select the policy by collection. It bypasses
  record-save hooks, preserves unrelated fields and timestamps, runs in
  batches, and is idempotent.

## 4. Validation & Error Matrix

| Input / boundary | Required result |
|---|---|
| Non-string frontend value | Empty string |
| Generic rich text containing any image | Remove the image |
| Waypoint image from the exact HTTPS Two Steps host/path | Keep `<img src alt>` only |
| Waypoint image using HTTP, another host, `data:`, or `javascript:` | Remove the image |
| Trusted `src` plus off-domain `srcset` / `poster` / `background` | Remove every alternate request path |
| Script, style, form control, SVG/MathML, event handler, unsafe URL | Remove unsafe markup or attribute |
| Ordinary sanitized value exceeds the PocketBase field limit | Let validation fail; do not silently shorten |
| Explicitly bounded import/backfill exceeds the limit | Emit complete safe serialization within the limit |
| Historical backfill runs twice | Second run makes no changes and emits no record-update side effects |

## 5. Good / Base / Bad Cases

- Good: a waypoint description keeps a Two Steps image from
  `https://down-files.2bulu.com/f/...` with safe alt text.
- Base: formatted text and safe links survive for all supported rich-text
  collections, with no images.
- Bad: a trusted `src` is paired with an off-domain `srcset`, or generic profile
  HTML renders an `<img>`; both must be removed before display and persistence.

## 6. Tests Required

- `db/util/sanitize_test.go`: safe formatting, parser edge cases, idempotence,
  collection-aware waypoint image allow-list, and rejection in other collections.
- `db/migrations/sanitize_stored_html_test.go`: batching, field limits,
  collection-aware historical image preservation, silent updates, and idempotence.
- `web/src/lib/util/sanitize_html.test.ts`: SSR/browser sanitizer behavior,
  non-string input, foreign namespaces, controls/styles, waypoint-only images,
  and every alternate media-loading attribute/tag.
- For each new `{@html}` or `innerHTML` sink, assert that it calls the appropriate
  shared sanitizer rather than adding a local policy.

## 7. Wrong vs Correct

### Wrong

```svelte
<div>{@html waypoint.description}</div>
```

```ts
// Checking src alone still permits an off-domain request through srcset.
if (img.src.startsWith("https://down-files.2bulu.com/f/")) return html;
```

### Correct

```svelte
<div>{@html sanitizeWaypointHTML(waypoint.description)}</div>
```

```ts
// Keep the policy centralized; it removes untrusted images and all attributes
// except the allow-listed src and alt.
const safe = sanitizeWaypointHTML(description);
```
