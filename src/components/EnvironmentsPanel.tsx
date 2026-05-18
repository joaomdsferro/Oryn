import { createSignal, For, Show, createResource } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import type { ActiveContext, EnvironmentFile, EnvironmentMeta, EnvVariable } from "../types";

type Props = {
  activeContext: ActiveContext;
  onClose: () => void;
  onContextChange: () => void;
};

export default function EnvironmentsPanel(props: Props) {
  const getProjectId = () => props.activeContext.project_id;

  const [environments, { refetch: refetchEnvs }] = createResource(
    () => getProjectId(),
    async (pid) => {
      if (!pid) return [] as EnvironmentMeta[];
      return invoke<EnvironmentMeta[]>("list_environments", { project_id: pid });
    },
    { initialValue: [] },
  );

  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [envDetail, setEnvDetail] = createSignal<EnvironmentFile | null>(null);
  const [variables, setVariables] = createSignal<EnvVariable[]>([]);
  const [saving, setSaving] = createSignal(false);
  const [adding, setAdding] = createSignal(false);
  const [new_name, setNewName] = createSignal("");
  const [duplicateFrom, setDuplicateFrom] = createSignal<string | null>(null);
  const [dupName, setDupName] = createSignal("");

  const selectEnv = async (id: string) => {
    const pid = getProjectId();
    if (!pid) return;
    setSelectedId(id);
    const env = await invoke<EnvironmentFile>("load_environment_cmd", {
      project_id: pid,
      environment_id: id,
    });
    setEnvDetail(env);
    setVariables(env.variables.map(v => ({ ...v })));
  };

  const saveVariables = async () => {
    const pid = getProjectId();
    const eid = selectedId();
    if (!pid || !eid) return;
    setSaving(true);
    try {
      await invoke("set_environment_variables", {
        project_id: pid,
        environment_id: eid,
        variables: variables(),
      });
      await refetchEnvs();
    } finally {
      setSaving(false);
    }
  };

  const createEnv = async () => {
    const pid = getProjectId();
    const name = new_name().trim();
    if (!pid || !name) return;
    setSaving(true);
    try {
      const meta = await invoke<EnvironmentMeta>("create_environment", {
        project_id: pid,
        name,
      });
      await refetchEnvs();
      setAdding(false);
      setNewName("");
      await selectEnv(meta.id);
    } finally {
      setSaving(false);
    }
  };

  const duplicateEnv = async () => {
    const pid = getProjectId();
    const from = duplicateFrom();
    const name = dupName().trim();
    if (!pid || !from || !name) return;
    setSaving(true);
    try {
      const meta = await invoke<EnvironmentMeta>("duplicate_environment", {
        project_id: pid,
        environment_id: from,
        new_name: name,
      });
      setDuplicateFrom(null);
      setDupName("");
      await refetchEnvs();
      await selectEnv(meta.id);
    } finally {
      setSaving(false);
    }
  };

  const deleteEnv = async (id: string) => {
    const pid = getProjectId();
    if (!pid) return;
    await invoke("delete_environment", { project_id: pid, environment_id: id });
    if (selectedId() === id) {
      setSelectedId(null);
      setEnvDetail(null);
      setVariables([]);
    }
    await refetchEnvs();
    props.onContextChange();
  };

  const addVariable = () => {
    setVariables(v => [...v, { name: "", value: "" }]);
  };

  const updateVar = (index: number, field: "name" | "value", val: string) => {
    setVariables(v => v.map((row, i) => (i === index ? { ...row, [field]: val } : row)));
  };

  const removeVar = (index: number) => {
    setVariables(v => v.filter((_, i) => i !== index));
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={props.onClose} />
      <div class="relative w-full max-w-lg mx-4 rounded-2xl bg-surface-1 border border-edge shadow-[0_24px_64px_-12px_rgba(0,0,0,0.8)] overflow-hidden max-h-[80vh] flex flex-col">
        <div class="flex items-center justify-between px-4 h-12 border-b border-edge shrink-0">
          <span class="text-xs font-mono font-semibold text-ink">Environments</span>
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

        <Show
          when={getProjectId()}
          fallback={
            <p class="text-xs font-mono text-ink-faint text-center py-10 px-4">
              Select a project to manage environments.
            </p>
          }
        >
          <div class="flex flex-1 min-h-0">
            <div class="w-36 shrink-0 border-r border-edge overflow-y-auto p-1">
              <For each={environments()}>
                {(env) => (
                  <div class="group flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => selectEnv(env.id)}
                      class="flex-1 text-left px-2 py-1.5 rounded-md text-[11px] font-mono truncate transition-colors cursor-pointer"
                      classList={{
                        "bg-surface-2 text-ink": selectedId() === env.id,
                        "text-ink-mute hover:bg-surface-2/80": selectedId() !== env.id,
                      }}
                    >
                      {env.name}
                    </button>
                    <button
                      type="button"
                      title="Duplicate"
                      onClick={() => { setDuplicateFrom(env.id); setDupName(`${env.name} copy`); }}
                      class="opacity-0 group-hover:opacity-100 w-5 h-5 text-[10px] text-ink-faint hover:text-ink cursor-pointer shrink-0"
                    >
                      ⧉
                    </button>
                  </div>
                )}
              </For>
              <Show when={adding()}>
                <div class="p-2 space-y-1">
                  <input
                    placeholder="Name…"
                    value={new_name()}
                    onInput={e => setNewName(e.currentTarget.value)}
                    class="w-full bg-surface-2 rounded px-2 h-7 text-[11px] font-mono border border-edge"
                  />
                  <button type="button" onClick={createEnv} class="w-full h-6 text-[10px] font-mono rounded bg-white/5 cursor-pointer">
                    Create
                  </button>
                </div>
              </Show>
              <button
                type="button"
                onClick={() => setAdding(true)}
                class="w-full mt-1 h-7 text-[10px] font-mono text-ink-faint hover:text-ink cursor-pointer"
              >
                + New
              </button>
            </div>

            <div class="flex-1 flex flex-col min-w-0 p-3 overflow-y-auto">
              <Show
                when={selectedId() && envDetail()}
                fallback={
                  <p class="text-[11px] font-mono text-ink-faint text-center py-8">
                    Select an environment to edit variables.
                  </p>
                }
              >
                <p class="text-[10px] font-mono text-ink-faint uppercase tracking-wider mb-2">
                  {envDetail()?.name} — use {"{{name}}"} in URLs and headers
                </p>
                <div class="space-y-1.5 mb-3">
                  <For each={variables()}>
                    {(row, i) => (
                      <div class="flex gap-1.5">
                        <input
                          placeholder="name"
                          value={row.name}
                          onInput={e => updateVar(i(), "name", e.currentTarget.value)}
                          class="flex-1 bg-surface-2 rounded px-2 h-7 text-[11px] font-mono border border-edge"
                        />
                        <input
                          placeholder="value"
                          value={row.value}
                          onInput={e => updateVar(i(), "value", e.currentTarget.value)}
                          class="flex-2 bg-surface-2 rounded px-2 h-7 text-[11px] font-mono border border-edge"
                        />
                        <button
                          type="button"
                          onClick={() => removeVar(i())}
                          class="w-7 h-7 text-ink-faint hover:text-verb-delete cursor-pointer"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </For>
                </div>
                <div class="flex gap-2">
                  <button type="button" onClick={addVariable} class="h-7 px-2 text-[11px] font-mono rounded border border-dashed border-edge cursor-pointer">
                    + Variable
                  </button>
                  <button
                    type="button"
                    onClick={saveVariables}
                    disabled={saving()}
                    class="flex-1 h-7 rounded-lg bg-white/5 text-[11px] font-mono cursor-pointer disabled:opacity-50"
                  >
                    {saving() ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { const id = selectedId(); if (id) deleteEnv(id); }}
                    class="h-7 px-2 text-[11px] font-mono text-verb-delete cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </Show>
            </div>
          </div>
        </Show>

        <Show when={duplicateFrom()}>
          <div class="absolute inset-0 flex items-center justify-center bg-black/40">
            <div class="bg-surface-1 border border-edge rounded-xl p-4 w-64 space-y-2">
              <p class="text-xs font-mono text-ink">Duplicate environment</p>
              <input
                value={dupName()}
                onInput={e => setDupName(e.currentTarget.value)}
                class="w-full bg-surface-2 rounded px-2 h-8 text-xs font-mono border border-edge"
              />
              <div class="flex gap-2">
                <button type="button" onClick={duplicateEnv} class="flex-1 h-7 rounded bg-white/5 text-xs font-mono cursor-pointer">OK</button>
                <button type="button" onClick={() => setDuplicateFrom(null)} class="h-7 px-3 text-xs font-mono cursor-pointer">Cancel</button>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
