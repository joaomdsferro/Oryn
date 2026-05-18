# Oryn Test Suite

Two layers:

1. **Automated** — fast, hermetic checks that confirm core wiring is intact.
2. **Manual** — U  walkthrough for behavior that can only be judged by eye (subjective to the tester, of course 🙂).

Run automated first. If those pass, do a manual pass relevant to whatever you changed.

---

## 1. Automated

### Rust

```bash
cd src-tauri
cargo test
```

Covers:

| File | What it checks |
|------|----------------|
| `src/lib.rs` (unit) | `build_url`, `resolve_placeholders` — pure helpers. |
| `tests/http.rs` (integration) | `perform_request` end-to-end against a local `wiremock` server. GET with query params, POST with JSON body, header propagation, GraphQL-shaped payload, form-urlencoded body, unknown-method error, empty-body handling. |

No network, no Tauri runtime, no on-disk state. If `cargo test` is green, the HTTP send pipeline is intact.

### TypeScript

```bash
pnpm tsc --noEmit
```

Type-check only — no runtime test suite yet. (Vitest skipped; revisit once frontend logic is large enough to be worth e tracting.)

### What's intentionally NOT automated

- Tauri command wiring (would need a Tauri test harness).
- Secrets encryption / on-disk persistence (filesystem-coupled; better as manual).
- Projects / collections / environments CRUD (UI-driven; better as manual).
- CodeMirror behavior (covered manually below).

---

## 2. Manual

Run `pnpm tauri dev`, then walk the sections relevant to your change. Tick each.

### REST — happy path
- [ ] GET `https://httpbin.org/get?foo=bar` → 200, JSON body shows `args: { foo: "bar" }`.
- [ ] POST `https://httpbin.org/post` with no body → 200, `data` empty, `json` null.
- [ ] PATCH / PUT / DELETE all dispatch with the correct verb (check `httpbin` echo).
- [ ] Method dropdown opens, all five methods selectable, color matches.

### REST — body modes
- [ ] **None**: no body sent (`data` empty in httpbin echo).
- [ ] **JSON**: paste `{"hello":"world"}` → httpbin echoes `json: {hello: "world"}`, `Content-Type: application/json` present in `headers`.
- [ ] **Te t**: paste `plain te t` → `data: "plain te t"`, `Content-Type: te t/plain`.
- [ ] **Form**: add `user=alice`, `pass=hunter2` rows → `form: {user, pass}`, `Content-Type: application/ -www-form-urlencoded`.
- [ ] User-set `Content-Type` in Headers overrides the auto-applied one.

### GraphQL
- [ ] Switching protocol to GraphQL hides the method dropdown.
- [ ] Query `{ countries { name code } }` against `https://countries.trevorblades.com/` → 200, data array.
- [ ] Variables `{"code":"PT"}` with `query GetCountry($code: ID!) { country(code: $code) { name } }` → returns Portugal.
- [ ] Malformed JSON in Variables → request still sends (variables coerced to `{}`), no crash.

### Auth
    _Back to REST_
- [ ] **Bearer**: token "abc" against `httpbin.org/bearer` → 200.
- [ ] **Basic**: user/pass against `httpbin.org/basic-auth/user/pass` → 200; wrong creds → 401.
- [ ] **API Key (header)**: GET `httpbin.org/anything`, Auth → API Key → Add to: Header → response `headers` echoes your key.
- [ ] **API Key (query)**: same endpoint, Add to: Query → response `args` echoes your key (and `url` shows `?key=…`).
- [ ] **`Authorization` override**: GET `httpbin.org/anything`, add header `Authorization: shouldnotwin`, then Auth → Bearer with a different token → response `headers.Authorization` is `Bearer <token>`, not `shouldnotwin`.

### Variables / Secrets

_Setup: open the Secrets panel (left sidebar) and add a secret `TOKEN=abc123`. Open the Vars panel and add `HOST=httpbin.org`. Keep `httpbin.org/anything` handy — it echoes whatever you send back as JSON, which makes resolution easy to verify._

- [ ] **Resolution at send time** — URL `https://{{HOST}}/anything?t={{TOKEN}}`, header ` -Tok: {{TOKEN}}`, JSON body `{"t":"{{TOKEN}}"}`. Send → response `url` shows `httpbin.org`, `args.t` = `abc123`, `headers. -Tok` = `abc123`, `json.t` = `abc123`. The literal `{{...}}` should never appear in the echo.
- [ ] **Reference picker (params/headers rows)** — focus a value cell, click the small `{}` button on the right (tooltip "Insert secret or variable reference"). A popover lists known secrets and vars. Clicking `TOKEN` replaces the cell value with e actly `{{TOKEN}}` and the te t turns green (secret-ok = `te t-verb-get`); clicking `HOST` does the same and stays default-colored (var-ok). The picker only matches a value that is _entirely_ `{{NAME}}` (rege  `^\{\{(\w+)\}\}$`) — embedded refs like `https://{{HOST}}/ ` are still resolved at send time but won't get the colored chip styling.
- [ ] **Unknown ref** — type `{{NOPE}}` into a header value. The te t turns amber (`te t-amber-400`). Send the request → httpbin echoes the literal string `{{NOPE}}` (unknown placeholders are left intact, see `resolve_placeholders` in `src-tauri/src/lib.rs`).
- [ ] **Raw-secret warning** — in a header row, set key `Authorization` and paste a value ≥ 20 chars with no whitespace (e.g. `sk_live_abcdefghijklmnopqrstuvw yz`). The value te t turns amber-300 and the `{}` button's tooltip changes to "Looks like a raw secret — store it in Secrets instead". Trigger condition: value length ≥ 20, no whitespace, and key matches `/key|token|secret|auth|password|bearer|api/i`. Changing the key to e.g. ` -Custom` should clear the warning; shortening the value below 20 chars should also clear it.
- [ ] **Esc closes picker, doesn't minimize** — open the reference picker, press Esc → picker closes, window stays. Then with no picker open, press Esc → confirm it doesn't minimize/close the window une pectedly. Repeat with the Secrets and Vars modal panels (same e pectation: Esc closes the modal first).

### CodeMirror body editor
- [ ] Line numbers clearly visible.
- [ ] JSON mode synta -highlights keys/strings/numbers.
- [ ] Tab inserts indentation (not focus jump).
- [ ] Bracket matching works.
- [ ] Long lines wrap.
- [ ] Loading a saved request repopulates the editor.

### Persistence
- [ ] Save a request → appears in sidebar under its collection.
- [ ] Reload → same body, headers, protocol, body_mode restored.
- [ ] Reopening the app preserves all of the above.

### Projects / Collections / Environments
- [ ] Create project, create collection inside it, save a request to that collection.
- [ ] Switch active project → sidebar updates.
- [ ] Create environment, add variable `HOST=httpbin.org`, use `https://{{HOST}}/get` → resolves at send time.
- [ ] Rename / delete project, collection, environment — UI updates, no orphan data.

### Import
- [ ] Import a Postman v2.1 collection → requests appear, vars/secrets land in their stores.
- [ ] Collection-level auth gets applied per request.
- [ ] `{{REF}}` values that match a stored var/secret resolve; unresolved refs stay as `{{REF}}`.

### Protocol selector
- [ ] REST and GraphQL clickable; gRPC and SOAP show "soon" and are disabled.

### Window / chrome
- [ ] Drag region works, doesn't intercept clicks on buttons.
- [ ] Sidebar resize is smooth, persists width across reloads.
- [ ] Zoom shortcuts (`Ctrl +/-/0`) work; default zoom is 1.0.
- [ ] Esc closes Secrets / Vars / Import / Save modals before minimizing.

### Response panel
- [ ] Body / Headers toggle works.
- [ ] Copy button copies the body.
- [ ] Historical (loaded) response is visually distinguished from a fresh one.
- [ ] Hit Send, then click Cancel mid-flight (use a slow endpoint like `httpbin.org/delay/10`) — response cleared, no error spam.

### Request Bar
- [ ] URL input accepts te t, pastes, focuses on click.
- [ ] Send button (enter) triggers the request, shows loading state.
- [ ] Typing and then pressing "Ctrl + z" undoes edits.

---

## Adding tests

- **Automated, pure logic** → `#[cfg(test)] mod tests` in the relevant Rust file.
- **Automated, HTTP** → new test in `src-tauri/tests/http.rs` using `wiremock`. Keep it self-contained (one server per test).
- **Manual** → add a checkbo  under the most fitting heading above. Keep entries one line, action-first ("Save a request → ...").
