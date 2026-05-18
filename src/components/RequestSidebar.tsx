import { createSignal, createEffect, For, Show, createResource, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { invoke } from "@tauri-apps/api/core";
import NewCollectionDialog from "./NewCollectionDialog";
import type {
  ActiveContext,
  CollectionTree,
  HistoryMeta,
  HistoryEntry,
  SavedRequest,
  LoadRequestPayload,
  HttpResponse,
} from "../types";

export const SIDEBAR_WIDTH_MIN = 168;
export const SIDEBAR_WIDTH_MAX = 480;
export const SIDEBAR_WIDTH_DEFAULT = 224;

export function clampSidebarWidth(width: number) {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, width));
}

type Props = {
  width: number;
  onWidthChange: (width: number) => void;
  activeContext: ActiveContext;
  onLoad: (request: LoadRequestPayload, response: HttpResponse | null, timestamp: string | null) => void;
  refreshKey: number;
  activeSavedId?: string | null;
  activeDirty?: boolean;
};

const METHOD_COLORS: Record<string, string> = {
  GET: "text-verb-get",
  POST: "text-verb-post",
  PUT: "text-verb-put",
  PATCH: "text-verb-patch",
  DELETE: "text-verb-delete",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function methodColor(m: string) {
  return METHOD_COLORS[m.toUpperCase()] ?? "text-ink-faint";
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.host : u.host + u.pathname;
  } catch {
    return url;
  }
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 12 12" class="w-3 h-3 shrink-0" fill="none" aria-hidden="true">
      <path
        d="M3.25 2.25h5.5v7.25L6 7.75 3.25 9.5V2.25z"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 12 12" class="w-3 h-3 shrink-0" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.2" />
      <path
        d="M6 3.75V6l2 1.25"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export default function RequestSidebar(props: Props) {
  const [tab, setTab] = createSignal<"history" | "saved">("saved");
  const [historyFilter, setHistoryFilter] = createSignal<"all" | "project">("all");
  const [expandedCollections, setExpandedCollections] = createSignal<Set<string>>(new Set());
  // Collection ids the user has explicitly toggled — anything else defaults to expanded.
  const [touchedCollections, setTouchedCollections] = createSignal<Set<string>>(new Set());
  const [showNewCollection, setShowNewCollection] = createSignal(false);
  const [creatingCollection, setCreatingCollection] = createSignal(false);
  const [savedMenu, setSavedMenu] = createSignal<{ x: number; y: number } | null>(null);

  const [history, { refetch: refetchHistory }] = createResource(
    () => ({
      filter: historyFilter(),
      projectId: props.activeContext.project_id,
      key: props.refreshKey,
    }),
    async ({ filter, projectId }) => {
      if (filter === "project" && projectId) {
        return invoke<HistoryMeta[]>("list_history", {
          project_only: true,
          project_id: projectId,
        });
      }
      return invoke<HistoryMeta[]>("list_history", {
        project_only: false,
        project_id: null,
      });
    },
    { initialValue: [] },
  );

  const [tree, { refetch: refetchTree }] = createResource(
    () => ({ projectId: props.activeContext.project_id, key: props.refreshKey }),
    async ({ projectId }) => {
      if (!projectId) return [] as CollectionTree[];
      return invoke<CollectionTree[]>("list_collection_tree", { project_id: projectId });
    },
    { initialValue: [] },
  );

  const toggleCollection = (id: string) => {
    setTouchedCollections(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setExpandedCollections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Auto-expand any newly seen collection so saved requests are visible by default.
  createEffect(() => {
    const cols = tree();
    if (!cols.length) return;
    const touched = touchedCollections();
    setExpandedCollections(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const c of cols) {
        if (!touched.has(c.id) && !next.has(c.id)) {
          next.add(c.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  });

  const loadHistory = async (id: string) => {
    const entry = await invoke<HistoryEntry>("load_history_entry", {
      id,
      project_only: historyFilter() === "project",
      project_id: props.activeContext.project_id,
    });
    props.onLoad(
      { method: entry.method, url: entry.url, params: entry.params, headers: entry.headers, body: entry.body },
      entry.response,
      entry.sent_at,
    );
  };

  const loadSaved = async (collectionId: string, requestId: string) => {
    const pid = props.activeContext.project_id;
    if (!pid) return;
    const req = await invoke<SavedRequest>("load_saved", {
      project_id: pid,
      collection_id: collectionId,
      id: requestId,
    });
    props.onLoad(
      {
        method: req.method,
        url: req.url,
        params: req.params,
        headers: req.headers,
        body: req.body,
        body_mode: req.body_mode,
        protocol: req.protocol,
        graphql_query: req.graphql_query,
        graphql_variables: req.graphql_variables,
        savedId: req.id,
        collectionId,
        projectId: pid,
      },
      req.response,
      req.saved_at,
    );
  };

  const deleteSaved = async (e: MouseEvent, collectionId: string, requestId: string) => {
    e.stopPropagation();
    const pid = props.activeContext.project_id;
    if (!pid) return;
    await invoke("delete_saved", {
      project_id: pid,
      collection_id: collectionId,
      id: requestId,
    });
    await refetchTree();
  };

  const [pendingDeleteCol, setPendingDeleteCol] = createSignal<string | null>(null);
  const beginDeleteCollection = (e: MouseEvent, collectionId: string) => {
    e.stopPropagation();
    setPendingDeleteCol(collectionId);
  };
  const cancelDeleteCollection = (e?: MouseEvent) => {
    e?.stopPropagation();
    setPendingDeleteCol(null);
  };
  const confirmDeleteCollection = async (e: MouseEvent, collectionId: string) => {
    e.stopPropagation();
    const pid = props.activeContext.project_id;
    if (!pid) return;
    try {
      await invoke("delete_collection", { project_id: pid, collection_id: collectionId });
      await refetchTree();
    } finally {
      setPendingDeleteCol(null);
    }
  };

  const openCreateCollection = () => {
    if (!props.activeContext.project_id) return;
    setShowNewCollection(true);
  };

  const submitCollection = async (name: string) => {
    const pid = props.activeContext.project_id;
    if (!pid) return;
    setCreatingCollection(true);
    try {
      await invoke("create_collection", { project_id: pid, name });
      await refetchTree();
      setShowNewCollection(false);
    } finally {
      setCreatingCollection(false);
    }
  };

  const handleSavedContextMenu = (e: MouseEvent) => {
    if (tab() !== "saved" || !props.activeContext.project_id) return;
    e.preventDefault();
    setSavedMenu({ x: e.clientX, y: e.clientY });
  };

  const closeSavedMenu = () => setSavedMenu(null);

  onMount(() => {
    const onDocDown = () => closeSavedMenu();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeSavedMenu(); };
    window.addEventListener("mousedown", onDocDown);
    window.addEventListener("keydown", onKey);
    onCleanup(() => {
      window.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("keydown", onKey);
    });
  });

  const startResize = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = props.width;

    const onMove = (ev: MouseEvent) => {
      props.onWidthChange(clampSidebarWidth(startW + ev.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <aside
      style={{ width: `${props.width}px` }}
      class="no-drag relative z-90 shrink-0 flex flex-col bg-surface-1 border-r border-edge min-h-0 overflow-hidden isolate"
    >
      <div role="tablist" class="relative z-10 flex items-center h-10 px-2 gap-1 border-b border-edge shrink-0 bg-surface-1">
        <button
          type="button"
          role="tab"
          aria-selected={tab() === "saved"}
          onClick={() => { setTab("saved"); refetchTree(); }}
          class="flex-1 h-7 rounded-md text-[11px] font-mono transition-colors cursor-pointer outline-none flex items-center justify-center gap-1.5"
          classList={{
            "bg-surface-2 text-ink": tab() === "saved",
            "text-ink-mute hover:text-ink hover:bg-surface-2/80": tab() !== "saved",
          }}
        >
          <BookmarkIcon />
          Saved
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab() === "history"}
          onClick={() => { setTab("history"); refetchHistory(); }}
          class="flex-1 h-7 rounded-md text-[11px] font-mono transition-colors cursor-pointer outline-none flex items-center justify-center gap-1.5"
          classList={{
            "bg-surface-2 text-ink": tab() === "history",
            "text-ink-mute hover:text-ink hover:bg-surface-2/80": tab() !== "history",
          }}
        >
          <ClockIcon />
          History
        </button>
      </div>

      <div
        class="relative z-10 flex-1 overflow-y-auto py-1 bg-surface-1"
        onContextMenu={handleSavedContextMenu}
      >
        <Show when={tab() === "history"}>
          <Show when={props.activeContext.project_id}>
            <div class="flex gap-1 px-2 pb-1">
              <button
                type="button"
                onClick={() => { setHistoryFilter("all"); refetchHistory(); }}
                class="flex-1 h-6 rounded text-[10px] font-mono cursor-pointer"
                classList={{
                  "bg-surface-2 text-ink": historyFilter() === "all",
                  "text-ink-faint": historyFilter() !== "all",
                }}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => { setHistoryFilter("project"); refetchHistory(); }}
                class="flex-1 h-6 rounded text-[10px] font-mono cursor-pointer"
                classList={{
                  "bg-surface-2 text-ink": historyFilter() === "project",
                  "text-ink-faint": historyFilter() !== "project",
                }}
              >
                Project
              </button>
            </div>
          </Show>
          <Show
            when={(history()?.length ?? 0) > 0}
            fallback={
              <p class="text-[11px] font-mono text-ink-faint text-center py-8 px-3">
                Requests you send will appear here.
              </p>
            }
          >
            <For each={history()}>
              {(entry) => (
                <button
                  type="button"
                  onClick={() => loadHistory(entry.id)}
                  class="w-full flex flex-col gap-0.5 px-3 py-2 hover:bg-surface-2/60 transition-colors cursor-pointer text-left"
                >
                  <div class="flex items-center gap-1.5">
                    <span class={`text-[10px] font-mono font-semibold shrink-0 ${methodColor(entry.method)}`}>
                      {entry.method}
                    </span>
                    <span class="text-[11px] font-mono text-ink truncate">{shortUrl(entry.url)}</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-[10px] font-mono text-ink-faint">{relativeTime(entry.sent_at)}</span>
                    <Show when={entry.project_name}>
                      <span class="text-[9px] font-mono text-accent/80 truncate">{entry.project_name}</span>
                    </Show>
                  </div>
                </button>
              )}
            </For>
          </Show>
        </Show>

        <Show when={tab() === "saved"}>
          <Show
            when={props.activeContext.project_id}
            fallback={
              <p class="text-[11px] font-mono text-ink-faint text-center py-8 px-3">
                Select a project to browse saved requests.
              </p>
            }
          >
            <div class="px-2 pb-1">
              <button
                type="button"
                onClick={openCreateCollection}
                class="w-full h-6 text-[10px] font-mono text-ink-faint hover:text-ink border border-dashed border-edge rounded cursor-pointer"
              >
                + Collection
              </button>
            </div>
            <Show
              when={(tree()?.length ?? 0) > 0}
              fallback={
                <p class="text-[11px] font-mono text-ink-faint text-center py-6 px-3">
                  Save a request or add a collection.
                </p>
              }
            >
              <For each={tree()}>
                {(col) => (
                  <div>
                    <Show
                      when={pendingDeleteCol() === col.id}
                      fallback={
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleCollection(col.id)}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") toggleCollection(col.id); }}
                          class="group/col w-full flex items-center gap-1 px-2 py-1.5 text-[11px] font-mono text-ink-mute hover:bg-surface-2/60 cursor-pointer"
                        >
                          <span class="text-ink-faint w-3">{expandedCollections().has(col.id) ? "▼" : "▶"}</span>
                          <span class="truncate font-semibold text-ink">{col.name}</span>
                          <span class="text-[10px] text-ink-faint ml-auto">{col.requests.length}</span>
                          <button
                            type="button"
                            title="Delete collection"
                            aria-label="Delete collection"
                            onClick={(e) => beginDeleteCollection(e, col.id)}
                            class="opacity-0 group-hover/col:opacity-100 w-5 h-5 flex items-center justify-center rounded text-ink-faint hover:text-verb-delete hover:bg-surface-2 transition-all cursor-pointer shrink-0"
                          >
                            <svg viewBox="0 0 12 12" class="w-2.5 h-2.5" fill="none">
                              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                            </svg>
                          </button>
                        </div>
                      }
                    >
                      <div class="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-mono bg-amber-400/10 border-y border-amber-400/30">
                        <span class="flex-1 text-amber-300 truncate">
                          Delete <span class="text-ink">{col.name}</span>? ({col.requests.length})
                        </span>
                        <button
                          type="button"
                          onClick={(e) => confirmDeleteCollection(e, col.id)}
                          class="px-1.5 py-0.5 rounded text-[10px] font-mono text-amber-400 hover:text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/40 transition-colors cursor-pointer"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={cancelDeleteCollection}
                          class="px-1.5 py-0.5 rounded text-[10px] font-mono text-ink-faint hover:text-ink hover:bg-white/4 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </Show>
                    <Show when={expandedCollections().has(col.id) && pendingDeleteCol() !== col.id}>
                      <For each={col.requests}>
                        {(req) => (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => loadSaved(col.id, req.id)}
                            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") loadSaved(col.id, req.id); }}
                            class="w-full flex items-center gap-1.5 pl-6 pr-3 py-1.5 hover:bg-surface-2/60 transition-colors cursor-pointer text-left group"
                          >
                            <span class={`text-[10px] font-mono font-semibold shrink-0 ${methodColor(req.method)}`}>
                              {req.method}
                            </span>
                            <span class="flex-1 text-[11px] font-mono text-ink truncate">{req.name}</span>
                            <Show when={props.activeSavedId === req.id && props.activeDirty}>
                              <span
                                aria-hidden="true"
                                title="Unsaved changes"
                                class="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.7)] animate-pulse"
                              />
                            </Show>
                            <button
                              type="button"
                              onClick={(e) => deleteSaved(e, col.id, req.id)}
                              class="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-ink-faint hover:text-verb-delete hover:bg-surface-2 transition-all cursor-pointer shrink-0"
                            >
                              <svg viewBox="0 0 12 12" class="w-2.5 h-2.5" fill="none">
                                <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </For>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </Show>
        </Show>
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={startResize}
        class="absolute top-0 -right-1 z-20 w-2 h-full cursor-col-resize hover:bg-accent/30 active:bg-accent/50 transition-colors"
      />

      <NewCollectionDialog
        open={showNewCollection()}
        saving={creatingCollection()}
        onClose={() => setShowNewCollection(false)}
        onSubmit={submitCollection}
      />

      <Show when={savedMenu()}>
        {(pos) => (
          <Portal>
            <div
              role="menu"
              style={{ top: `${pos().y}px`, left: `${pos().x}px` }}
              class="fixed z-300 min-w-44 rounded-lg bg-surface-1 border border-edge shadow-[0_12px_32px_-8px_rgba(0,0,0,0.7)] py-1"
              onMouseDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => { closeSavedMenu(); openCreateCollection(); }}
                class="w-full flex items-center gap-2 px-3 h-7 text-left text-[11px] font-mono text-ink hover:bg-surface-2 cursor-pointer"
              >
                <span class="text-ink-faint">+</span>
                <span>New collection</span>
              </button>
            </div>
          </Portal>
        )}
      </Show>
    </aside>
  );
}
