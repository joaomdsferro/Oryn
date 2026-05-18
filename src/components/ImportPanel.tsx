import { createSignal, createMemo, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import type { ActiveContext, ImportResult } from "../types";

// Same heuristic as the Rust import.rs `is_secret_name`.
function isSecretName(name: string): boolean {
  const l = name.toLowerCase();
  return /key|token|secret|password|pass|auth|bearer|credential|private/.test(l);
}

function countItems(items: unknown): number {
  if (!Array.isArray(items)) return 0;
  let n = 0;
  for (const it of items) {
    if (it && typeof it === "object") {
      const obj = it as { item?: unknown; request?: unknown };
      if (Array.isArray(obj.item)) n += countItems(obj.item);
      else if (obj.request) n += 1;
    }
  }
  return n;
}

type Preview = { requests: number; vars: number; secrets: number; collectionName?: string };

function buildPreview(raw: string): { ok: true; preview: Preview } | { ok: false; error: string | null } {
  if (!raw.trim()) return { ok: false, error: null };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch (e) { return { ok: false, error: `Invalid JSON: ${(e as Error).message}` }; }
  if (!parsed || typeof parsed !== "object") return { ok: false, error: "Not a Postman collection" };
  const root = parsed as Record<string, unknown>;

  const info = (root.info ?? {}) as { name?: string };
  const collectionName = typeof info.name === "string" ? info.name : undefined;

  const requests = countItems(root.item);

  const seen = new Set<string>();
  let vars = 0;
  let secrets = 0;
  const consider = (entry: unknown) => {
    if (!entry || typeof entry !== "object") return;
    const v = entry as { key?: string; type?: string; enabled?: boolean };
    if (v.enabled === false) return;
    const name = (v.key ?? "").trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    if (v.type === "secret" || isSecretName(name)) secrets += 1;
    else vars += 1;
  };
  if (Array.isArray(root.variable)) for (const v of root.variable) consider(v);
  if (Array.isArray(root.values))   for (const v of root.values)   consider(v);

  return { ok: true, preview: { requests, vars, secrets, collectionName } };
}

type Props = {
  activeContext: ActiveContext;
  onClose: () => void;
  onImported: (result: ImportResult) => void;
};

export default function ImportPanel(props: Props) {
  const [json, setJson] = createSignal("");
  const [collectionName, setCollectionName] = createSignal("");
  const [projectMode, setProjectMode] = createSignal<"active" | "new">("active");
  const [newProjectName, setNewProjectName] = createSignal("");
  const [importing, setImporting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [result, setResult] = createSignal<ImportResult | null>(null);
  const preview = createMemo(() => buildPreview(json()));

  const runImport = async () => {
    const raw = json().trim();
    if (!raw) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const project_id =
        projectMode() === "active" && props.activeContext.project_id
          ? props.activeContext.project_id
          : null;
      const project_name =
        projectMode() === "new" ? newProjectName().trim() || "Imported" : null;

      const res = await invoke<ImportResult>("import_collection", {
        json: raw,
        project_id,
        project_name,
        collection_name: collectionName().trim() || null,
      });
      setResult(res);
      props.onImported(res);
      props.onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  };

  const pickFile = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setJson(await file.text());
    };
    input.click();
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={props.onClose} />
      <div class="relative w-full max-w-lg mx-4 rounded-2xl bg-surface-1 border border-edge shadow-[0_24px_64px_-12px_rgba(0,0,0,0.8)] p-4 space-y-3 max-h-[85vh] overflow-y-auto">
        <p class="text-xs font-mono font-semibold text-ink">Import Postman collection</p>

        <div class="space-y-2">
          <label class="text-[10px] font-mono text-ink-faint uppercase">Target project</label>
          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => setProjectMode("active")}
              disabled={!props.activeContext.project_id}
              class="flex-1 h-7 rounded text-[10px] font-mono cursor-pointer disabled:opacity-40"
              classList={{
                "bg-surface-2 text-ink": projectMode() === "active",
                "text-ink-faint": projectMode() !== "active",
              }}
            >
              {props.activeContext.project_name ?? "Active"}
            </button>
            <button
              type="button"
              onClick={() => setProjectMode("new")}
              class="flex-1 h-7 rounded text-[10px] font-mono cursor-pointer"
              classList={{
                "bg-surface-2 text-ink": projectMode() === "new",
                "text-ink-faint": projectMode() !== "new",
              }}
            >
              New project
            </button>
          </div>
          <Show when={projectMode() === "new"}>
            <input
              placeholder="Project name"
              value={newProjectName()}
              onInput={e => setNewProjectName(e.currentTarget.value)}
              class="w-full bg-surface-2 rounded-lg px-3 h-8 text-xs font-mono border border-edge"
            />
          </Show>
        </div>

        <input
          placeholder="Collection name (optional)"
          value={collectionName()}
          onInput={e => setCollectionName(e.currentTarget.value)}
          class="w-full bg-surface-2 rounded-lg px-3 h-8 text-xs font-mono border border-edge"
        />

        <textarea
          placeholder="Paste Postman collection or environment JSON…"
          value={json()}
          onInput={e => setJson(e.currentTarget.value)}
          class="w-full h-32 bg-surface-2 rounded-lg px-3 py-2 text-xs font-mono border border-edge resize-y"
        />

        <button type="button" onClick={pickFile} class="text-[11px] font-mono text-ink-faint hover:text-ink cursor-pointer">
          Choose file…
        </button>

        <Show when={error()}>
          <p class="text-[11px] font-mono text-verb-delete">{error()}</p>
        </Show>

        <Show when={result()}>
          {(r) => (
            <p class="text-[11px] font-mono text-ink-faint">
              Imported {r().requests} requests, {r().vars} variables, {r().secrets} secrets.
            </p>
          )}
        </Show>

        {(() => {
          const p = preview();
          if (!p.ok) {
            return (
              <Show when={p.error}>
                <p class="text-[11px] font-mono text-amber-400">{p.error}</p>
              </Show>
            );
          }
          const { requests, vars, secrets, collectionName } = p.preview;
          return (
            <div class="rounded-lg border border-edge bg-surface-2/60 p-2.5 space-y-1">
              <p class="text-[10px] font-mono text-ink-faint uppercase tracking-widest">Preview</p>
              <Show when={collectionName}>
                <p class="text-[11px] font-mono text-ink truncate">
                  Collection: <span class="text-accent">{collectionName}</span>
                </p>
              </Show>
              <p class="text-[11px] font-mono text-ink-mute">
                <span class="text-verb-get">{requests}</span> request{requests === 1 ? "" : "s"},{" "}
                <span class="text-accent">{vars}</span> variable{vars === 1 ? "" : "s"},{" "}
                <span class="text-verb-get">{secrets}</span> secret{secrets === 1 ? "" : "s"}
              </p>
            </div>
          );
        })()}

        <div class="flex gap-2">
          <button
            type="button"
            onClick={runImport}
            disabled={importing() || !json().trim()}
            class="flex-1 h-8 rounded-lg bg-white/5 text-xs font-mono cursor-pointer disabled:opacity-40"
          >
            {importing() ? "Importing…" : "Import"}
          </button>
          <button type="button" onClick={props.onClose} class="h-8 px-3 text-xs font-mono text-ink-faint cursor-pointer">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
