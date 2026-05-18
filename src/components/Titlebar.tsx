import { createSignal, For, Show, createResource, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ActiveContext, EnvironmentMeta, ProjectMeta } from "../types";
import { LeftControls } from "./TitlebarControls";

const appWindow = getCurrentWindow();

type Props = {
  sidebarOpen: boolean;
  sidebarShortcutLabel?: string;
  onToggleSidebar: () => void;
  onOpenSecrets: () => void;
  onOpenVars: () => void;
  onOpenImport: () => void;
  onOpenEnvironments: () => void;
  activeContext: ActiveContext;
  onContextChange: () => void;
};

function ChevronDown() {
  return (
    <svg viewBox="0 0 12 12" class="w-2.5 h-2.5 opacity-50" fill="none">
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export default function Titlebar(props: Props) {
  const [projectMenuOpen, setProjectMenuOpen] = createSignal(false);
  const [envMenuOpen, setEnvMenuOpen] = createSignal(false);
  const [newProjectName, setNewProjectName] = createSignal("");
  const [creatingProject, setCreatingProject] = createSignal(false);

  const [projects] = createResource(() => invoke<ProjectMeta[]>("list_projects"), { initialValue: [] });

  const [environments, { refetch: refetchEnvs }] = createResource(
    () => props.activeContext.project_id,
    async (pid) => {
      if (!pid) return [] as EnvironmentMeta[];
      return invoke<EnvironmentMeta[]>("list_environments", { project_id: pid });
    },
    { initialValue: [] },
  );

  const closeMenus = () => {
    setProjectMenuOpen(false);
    setEnvMenuOpen(false);
  };

  const selectProject = async (id: string | null) => {
    await invoke("set_active_context", {
      project_id: id,
      environment_id: null,
    });
    props.onContextChange();
    closeMenus();
  };

  const selectEnvironment = async (id: string | null) => {
    await invoke("set_active_context", {
      project_id: props.activeContext.project_id,
      environment_id: id,
    });
    props.onContextChange();
    closeMenus();
  };

  const createProject = async () => {
    const name = newProjectName().trim();
    if (!name) return;
    setCreatingProject(true);
    try {
      const meta = await invoke<ProjectMeta>("create_project", { name });
      await selectProject(meta.id);
      setNewProjectName("");
    } finally {
      setCreatingProject(false);
    }
  };

  onCleanup(() => closeMenus());

  const toggleFullscreen = async () => {
    const fs = await appWindow.isFullscreen();
    appWindow.setFullscreen(!fs);
  };

  return (
    <div class="relative z-[100] flex items-center h-10 shrink-0 select-none bg-surface-0 border-b border-edge">
      <div class="px-2 flex items-center gap-1">
        <LeftControls
          sidebarOpen={props.sidebarOpen}
          sidebarShortcutLabel={props.sidebarShortcutLabel}
          onToggleSidebar={props.onToggleSidebar}
          onOpenSecrets={props.onOpenSecrets}
          onOpenVars={props.onOpenVars}
          onOpenImport={props.onOpenImport}
        />
        <div class="no-drag flex items-center gap-1 ml-1">
          <div class="relative">
            <button
              type="button"
              onClick={() => { setEnvMenuOpen(false); setProjectMenuOpen(o => !o); }}
              class="flex items-center gap-1 h-7 px-2 rounded-md text-[10px] font-mono text-white/60 hover:text-white/90 hover:bg-surface-2 transition-colors cursor-pointer max-w-[7rem]"
              title="Project"
            >
              <span class="truncate">{props.activeContext.project_name ?? "No project"}</span>
              <ChevronDown />
            </button>
            <Show when={projectMenuOpen()}>
              <div class="absolute top-full left-0 mt-1 w-48 rounded-lg bg-surface-1 border border-edge shadow-lg py-1 z-[200]">
                <button
                  type="button"
                  onClick={() => selectProject(null)}
                  class="w-full px-3 py-1.5 text-left text-[11px] font-mono text-ink-mute hover:bg-surface-2 cursor-pointer"
                >
                  No project
                </button>
                <For each={projects()}>
                  {(p) => (
                    <button
                      type="button"
                      onClick={() => selectProject(p.id)}
                      class="w-full px-3 py-1.5 text-left text-[11px] font-mono hover:bg-surface-2 cursor-pointer truncate"
                      classList={{ "text-accent": props.activeContext.project_id === p.id, "text-ink": props.activeContext.project_id !== p.id }}
                    >
                      {p.name}
                    </button>
                  )}
                </For>
                <div class="border-t border-edge mt-1 pt-1 px-2 flex gap-1">
                  <input
                    placeholder="New project…"
                    value={newProjectName()}
                    onInput={e => setNewProjectName(e.currentTarget.value)}
                    onKeyDown={e => { if (e.key === "Enter") createProject(); }}
                    class="flex-1 min-w-0 bg-surface-2 rounded px-2 h-6 text-[10px] font-mono border border-edge"
                  />
                  <button
                    type="button"
                    onClick={createProject}
                    disabled={creatingProject()}
                    class="h-6 px-2 text-[10px] font-mono rounded bg-white/5 cursor-pointer disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
            </Show>
          </div>

          <Show when={props.activeContext.project_id}>
            <div class="relative">
              <button
                type="button"
                onClick={() => { setProjectMenuOpen(false); setEnvMenuOpen(o => !o); refetchEnvs(); }}
                class="flex items-center gap-1 h-7 px-2 rounded-md text-[10px] font-mono text-white/60 hover:text-white/90 hover:bg-surface-2 transition-colors cursor-pointer max-w-[6rem]"
                title="Environment"
              >
                <span class="truncate">{props.activeContext.environment_name ?? "No env"}</span>
                <ChevronDown />
              </button>
              <Show when={envMenuOpen()}>
                <div class="absolute top-full left-0 mt-1 w-44 rounded-lg bg-surface-1 border border-edge shadow-lg py-1 z-[200]">
                  <button
                    type="button"
                    onClick={() => selectEnvironment(null)}
                    class="w-full px-3 py-1.5 text-left text-[11px] font-mono text-ink-mute hover:bg-surface-2 cursor-pointer"
                  >
                    No environment
                  </button>
                  <For each={environments()}>
                    {(env) => (
                      <button
                        type="button"
                        onClick={() => selectEnvironment(env.id)}
                        class="w-full px-3 py-1.5 text-left text-[11px] font-mono hover:bg-surface-2 cursor-pointer truncate"
                        classList={{ "text-accent": props.activeContext.environment_id === env.id, "text-ink": props.activeContext.environment_id !== env.id }}
                      >
                        {env.name}
                      </button>
                    )}
                  </For>
                  <button
                    type="button"
                    onClick={() => { closeMenus(); props.onOpenEnvironments(); }}
                    class="w-full px-3 py-1.5 text-left text-[11px] font-mono text-ink-faint hover:text-ink border-t border-edge mt-1 cursor-pointer"
                  >
                    Manage environments…
                  </button>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </div>

      <div
        data-tauri-drag-region
        onDblClick={toggleFullscreen}
        class="flex-1 h-full min-w-0"
        onClick={closeMenus}
      />

      <span
        class="absolute left-1/2 -translate-x-1/2 text-white/30 text-xl font-medium pointer-events-none z-[1]"
        style="font-family: 'MPLUS1Code'"
      >
        Oryn
      </span>

      <div class="no-drag flex items-center gap-1 px-2">
        <button
          type="button"
          onClick={() => appWindow.minimize()}
          class="w-8 h-8 flex items-center justify-center rounded text-white/40 hover:text-white/80 hover:bg-surface-1 cursor-pointer transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          class="w-8 h-8 flex items-center justify-center rounded text-white/40 hover:text-white/80 hover:bg-surface-1 cursor-pointer transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <polyline points="7,2 10,2 10,5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            <polyline points="5,10 2,10 2,7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => appWindow.close()}
          class="w-8 h-8 flex items-center justify-center rounded text-white/40 hover:text-white/80 hover:bg-red-500/20 cursor-pointer transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
