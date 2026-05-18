import { createSignal, For, Show, createResource, type Accessor } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import type { ActiveContext, SecretMeta, SecretFull } from "../types";

type Props = {
  onClose: () => void;
  activeContext: ActiveContext;
};

type SecretScope = "global" | "project";

type ValueMode = "hidden" | "peek" | "full";

function peekCount(len: number) {
  return Math.max(2, Math.min(5, Math.floor(len / 10)));
}

function IconPeek() {
  return (
    <svg viewBox="0 0 12 12" class="w-3 h-3" fill="none">
      <circle cx="5" cy="5" r="3" stroke="currentColor" stroke-width="1.3" />
      <path d="M7.5 7.5L10.5 10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
    </svg>
  );
}

function IconRevealHidden() {
  return (
    <svg viewBox="0 0 12 12" class="w-3 h-3" fill="none">
      <path d="M1 6C1 6 3 3 6 3C9 3 11 6 11 6C11 6 9 9 6 9C3 9 1 6 1 6Z" stroke="currentColor" stroke-width="1.3" />
      <circle cx="6" cy="6" r="1.5" stroke="currentColor" stroke-width="1.3" />
    </svg>
  );
}

function IconRevealVisible() {
  return (
    <svg viewBox="0 0 12 12" class="w-3 h-3" fill="none">
      <path d="M1 1L11 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      <path d="M5 3.1C5.3 3 5.6 3 6 3C9 3 11 6 11 6C10.6 6.7 9.9 7.5 9 8.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      <path d="M3 4.3C2 5 1 6 1 6C1 6 3 9 6 9C6.8 9 7.5 8.8 8 8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
    </svg>
  );
}

function SecretValueField(props: {
  value: Accessor<string>;
  onInput: (value: string) => void;
  mode: Accessor<ValueMode>;
  setMode: (mode: ValueMode) => void;
  placeholder?: string;
  onEnter?: () => void;
}) {
  const revealed = () => props.mode() === "full";
  const peeking = () => props.mode() === "peek";
  return (
    <div class="space-y-1">
      <div class="flex items-center gap-1.5">
        <div class="relative flex-1 min-w-0 flex items-center h-8 bg-surface-2 rounded-lg border border-edge focus-within:border-edge-bright transition-colors px-2.5">
          <input
            type={revealed() ? "text" : "password"}
            placeholder={props.placeholder}
            value={props.value()}
            onInput={e => props.onInput(e.currentTarget.value)}
            onKeyDown={e => { if (e.key === "Enter") props.onEnter?.(); }}
            class="w-full bg-transparent text-xs font-mono text-ink outline-none placeholder:text-ink-faint"
          />
        </div>

        <button
          type="button"
          title="Peek"
          onClick={() => props.setMode(peeking() ? "hidden" : "peek")}
          class="w-7 h-7 flex items-center justify-center rounded transition-colors cursor-pointer shrink-0"
          classList={{
            "text-accent bg-accent/10": peeking(),
            "text-ink-faint hover:text-ink hover:bg-white/5": !peeking(),
          }}
        >
          <IconPeek />
        </button>

        <button
          type="button"
          title={revealed() ? "Hide" : "Reveal"}
          onClick={() => props.setMode(revealed() ? "hidden" : "full")}
          class="w-7 h-7 flex items-center justify-center rounded transition-colors cursor-pointer shrink-0"
          classList={{
            "text-accent bg-accent/10": revealed(),
            "text-ink-faint hover:text-ink hover:bg-white/5": !revealed(),
          }}
        >
          <Show when={revealed()} fallback={<IconRevealHidden />}>
            <IconRevealVisible />
          </Show>
        </button>
      </div>

      <Show when={peeking() && props.value()}>
        <div class="px-2.5 text-[10px] font-mono select-none truncate">
          <span class="text-ink-faint">preview </span>
          <span class="text-ink">{props.value().slice(0, peekCount(props.value().length))}</span>
          <span class="text-ink-faint tracking-widest">
            {"•".repeat(Math.max(0, props.value().length - peekCount(props.value().length)))}
          </span>
        </div>
      </Show>
    </div>
  );
}

export default function SecretsPanel(props: Props) {
  const [scope, setScope] = createSignal<SecretScope>("global");

  const [secrets, { refetch }] = createResource(
    () => ({ scope: scope(), projectId: props.activeContext.project_id }),
    async ({ scope: s, projectId }) => {
      if (s === "project" && projectId) {
        return invoke<SecretMeta[]>("list_secrets", { project_id: projectId });
      }
      return invoke<SecretMeta[]>("list_secrets", { project_id: null });
    },
    { initialValue: [] as SecretMeta[] },
  );

  const addScopeProjectId = () =>
    scope() === "project" ? props.activeContext.project_id ?? null : null;

  const [expandedId, setExpandedId] = createSignal<string | null>(null);
  const [editProjectId, setEditProjectId] = createSignal<string | null>(null);
  const [editData, setEditData] = createSignal<{ name: string; value: string } | null>(null);
  const [editValueMode, setEditValueMode] = createSignal<ValueMode>("hidden");
  const [saving, setSaving] = createSignal(false);
  const [adding, setAdding] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [newValue, setNewValue] = createSignal("");
  const [newValueMode, setNewValueMode] = createSignal<ValueMode>("hidden");
  const [rowPeekId, setRowPeekId] = createSignal<string | null>(null);
  const [rowPeekValue, setRowPeekValue] = createSignal<string | null>(null);

  const expand = async (id: string) => {
    setRowPeekId(null);
    setRowPeekValue(null);
    if (expandedId() === id) {
      setExpandedId(null);
      setEditData(null);
      setEditValueMode("hidden");
      return;
    }
    const full = await invoke<SecretFull>("get_secret", { id });
    setEditData({ name: full.name, value: full.value });
    setEditProjectId(full.project_id ?? null);
    setExpandedId(id);
    setEditValueMode("hidden");
  };

  const toggleRowPeek = async (e: MouseEvent, id: string) => {
    e.stopPropagation();
    if (rowPeekId() === id) {
      setRowPeekId(null);
      setRowPeekValue(null);
      return;
    }
    const full = await invoke<SecretFull>("get_secret", { id });
    setRowPeekId(id);
    setRowPeekValue(full.value);
  };

  const saveEdit = async (id: string) => {
    const data = editData();
    if (!data) return;
    setSaving(true);
    try {
      await invoke("set_secret", {
        id,
        name: data.name,
        value: data.value,
        project_id: editProjectId(),
      });
      await refetch();
      setExpandedId(null);
      setEditData(null);
      setEditProjectId(null);
      setEditValueMode("hidden");
    } finally {
      setSaving(false);
    }
  };

  const deleteSecret = async (id: string) => {
    await invoke("delete_secret", { id });
    await refetch();
    if (expandedId() === id) {
      setExpandedId(null);
      setEditData(null);
      setEditValueMode("hidden");
    }
    if (rowPeekId() === id) {
      setRowPeekId(null);
      setRowPeekValue(null);
    }
  };

  const addSecret = async () => {
    const n = newName().trim();
    const v = newValue();
    if (!n || !v) return;
    setSaving(true);
    try {
      await invoke("set_secret", {
        id: null,
        name: n,
        value: v,
        project_id: addScopeProjectId(),
      });
      await refetch();
      setAdding(false);
      setNewName("");
      setNewValue("");
      setNewValueMode("hidden");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={props.onClose} />
      <div class="relative w-full max-w-md mx-4 rounded-2xl bg-surface-1 border border-edge shadow-[0_24px_64px_-12px_rgba(0,0,0,0.8)] overflow-hidden">
        <div class="flex items-center justify-between px-4 h-12 border-b border-edge">
          <div class="flex items-center gap-2">
            <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 text-ink-faint" fill="none">
              <circle cx="6" cy="7" r="3.5" stroke="currentColor" stroke-width="1.3" />
              <path d="M9 9.5L14 14.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
              <path d="M6 5.5V8.5M4.5 7H7.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            </svg>
            <span class="text-xs font-mono font-semibold text-ink">Secrets</span>
          </div>
          <div class="flex gap-1 mr-2">
            <button
              type="button"
              onClick={() => setScope("global")}
              class="h-6 px-2 rounded text-[10px] font-mono cursor-pointer transition-colors"
              classList={{
                "bg-surface-2 text-ink": scope() === "global",
                "text-ink-faint hover:text-ink": scope() !== "global",
              }}
            >
              Global
            </button>
            <button
              type="button"
              onClick={() => setScope("project")}
              disabled={!props.activeContext.project_id}
              class="h-6 px-2 rounded text-[10px] font-mono cursor-pointer transition-colors disabled:opacity-40"
              classList={{
                "bg-surface-2 text-ink": scope() === "project",
                "text-ink-faint hover:text-ink": scope() !== "project",
              }}
            >
              Project
            </button>
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
          <Show when={secrets()?.length === 0 && !adding()}>
            <p class="text-xs text-ink-faint font-mono text-center py-6">
              No secrets yet. Reference them with <span class="text-accent">{"{{NAME}}"}</span> in headers or params.
            </p>
          </Show>

          <For each={secrets()}>
            {(secret) => (
              <div class="rounded-xl border border-edge overflow-hidden">
                <div class="flex items-center gap-0.5 pr-1">
                  <button
                    type="button"
                    onClick={() => expand(secret.id)}
                    class="flex-1 flex items-center gap-2 px-3 h-9 hover:bg-white/3 transition-colors cursor-pointer text-left min-w-0"
                  >
                    <svg viewBox="0 0 12 12" class="w-2.5 h-2.5 text-ink-faint shrink-0" fill="none">
                      <circle cx="5" cy="5" r="2.5" stroke="currentColor" stroke-width="1.2" />
                      <path d="M7 7L10 10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                    </svg>
                    <span class="flex-1 text-xs font-mono text-ink truncate">{secret.name}</span>
                    <Show when={rowPeekId() === secret.id && rowPeekValue()}>
                      <span class="text-[10px] font-mono text-ink-faint truncate max-w-24">
                        {rowPeekValue()!.slice(0, peekCount(rowPeekValue()!.length))}
                        {"•".repeat(Math.max(0, rowPeekValue()!.length - peekCount(rowPeekValue()!.length)))}
                      </span>
                    </Show>
                    <svg
                      viewBox="0 0 12 12"
                      class="w-2.5 h-2.5 text-ink-faint transition-transform duration-150 shrink-0"
                      classList={{ "rotate-90": expandedId() === secret.id }}
                      fill="none"
                    >
                      <path d="M4 2.5L8 6L4 9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title="Peek value"
                    onClick={(e) => toggleRowPeek(e, secret.id)}
                    class="w-7 h-7 flex items-center justify-center rounded transition-colors cursor-pointer shrink-0"
                    classList={{
                      "text-accent bg-accent/10": rowPeekId() === secret.id,
                      "text-ink-faint hover:text-ink hover:bg-white/5": rowPeekId() !== secret.id,
                    }}
                  >
                    <IconPeek />
                  </button>
                </div>

                <Show when={expandedId() === secret.id && editData()}>
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
                        <SecretValueField
                          value={() => data().value}
                          onInput={v => setEditData(d => d ? { ...d, value: v } : null)}
                          mode={editValueMode}
                          setMode={setEditValueMode}
                        />
                      </div>
                      <div class="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => saveEdit(secret.id)}
                          disabled={saving()}
                          class="flex-1 h-7 rounded-lg bg-white/5 hover:bg-white/8 text-xs font-mono text-ink transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {saving() ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSecret(secret.id)}
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
                  placeholder="MY_API_KEY"
                  value={newName()}
                  onInput={e => setNewName(e.currentTarget.value)}
                  class="w-full bg-surface-2 rounded-lg px-2.5 h-8 text-xs font-mono text-ink outline-none border border-edge focus:border-edge-bright transition-colors placeholder:text-ink-faint"
                />
              </div>
              <div class="space-y-1.5">
                <label class="text-[10px] font-mono text-ink-faint uppercase tracking-wider">Value</label>
                <SecretValueField
                  value={newValue}
                  onInput={setNewValue}
                  mode={newValueMode}
                  setMode={setNewValueMode}
                  placeholder="••••••••"
                  onEnter={addSecret}
                />
              </div>
              <div class="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={addSecret}
                  disabled={saving() || !newName().trim() || !newValue()}
                  class="flex-1 h-7 rounded-lg bg-white/5 hover:bg-white/8 text-xs font-mono text-ink transition-colors cursor-pointer disabled:opacity-40"
                >
                  {saving() ? "Adding…" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setNewName(""); setNewValue(""); setNewValueMode("hidden"); }}
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
            onClick={() => { setAdding(true); setExpandedId(null); setEditData(null); setRowPeekId(null); setRowPeekValue(null); }}
            class="w-full h-8 rounded-xl text-xs font-mono text-ink-faint hover:text-ink hover:bg-white/5 transition-colors cursor-pointer border border-dashed border-edge hover:border-edge-bright"
          >
            + Add secret
          </button>
        </div>
      </div>
    </div>
  );
}
