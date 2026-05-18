import { createSignal, For, Show, createResource } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import type { VarEntry } from "../types";

type Props = {
  onClose: () => void;
};

function IconVars() {
  return (
    <svg viewBox="0 0 13 13" class="w-3.5 h-3.5" fill="none">
      <path d="M4.5 2.5C3.5 2.5 3 3 3 4V5.5C3 6.3 2.5 6.5 2 6.5C2.5 6.5 3 6.7 3 7.5V9C3 10 3.5 10.5 4.5 10.5"
        stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M8.5 2.5C9.5 2.5 10 3 10 4V5.5C10 6.3 10.5 6.5 11 6.5C10.5 6.5 10 6.7 10 7.5V9C10 10 9.5 10.5 8.5 10.5"
        stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export default function VarsPanel(props: Props) {
  const [vars, { refetch }] = createResource<VarEntry[]>(
    () => invoke<VarEntry[]>("list_vars"),
    { initialValue: [] }
  );

  const [expandedId, setExpandedId] = createSignal<string | null>(null);
  const [editData, setEditData] = createSignal<{ name: string; value: string } | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [adding, setAdding] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [newValue, setNewValue] = createSignal("");

  const expand = (entry: VarEntry) => {
    if (expandedId() === entry.id) {
      setExpandedId(null);
      setEditData(null);
      return;
    }
    setEditData({ name: entry.name, value: entry.value });
    setExpandedId(entry.id);
  };

  const saveEdit = async (id: string) => {
    const data = editData();
    if (!data) return;
    setSaving(true);
    try {
      await invoke("set_var", { id, name: data.name.trim(), value: data.value });
      await refetch();
      setExpandedId(null);
      setEditData(null);
    } finally {
      setSaving(false);
    }
  };

  const deleteVar = async (id: string) => {
    await invoke("delete_var", { id });
    await refetch();
    if (expandedId() === id) {
      setExpandedId(null);
      setEditData(null);
    }
  };

  const addVar = async () => {
    const n = newName().trim();
    const v = newValue().trim();
    if (!n || !v) return;
    setSaving(true);
    try {
      await invoke("set_var", { id: null, name: n, value: v });
      await refetch();
      setAdding(false);
      setNewName("");
      setNewValue("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={props.onClose} />
      <div class="relative w-full max-w-md mx-4 rounded-2xl bg-surface-1 border border-edge shadow-[0_24px_64px_-12px_rgba(0,0,0,0.8)] overflow-hidden">
        <div class="flex items-center justify-between px-4 h-12 border-b border-edge">
          <div class="flex items-center gap-2 text-ink-faint">
            <IconVars />
            <span class="text-xs font-mono font-semibold text-ink">Variables</span>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            class="w-6 h-6 flex items-center justify-center rounded text-ink-faint hover:text-ink hover:bg-white/5 transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 12 12" class="w-3 h-3" fill="none">
              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <div class="p-2 max-h-[60vh] overflow-y-auto space-y-1">
          <Show when={vars()?.length === 0 && !adding()}>
            <p class="text-xs text-ink-faint font-mono text-center py-6">
              No variables yet. Reference them with <span class="text-accent">{"{{NAME}}"}</span> in headers or params.
            </p>
          </Show>

          <For each={vars()}>
            {(entry) => (
              <div class="rounded-xl border border-edge overflow-hidden">
                <div class="flex items-center gap-0.5 pr-1">
                  <button
                    type="button"
                    onClick={() => expand(entry)}
                    class="flex-1 flex items-center gap-2 px-3 h-9 hover:bg-white/3 transition-colors cursor-pointer text-left min-w-0"
                  >
                    <span class="flex-1 text-xs font-mono text-ink truncate">{entry.name}</span>
                    <span class="text-[10px] font-mono text-ink-faint truncate max-w-32">{entry.value}</span>
                    <svg
                      viewBox="0 0 12 12"
                      class="w-2.5 h-2.5 text-ink-faint transition-transform duration-150 shrink-0"
                      classList={{ "rotate-90": expandedId() === entry.id }}
                      fill="none"
                    >
                      <path d="M4 2.5L8 6L4 9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </button>
                </div>

                <Show when={expandedId() === entry.id && editData()}>
                  {(data) => (
                    <div class="px-3 pb-3 pt-1 space-y-2 border-t border-edge bg-white/2">
                      <div class="space-y-1.5">
                        <label class="text-[10px] font-mono text-ink-faint uppercase tracking-wider">Name</label>
                        <input
                          value={data().name}
                          onInput={e => setEditData(d => d ? { ...d, name: e.currentTarget.value } : null)}
                          class="w-full bg-surface-2 rounded-lg px-2.5 h-8 text-xs font-mono text-ink outline-none border border-edge focus:border-edge-bright transition-colors"
                        />
                      </div>
                      <div class="space-y-1.5">
                        <label class="text-[10px] font-mono text-ink-faint uppercase tracking-wider">Value</label>
                        <input
                          value={data().value}
                          onInput={e => setEditData(d => d ? { ...d, value: e.currentTarget.value } : null)}
                          onKeyDown={e => { if (e.key === "Enter") saveEdit(entry.id); }}
                          class="w-full bg-surface-2 rounded-lg px-2.5 h-8 text-xs font-mono text-ink outline-none border border-edge focus:border-edge-bright transition-colors placeholder:text-ink-faint"
                        />
                      </div>
                      <div class="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => saveEdit(entry.id)}
                          disabled={saving() || !data().name.trim()}
                          class="flex-1 h-7 rounded-lg bg-white/5 hover:bg-white/8 text-xs font-mono text-ink transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {saving() ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteVar(entry.id)}
                          class="h-7 px-3 rounded-lg text-xs font-mono text-verb-delete hover:bg-verb-delete/10 transition-colors cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </Show>
              </div>
            )}
          </For>

          <Show when={adding()}>
            <div class="rounded-xl border border-edge p-3 space-y-2 bg-white/2">
              <div class="space-y-1.5">
                <label class="text-[10px] font-mono text-ink-faint uppercase tracking-wider">Name</label>
                <input
                  autofocus
                  placeholder="VAR_ZIP_CC"
                  value={newName()}
                  onInput={e => setNewName(e.currentTarget.value)}
                  class="w-full bg-surface-2 rounded-lg px-2.5 h-8 text-xs font-mono text-ink outline-none border border-edge focus:border-edge-bright transition-colors placeholder:text-ink-faint"
                />
              </div>
              <div class="space-y-1.5">
                <label class="text-[10px] font-mono text-ink-faint uppercase tracking-wider">Value</label>
                <input
                  placeholder="94040,US"
                  value={newValue()}
                  onInput={e => setNewValue(e.currentTarget.value)}
                  onKeyDown={e => { if (e.key === "Enter") addVar(); }}
                  class="w-full bg-surface-2 rounded-lg px-2.5 h-8 text-xs font-mono text-ink outline-none border border-edge focus:border-edge-bright transition-colors placeholder:text-ink-faint"
                />
              </div>
              <div class="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={addVar}
                  disabled={saving() || !newName().trim() || !newValue().trim()}
                  class="flex-1 h-7 rounded-lg bg-white/5 hover:bg-white/8 text-xs font-mono text-ink transition-colors cursor-pointer disabled:opacity-40"
                >
                  {saving() ? "Adding…" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setNewName(""); setNewValue(""); }}
                  class="h-7 px-3 rounded-lg text-xs font-mono text-ink-faint hover:text-ink hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Show>
        </div>

        <div class="px-2 pb-2">
          <button
            type="button"
            onClick={() => { setAdding(true); setExpandedId(null); setEditData(null); }}
            class="w-full h-8 rounded-xl text-xs font-mono text-ink-faint hover:text-ink hover:bg-white/5 transition-colors cursor-pointer border border-dashed border-edge hover:border-edge-bright"
          >
            + Add variable
          </button>
        </div>
      </div>
    </div>
  );
}
