import { createSignal, createEffect, onMount, onCleanup, Show, createResource, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Titlebar from "./components/Titlebar";
import ResizeHandles from "./components/ResizeHandles";
import RequestBar from "./components/RequestBar";
import ResponsePanel from "./components/ResponsePanel";
import RequestSidebar, {
  SIDEBAR_WIDTH_DEFAULT,
  clampSidebarWidth,
} from "./components/RequestSidebar";
import SecretsPanel from "./components/SecretsPanel";
import VarsPanel from "./components/VarsPanel";
import EnvironmentsPanel from "./components/EnvironmentsPanel";
import ImportPanel from "./components/ImportPanel";
import Toast from "./components/Toast";
import type {
  ActiveContext,
  CollectionMeta,
  HttpResponse,
  LoadRequestPayload,
  RequestPayload,
  SavedRequest,
} from "./types";

const appWindow = getCurrentWindow();
const SIDEBAR_WIDTH_KEY = "oryn-sidebar-width";
const DEFAULT_ZOOM = 1.1;

function isSidebarShortcut(e: KeyboardEvent): boolean {
  const mod = e.ctrlKey || e.metaKey;
  return mod && e.key.toLowerCase() === "b" && !e.shiftKey && !e.altKey;
}

function toggleSidebarShortcutLabel(): string {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    ? "⌘B"
    : "Ctrl+B";
}

function loadSidebarWidth(): number {
  const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
  if (!raw) return SIDEBAR_WIDTH_DEFAULT;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? clampSidebarWidth(n) : SIDEBAR_WIDTH_DEFAULT;
}

type SaveState =
  | { open: false }
  | {
      open: true;
      name: string;
      collection_id: string;
      saving: boolean;
      update_id: string | null;
    };

const emptyContext = (): ActiveContext => ({
  project_id: null,
  project_name: null,
  environment_id: null,
  environment_name: null,
});

export default function App() {
  const [isFullscreen, setIsFullscreen] = createSignal(true);
  const [loading, setLoading] = createSignal(false);
  const [response, setResponse] = createSignal<HttpResponse | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [zoom, setZoom] = createSignal(DEFAULT_ZOOM);

  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  const [sidebarWidth, setSidebarWidth] = createSignal(loadSidebarWidth());
  const [secretsOpen, setSecretsOpen] = createSignal(false);
  const [varsOpen, setVarsOpen] = createSignal(false);
  const [environmentsOpen, setEnvironmentsOpen] = createSignal(false);
  const [importOpen, setImportOpen] = createSignal(false);

  const [activeContext, setActiveContext] = createSignal<ActiveContext>(emptyContext());
  const [refreshKey, setRefreshKey] = createSignal(0);

  const [isHistorical, setIsHistorical] = createSignal(false);
  const [historicalTimestamp, setHistoricalTimestamp] = createSignal<string | null>(null);

  const [loadRequest, setLoadRequest] = createSignal<LoadRequestPayload | null>(null);
  const [savedRequestId, setSavedRequestId] = createSignal<string | null>(null);
  const [lastRequest, setLastRequest] = createSignal<RequestPayload | null>(null);
  const [savedTick, setSavedTick] = createSignal(0);
  const [currentDirty, setCurrentDirty] = createSignal(false);
  const [toastShow, setToastShow] = createSignal(false);
  const [toastMessage, setToastMessage] = createSignal("");
  let toastTimer: number | undefined;
  const flashToast = (message: string) => {
    if (toastTimer !== undefined) clearTimeout(toastTimer);
    setToastShow(false);
    setToastMessage(message);
    requestAnimationFrame(() => {
      setToastShow(true);
      toastTimer = window.setTimeout(() => setToastShow(false), 2000);
    });
  };
  const flashSavedToast = () => flashToast("Request saved");

  const [saveState, setSaveState] = createSignal<SaveState>({ open: false });
  const [pendingSave, setPendingSave] = createSignal<RequestPayload | null>(null);
  const [saveError, setSaveError] = createSignal<string | null>(null);

  let requestVersion = 0;

  const refreshContext = async () => {
    const ctx = await invoke<ActiveContext>("get_active_context");
    setActiveContext(ctx);
    setRefreshKey(k => k + 1);
  };

  const [collections] = createResource(
    () => ({ pid: activeContext().project_id, key: refreshKey() }),
    async ({ pid }) => {
      if (!pid) return [] as CollectionMeta[];
      return invoke<CollectionMeta[]>("list_collections", { project_id: pid });
    },
    { initialValue: [] },
  );

  const bumpRefresh = () => setRefreshKey(k => k + 1);

  const handleSend = async (req: RequestPayload) => {
    const version = ++requestVersion;
    setLoading(true);
    setResponse(null);
    setError(null);
    setIsHistorical(false);
    setHistoricalTimestamp(null);
    setLastRequest(req);
    const ctx = activeContext();
    try {
      const res = await invoke<HttpResponse>("send_request", {
        method: req.method,
        url: req.url,
        params: req.params,
        headers: req.headers,
        body: req.body,
        project_id: ctx.project_id,
        environment_id: ctx.environment_id,
        collection_id: loadRequest()?.collectionId ?? null,
        request_id: savedRequestId(),
        request_name: null,
      });
      if (version === requestVersion) setResponse(res);
    } catch (e) {
      if (version === requestVersion && String(e) !== "cancelled") setError(String(e));
    } finally {
      if (version === requestVersion) setLoading(false);
    }
  };

  const handleLoad = (
    request: LoadRequestPayload,
    resp: HttpResponse | null,
    timestamp: string | null,
  ) => {
    setLoadRequest({ ...request });
    setSavedRequestId(request.savedId ?? null);
    setLastRequest({
      protocol: (request.protocol as RequestPayload["protocol"]) ?? "rest",
      method: request.method,
      url: request.url,
      params: request.params,
      headers: request.headers,
      body: request.body ?? null,
      body_mode: request.body_mode ?? "none",
      graphql_query: request.graphql_query ?? "",
      graphql_variables: request.graphql_variables ?? "",
    });
    setResponse(resp);
    setError(null);
    setIsHistorical(!!resp);
    setHistoricalTimestamp(timestamp);
  };

  const clearAll = () => {
    requestVersion++;
    invoke("cancel_request").catch(() => {});
    setLoading(false);
    setResponse(null);
    setError(null);
    setIsHistorical(false);
    setHistoricalTimestamp(null);
    setLoadRequest(null);
    setSavedRequestId(null);
  };

  const openSaveModal = (req: RequestPayload, asNew: boolean) => {
    if (!req.url.trim()) return;
    const cols = collections();
    const defaultCol = cols[0]?.id ?? "";
    setPendingSave(req);
    setSaveError(null);
    setSaveState({
      open: true,
      name: asNew ? "" : "",
      collection_id: defaultCol,
      saving: false,
      update_id: asNew ? null : savedRequestId(),
    });
  };

  const handleSave = async (req: RequestPayload) => {
    const id = savedRequestId();
    const lr = loadRequest();
    const pid = activeContext().project_id;
    if (id && lr?.collectionId && pid && req.url.trim()) {
      try {
        await invoke("update_saved", {
          project_id: pid,
          collection_id: lr.collectionId,
          id,
          protocol: req.protocol,
          method: req.method,
          url: req.url,
          params: req.params,
          headers: req.headers,
          body: req.body,
          body_mode: req.body_mode,
          graphql_query: req.graphql_query,
          graphql_variables: req.graphql_variables,
          response: response() ?? null,
        });
        bumpRefresh();
        setSavedTick(t => t + 1);
        flashSavedToast();
        return;
      } catch (e) {
        setSaveError(String(e));
      }
    }
    openSaveModal(req, false);
  };
  const handleSaveAs = (req: RequestPayload) => openSaveModal(req, true);

  const discardChanges = async () => {
    const id = savedRequestId();
    const lr = loadRequest();
    const pid = activeContext().project_id;
    if (!id || !lr?.collectionId || !pid) return;
    try {
      const req = await invoke<SavedRequest>("load_saved", {
        project_id: pid,
        collection_id: lr.collectionId,
        id,
      });
      handleLoad(
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
          collectionId: lr.collectionId,
          projectId: pid,
        },
        req.response,
        req.saved_at,
      );
    } catch {
      // No-op: if reload fails, leave current state untouched.
    }
  };

  const closeSaveModal = () => {
    setSaveState({ open: false });
    setPendingSave(null);
    setSaveError(null);
  };

  const confirmSave = async () => {
    const state = saveState();
    if (!state.open) return;
    const name = state.name.trim();
    if (!name) return;
    const req = pendingSave();
    const pid = activeContext().project_id;
    if (!req?.url.trim() || !pid || !state.collection_id) {
      setSaveError("Select a project and collection first.");
      return;
    }
    setSaveError(null);
    setSaveState({ ...state, saving: true });
    try {
      if (state.update_id) {
        await invoke("update_saved", {
          project_id: pid,
          collection_id: state.collection_id,
          id: state.update_id,
          protocol: req.protocol,
          method: req.method,
          url: req.url,
          params: req.params,
          headers: req.headers,
          body: req.body,
          body_mode: req.body_mode,
          graphql_query: req.graphql_query,
          graphql_variables: req.graphql_variables,
          response: response() ?? null,
        });
        setSavedRequestId(state.update_id);
      } else {
        const id = await invoke<string>("save_request", {
          project_id: pid,
          collection_id: state.collection_id,
          name,
          protocol: req.protocol,
          method: req.method,
          url: req.url,
          params: req.params,
          headers: req.headers,
          body: req.body,
          body_mode: req.body_mode,
          graphql_query: req.graphql_query,
          graphql_variables: req.graphql_variables,
          response: response() ?? null,
        });
        setSavedRequestId(id);
      }
      setLoadRequest(prev => prev ? {
        ...prev,
        savedId: state.update_id ?? savedRequestId() ?? undefined,
        collectionId: state.collection_id,
        projectId: pid,
      } : null);
      bumpRefresh();
      setSavedTick(t => t + 1);
      flashSavedToast();
      closeSaveModal();
    } catch (e) {
      setSaveError(String(e));
      setSaveState({ ...state, saving: false });
    }
  };

  createEffect(() => {
    document.documentElement.style.zoom = String(zoom());
  });

  createEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth()));
  });

  onMount(async () => {
    await refreshContext();

    const updateFullscreen = async () => {
      const fs = await appWindow.isFullscreen();
      setIsFullscreen(fs);
      document.documentElement.classList.toggle("windowed", !fs);
    };

    updateFullscreen();
    setIsFullscreen(await appWindow.isFullscreen());

    const unlisten = await appWindow.onResized(updateFullscreen);

    const handler = (e: KeyboardEvent) => {
      if (isSidebarShortcut(e)) {
        e.preventDefault();
        setSidebarOpen(o => !o);
        return;
      }
      if (e.key === "Escape") {
        if (importOpen()) { setImportOpen(false); return; }
        if (environmentsOpen()) { setEnvironmentsOpen(false); return; }
        if (varsOpen()) { setVarsOpen(false); return; }
        if (secretsOpen()) { setSecretsOpen(false); return; }
        if (saveState().open) { closeSaveModal(); return; }
        appWindow.minimize();
      }
      if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setZoom(z => Math.min(+(z + 0.1).toFixed(1), 2.0));
      }
      if (e.ctrlKey && e.key === "-") {
        e.preventDefault();
        setZoom(z => Math.max(+(z - 0.1).toFixed(1), 0.5));
      }
      if (e.ctrlKey && e.key === "0") {
        e.preventDefault();
        setZoom(DEFAULT_ZOOM);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("oryn:save-request"));
      }
    };
    window.addEventListener("keydown", handler);

    onCleanup(() => {
      unlisten();
      window.removeEventListener("keydown", handler);
    });
  });

  return (
    <div class={`relative flex flex-col h-screen bg-surface-0 ${isFullscreen() ? "" : "overflow-hidden"}`}>
      {!isFullscreen() && (
        <ResizeHandles sidebarOpen={sidebarOpen()} sidebarWidth={sidebarWidth()} />
      )}
      <Titlebar
        sidebarOpen={sidebarOpen()}
        sidebarShortcutLabel={toggleSidebarShortcutLabel()}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        onOpenSecrets={() => setSecretsOpen(true)}
        onOpenVars={() => setVarsOpen(true)}
        onOpenImport={() => setImportOpen(true)}
        onOpenEnvironments={() => setEnvironmentsOpen(true)}
        activeContext={activeContext()}
        onContextChange={refreshContext}
      />
      <div class="flex flex-1 min-h-0">
        <Show when={sidebarOpen()}>
          <RequestSidebar
            width={sidebarWidth()}
            onWidthChange={setSidebarWidth}
            activeContext={activeContext()}
            onLoad={handleLoad}
            refreshKey={refreshKey()}
            activeSavedId={savedRequestId()}
            activeDirty={currentDirty()}
          />
        </Show>
        <main class="flex-1 flex flex-col items-center justify-center gap-3 px-6 pb-6 min-h-0 overflow-hidden">
          <RequestBar
            onSend={handleSend}
            onSave={handleSave}
            onSaveAs={handleSaveAs}
            onNew={clearAll}
            loading={loading()}
            loadRequest={loadRequest()}
            savedRequestId={savedRequestId()}
            savedTick={savedTick()}
            onDirtyChange={setCurrentDirty}
            onDiscard={discardChanges}
          />
          <Show when={loading() || !!response() || !!error()}>
            <ResponsePanel
              response={response()}
              error={error()}
              loading={loading()}
              onClear={clearAll}
              isHistorical={isHistorical()}
              historicalTimestamp={historicalTimestamp()}
            />
          </Show>
        </main>
      </div>

      <Show when={saveState().open}>
        <div class="fixed inset-0 z-50 flex items-center justify-center">
          <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeSaveModal} />
          <div class="relative w-80 rounded-2xl bg-surface-1 border border-edge shadow-[0_24px_64px_-12px_rgba(0,0,0,0.8)] p-4 space-y-3">
            <p class="text-xs font-mono font-semibold text-ink">
              {saveState().open && saveState().update_id ? "Update request" : "Save request"}
            </p>
            <select
              value={saveState().open ? saveState().collection_id : ""}
              onChange={e => setSaveState(s => s.open ? { ...s, collection_id: e.currentTarget.value } : s)}
              class="w-full bg-surface-2 rounded-lg px-3 h-9 text-sm font-mono text-ink border border-edge"
            >
              <For each={collections()}>
                {(c) => <option value={c.id}>{c.name}</option>}
              </For>
            </select>
            <input
              autofocus
              placeholder="Name…"
              value={saveState().open ? saveState().name : ""}
              onInput={e => setSaveState(s => s.open ? { ...s, name: e.currentTarget.value } : s)}
              onKeyDown={e => {
                if (e.key === "Enter") confirmSave();
                if (e.key === "Escape") closeSaveModal();
              }}
              class="w-full bg-surface-2 rounded-lg px-3 h-9 text-sm font-mono text-ink outline-none border border-edge focus:border-edge-bright transition-colors placeholder:text-ink-faint"
            />
            <Show when={saveError()}>
              <p class="text-[11px] font-mono text-verb-delete">{saveError()}</p>
            </Show>
            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={confirmSave}
                disabled={saveState().open && (saveState().saving || !saveState().name.trim() || !saveState().collection_id)}
                class="flex-1 h-8 rounded-lg bg-white/5 hover:bg-white/8 text-xs font-mono text-ink transition-colors cursor-pointer disabled:opacity-40"
              >
                {saveState().open && saveState().saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={closeSaveModal}
                class="h-8 px-3 rounded-lg text-xs font-mono text-ink-faint hover:text-ink hover:bg-white/5 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={secretsOpen()}>
        <SecretsPanel
          activeContext={activeContext()}
          onClose={() => setSecretsOpen(false)}
        />
      </Show>

      <Show when={varsOpen()}>
        <VarsPanel onClose={() => setVarsOpen(false)} />
      </Show>

      <Show when={environmentsOpen()}>
        <EnvironmentsPanel
          activeContext={activeContext()}
          onClose={() => setEnvironmentsOpen(false)}
          onContextChange={refreshContext}
        />
      </Show>

      <Show when={importOpen()}>
        <ImportPanel
          activeContext={activeContext()}
          onClose={() => setImportOpen(false)}
          onImported={(result) => {
            refreshContext();
            const r = result.requests;
            flashToast(`Imported ${r} request${r === 1 ? "" : "s"}`);
          }}
        />
      </Show>

      <Toast show={toastShow()} message={toastMessage()} />
    </div>
  );
}
