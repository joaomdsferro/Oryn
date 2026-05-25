import { createSignal, createEffect, createResource, createMemo, For, Index, Show, onCleanup, onMount, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { invoke } from "@tauri-apps/api/core";
import type { LoadRequestPayload, RequestPayload, SecretMeta, VarEntry, Protocol, BodyMode } from "../types";
import CodeEditor from "./CodeEditor";
import RefValueHover, { parseRefName } from "./RefValueHover";
import UrlInput from "./UrlInput";
import TextField from "./TextField";
import { refValueStatus } from "../lib/refTokens";

function currentZoom() {
  const z = parseFloat(document.documentElement.style.zoom);
  return Number.isFinite(z) && z > 0 ? z : 1;
}

type Method = {
  name: string;
  color: string;
};

const METHODS: Method[] = [
  { name: "GET",    color: "text-verb-get" },
  { name: "POST",   color: "text-verb-post" },
  { name: "PUT",    color: "text-verb-put" },
  { name: "PATCH",  color: "text-verb-patch" },
  { name: "DELETE", color: "text-verb-delete" },
];

type ProtocolMeta = {
  id: Protocol | "grpc" | "soap" | "websocket" | "sse";
  label: string;
  color: string;
  implemented: boolean;
};

const PROTOCOLS: ProtocolMeta[] = [
  { id: "rest",      label: "REST",      color: "text-accent",     implemented: true  },
  { id: "graphql",   label: "GraphQL",   color: "text-verb-patch", implemented: true  },
  { id: "grpc",      label: "gRPC",      color: "text-ink-faint",  implemented: false },
  { id: "soap",      label: "SOAP",      color: "text-ink-faint",  implemented: false },
  { id: "websocket", label: "WebSocket", color: "text-ink-faint",  implemented: false },
  { id: "sse",       label: "SSE",       color: "text-ink-faint",  implemented: false },
];

type ParamRow  = { key: string; val: string };
type HeaderRow = { key: string; val: string; mode: "hidden" | "peek" | "full" };

type SectionId = "params" | "headers" | "body" | "auth";

const SECTION_ORDER: SectionId[] = ["params", "headers", "body", "auth"];

const IMPLEMENTED_SECTIONS = new Set<SectionId>(["params", "headers", "body", "auth"]);

type SectionMeta = {
  id: SectionId;
  label: string;
};

const SECTIONS: SectionMeta[] = [
  { id: "params", label: "Params" },
  { id: "headers", label: "Headers" },
  { id: "body", label: "Body" },
  { id: "auth", label: "Auth" },
];

const BODY_MODES: { id: BodyMode; label: string; contentType: string | null }[] = [
  { id: "none", label: "None", contentType: null },
  { id: "json", label: "JSON", contentType: "application/json" },
  { id: "text", label: "Text", contentType: "text/plain" },
  { id: "form", label: "Form", contentType: "application/x-www-form-urlencoded" },
];

type Props = {
  onSend: (req: RequestPayload) => void;
  onSave: (req: RequestPayload) => void;
  onSaveAs: (req: RequestPayload) => void;
  onNew: () => void;
  loading: boolean;
  loadRequest: LoadRequestPayload | null;
  savedRequestId: string | null;
  savedTick?: number;
  onDirtyChange?: (dirty: boolean) => void;
  onDiscard?: () => void;
};

function Chevron(props: { open: boolean }) {
  return (
    <svg
      class="w-2.5 h-2.5 transition-transform duration-200"
      classList={{ "rotate-90": props.open }}
      viewBox="0 0 12 12"
      fill="none"
    >
      <path
        d="M4 2.5L8 6L4 9.5"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

const GHOST_BTN =
  "outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 " +
  "focus-visible:shadow-none transition-colors cursor-pointer";

type AuthType = "none" | "basic" | "bearer" | "apikey";

type SectionVariant = "params" | "headers" | "body";

const SECTION_VARIANT: Record<
  SectionVariant,
  { title: string; accent: string; bar: string; wash: string }
> = {
  params: {
    title: "Params",
    accent: "text-verb-get",
    bar: "bg-verb-get",
    wash: "bg-verb-get/[0.07]",
  },
  headers: {
    title: "Headers",
    accent: "text-verb-put",
    bar: "bg-verb-put",
    wash: "bg-verb-put/[0.07]",
  },
  body: {
    title: "Body",
    accent: "text-verb-post",
    bar: "bg-verb-post",
    wash: "bg-verb-post/[0.07]",
  },
};

function RequestSectionPanel(props: {
  variant: SectionVariant;
  count: number;
  children: JSX.Element;
}) {
  const v = () => SECTION_VARIANT[props.variant];
  return (
    <section class={`rounded-xl border border-edge overflow-hidden ${v().wash}`}>
      <div class="flex items-center gap-2 px-3 py-2 border-b border-edge/80 bg-black/15">
        <span class={`w-1 h-3.5 rounded-full shrink-0 ${v().bar}`} aria-hidden="true" />
        <span class={`text-[11px] font-mono font-semibold tracking-wide ${v().accent}`}>
          {v().title}
        </span>
        <Show when={props.count > 0}>
          <span class={`text-[10px] font-mono tabular-nums ${v().accent} opacity-80`}>
            {props.count}
          </span>
        </Show>
      </div>
      {props.children}
    </section>
  );
}

export default function RequestBar(props: Props) {
  const INSPECTOR_MIN_HEIGHT = 120;
  const INSPECTOR_MAX_HEIGHT = 560;
  const INSPECTOR_VIEWPORT_PADDING = 280;
  const INSPECTOR_HANDLE_HEIGHT = 10;

  const [protocol, setProtocol] = createSignal<Protocol>("rest");
  const [protocolOpen, setProtocolOpen] = createSignal(false);
  const [method, setMethod] = createSignal<Method>(METHODS[0]);
  const [open, setOpen] = createSignal(false);
  const [url, setUrl] = createSignal("");
  const [openSections, setOpenSections] = createSignal<Set<SectionId>>(new Set());
  const [inspectorContentHeight, setInspectorContentHeight] = createSignal(0);
  const [inspectorManualHeight, setInspectorManualHeight] = createSignal<number | null>(null);
  let inspectorContentRef: HTMLDivElement | undefined;
  let inspectorResizeObserver: ResizeObserver | undefined;
  let inspectorDidDrag = false;

  const inspectorMaxHeight = () =>
    Math.max(
      INSPECTOR_MIN_HEIGHT,
      Math.min(INSPECTOR_MAX_HEIGHT, window.innerHeight - INSPECTOR_VIEWPORT_PADDING),
    );
  const clampInspectorHeight = (height: number) =>
    Math.min(inspectorMaxHeight(), Math.max(INSPECTOR_MIN_HEIGHT, Math.round(height)));

  const measureInspectorContent = () => inspectorContentRef?.scrollHeight ?? 0;

  const fittedInspectorHeight = createMemo(() =>
    clampInspectorHeight(inspectorContentHeight() + INSPECTOR_HANDLE_HEIGHT),
  );

  const inspectorHeight = createMemo(() => {
    const manual = inspectorManualHeight();
    if (manual !== null) return clampInspectorHeight(manual);
    return fittedInspectorHeight();
  });

  const updateInspectorContentHeight = () => {
    const h = measureInspectorContent();
    if (h > 0) setInspectorContentHeight(h);
  };

  const shrinkManualInspectorHeight = () => {
    setInspectorManualHeight(prev =>
      prev === null ? null : clampInspectorHeight(Math.min(prev, fittedInspectorHeight())),
    );
  };

  const fitInspectorToContent = () => {
    setInspectorManualHeight(null);
    updateInspectorContentHeight();
  };

  const onInspectorDragStart = (e: MouseEvent) => {
    e.preventDefault();
    inspectorDidDrag = false;
    const startY = e.clientY;
    const startH = inspectorHeight();
    setInspectorManualHeight(startH);
    const onMove = (moveEvent: MouseEvent) => {
      if (Math.abs(moveEvent.clientY - startY) > 2) inspectorDidDrag = true;
      setInspectorManualHeight(clampInspectorHeight(startH + moveEvent.clientY - startY));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onInspectorHandleDblClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (inspectorDidDrag) return;
    fitInspectorToContent();
  };

  const [bodyMode, setBodyMode] = createSignal<BodyMode>("none");
  const [bodyText, setBodyText] = createSignal("");
  const BODY_WRAP_KEY = "request-body-wrap";
  const [bodyWrap, setBodyWrap] = createSignal<boolean>(
    (() => {
      const v = localStorage.getItem(BODY_WRAP_KEY);
      return v === null ? true : v === "1";
    })(),
  );
  createEffect(() => {
    localStorage.setItem(BODY_WRAP_KEY, bodyWrap() ? "1" : "0");
  });
  const [formRows, setFormRows] = createSignal<ParamRow[]>([{ key: "", val: "" }]);
  const [gqlQuery, setGqlQuery] = createSignal("");
  const [gqlVariables, setGqlVariables] = createSignal("");

  const prettifyJson = (raw: string): string | null => {
    const t = raw.trim();
    if (!t) return null;
    try { return JSON.stringify(JSON.parse(t), null, 2); }
    catch { return null; }
  };

  const formatBodyJson = () => {
    const out = prettifyJson(bodyText());
    if (out !== null && out !== bodyText()) setBodyText(out);
  };

  const formatGqlVariables = () => {
    const out = prettifyJson(gqlVariables());
    if (out !== null && out !== gqlVariables()) setGqlVariables(out);
  };

  const bodyJsonFormattable = createMemo(() => prettifyJson(bodyText()) !== null);
  const gqlVariablesFormattable = createMemo(() => prettifyJson(gqlVariables()) !== null);

  const gqlVariablesError = createMemo(() => {
    const raw = gqlVariables().trim();
    if (!raw) return null;
    try { JSON.parse(raw); return null; }
    catch (e) { return (e as Error).message; }
  });

  const protocolMeta = () => PROTOCOLS.find(p => p.id === protocol())!;

  const updateFormRow = (i: number, field: "key" | "val", v: string) =>
    setFormRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: v } : row));
  const removeFormRow = (i: number) => setFormRows(r => r.filter((_, idx) => idx !== i));
  const addFormRow = () => setFormRows(r => [...r, { key: "", val: "" }]);

  const encodeFormBody = () =>
    formRows()
      .filter(r => r.key.trim())
      .map(r => `${encodeURIComponent(r.key.trim())}=${encodeURIComponent(r.val)}`)
      .join("&");

  // Active body section count: number of bytes / form rows / "1" for GraphQL when query present
  const bodyActiveCount = () => {
    if (protocol() === "graphql") return gqlQuery().trim() ? 1 : 0;
    if (bodyMode() === "none") return 0;
    if (bodyMode() === "form") return formRows().filter(r => r.key.trim()).length;
    return bodyText().trim() ? 1 : 0;
  };

  const isSectionOpen = (id: SectionId) => openSections().has(id);
  const openCount = () => openSections().size;
  const hasOpenSections = () => openCount() > 0;

  const toggleSection = (id: SectionId) => {
    if (!IMPLEMENTED_SECTIONS.has(id)) return;
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () =>
    setOpenSections(new Set([...IMPLEMENTED_SECTIONS]));

  const collapseAll = () => setOpenSections(new Set<SectionId>());

  createEffect(() => {
    if (!hasOpenSections()) {
      setInspectorContentHeight(0);
      setInspectorManualHeight(null);
      inspectorResizeObserver?.disconnect();
      inspectorResizeObserver = undefined;
      return;
    }
    const shapeSignature = [
      protocol(),
      [...openSections()].sort().join(","),
      params().length,
      rows().length,
      formRows().length,
      bodyMode(),
      bodyText().length,
      gqlQuery().length,
      gqlVariables().length,
      authType(),
      authApiAddTo(),
    ].join("|");
    void shapeSignature;
    requestAnimationFrame(() => {
      const el = inspectorContentRef;
      if (!el) return;
      updateInspectorContentHeight();
      shrinkManualInspectorHeight();
      inspectorResizeObserver?.disconnect();
      inspectorResizeObserver = new ResizeObserver(() => {
        updateInspectorContentHeight();
        shrinkManualInspectorHeight();
      });
      inspectorResizeObserver.observe(el);
    });
  });

  const blankParam = (): ParamRow => ({ key: "", val: "" });
  const [params, setParams] = createSignal<ParamRow[]>([blankParam()]);
  const updateParam = (i: number, field: "key" | "val", v: string) =>
    setParams(p => p.map((row, idx) => idx === i ? { ...row, [field]: v } : row));
  const removeParam = (i: number) =>
    setParams(p => p.filter((_, idx) => idx !== i));
  const addParam = () => setParams(p => [...p, blankParam()]);
  const paramActiveCount = () => params().filter(p => p.key.trim()).length;

  const blankRow = (): HeaderRow => ({ key: "", val: "", mode: "full" });
  // Headers like Authorization / X-API-Key / Cookie carry credentials and should
  // load masked. Everything else (Content-Type, Accept, User-Agent, ...) is
  // informational and reads better as plain text.
  const SENSITIVE_HEADER_RE = /authorization|cookie|api[-_ ]?key|token|secret|password|x-auth|x-csrf|bearer/i;
  const defaultHeaderMode = (key: string, val: string): HeaderRow["mode"] => {
    if (/^\{\{(\w+)\}\}$/.test(val)) return "full";
    return SENSITIVE_HEADER_RE.test(key) ? "hidden" : "full";
  };
  const [rows, setRows] = createSignal<HeaderRow[]>([blankRow()]);
  type AuthField = "basicUser" | "basicPass" | "bearer" | "apiKey" | "apiValue";
  type ActivePicker =
    | { section: "params" | "headers"; row: number }
    | { section: "auth"; field: AuthField };
  const [activePicker, setActivePicker] = createSignal<ActivePicker | null>(null);
  const [pickerPos, setPickerPos] = createSignal<{ top: number; right: number } | null>(null);
  const [secrets, { refetch: refetchSecrets }] = createResource<SecretMeta[]>(() => invoke<SecretMeta[]>("list_secrets"), { initialValue: [] });
  const [vars, { refetch: refetchVars }] = createResource<VarEntry[]>(() => invoke<VarEntry[]>("list_vars"), { initialValue: [] });
  const secretNames = createMemo(() => new Set((secrets() ?? []).map((s: SecretMeta) => s.name)));
  const varNames = createMemo(() => new Set((vars() ?? []).map((v: VarEntry) => v.name)));
  const valStatus = (val: string, key: string) => refValueStatus(val, key, secretNames(), varNames());
  const [authType, setAuthType] = createSignal<AuthType>("none");
  const [authBasicUser, setAuthBasicUser] = createSignal("");
  const [authBasicPass, setAuthBasicPass] = createSignal("");
  const [authBasicPassVisible, setAuthBasicPassVisible] = createSignal(false);
  const [authBearerToken, setAuthBearerToken] = createSignal("");
  const [authApiKey, setAuthApiKey] = createSignal("X-API-Key");
  const [authApiValue, setAuthApiValue] = createSignal("");
  const [authApiAddTo, setAuthApiAddTo] = createSignal<"header" | "query">("header");

  const authFieldValue = (f: AuthField): string => {
    switch (f) {
      case "basicUser": return authBasicUser();
      case "basicPass": return authBasicPass();
      case "bearer":    return authBearerToken();
      case "apiKey":    return authApiKey();
      case "apiValue":  return authApiValue();
    }
  };
  const setAuthFieldValue = (f: AuthField, val: string) => {
    switch (f) {
      case "basicUser": setAuthBasicUser(val); return;
      case "basicPass": setAuthBasicPass(val); return;
      case "bearer":    setAuthBearerToken(val); return;
      case "apiKey":    setAuthApiKey(val); return;
      case "apiValue":  setAuthApiValue(val); return;
    }
  };

  const openAuthPicker = (field: AuthField) => (e: MouseEvent) => {
    e.stopPropagation();
    const cur = activePicker();
    if (cur?.section === "auth" && cur.field === field) { setActivePicker(null); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const z = currentZoom();
    setPickerPos({ top: rect.bottom / z + 4, right: window.innerWidth / z - rect.right / z });
    refetchSecrets();
    refetchVars();
    setActivePicker({ section: "auth", field });
  };

  const AuthPickerBtn = (props: { field: AuthField }) => {
    const isOpen = () => {
      const p = activePicker();
      return p?.section === "auth" && p.field === props.field;
    };
    const status = () => valStatus(authFieldValue(props.field), "");
    return (
      <button
        type="button"
        title="Insert secret or variable reference"
        onClick={openAuthPicker(props.field)}
        class="w-7 h-7 flex items-center justify-center rounded transition-colors cursor-pointer shrink-0"
        classList={{
          "text-accent bg-white/5": isOpen(),
          "text-verb-get": !isOpen() && status() === "secret-ok",
          "text-accent":   !isOpen() && status() === "var-ok",
          "text-amber-400": !isOpen() && status() === "ref-missing",
          "text-ink-faint hover:text-ink hover:bg-white/5":
            !isOpen() && status() !== "secret-ok" && status() !== "var-ok" && status() !== "ref-missing",
        }}
      >
        <svg viewBox="0 0 12 12" class="w-3 h-3" fill="none">
          <rect x="3" y="6" width="6" height="4.5" rx="0.8" stroke="currentColor" stroke-width="1.2" />
          <path d="M4.5 6V4.2C4.5 3.2 5.2 2.5 6 2.5C6.8 2.5 7.5 3.2 7.5 4.2V6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        </svg>
      </button>
    );
  };

  const resetAuth = () => {
    setAuthType("none");
    setAuthBasicUser("");
    setAuthBasicPass("");
    setAuthBasicPassVisible(false);
    setAuthBearerToken("");
    setAuthApiKey("X-API-Key");
    setAuthApiValue("");
    setAuthApiAddTo("header");
  };

  const computeAuthHeaders = (): [string, string][] => {
    switch (authType()) {
      case "basic": {
        const p = authBasicPass().trim();
        if (!p) return [];
        return [["Authorization", `Basic ${btoa(`${authBasicUser().trim()}:${p}`)}`]];
      }
      case "bearer": {
        const t = authBearerToken().trim();
        return t ? [["Authorization", `Bearer ${t}`]] : [];
      }
      case "apikey": {
        const k = authApiKey().trim();
        const v = authApiValue().trim();
        return k && v && authApiAddTo() === "header" ? [[k, v]] : [];
      }
      default:
        return [];
    }
  };

  let menuWrap: HTMLDivElement | undefined;
  let saveMenuWrap: HTMLDivElement | undefined;
  const [saveMenuOpen, setSaveMenuOpen] = createSignal(false);
  let discardWrap: HTMLDivElement | undefined;
  const [discardConfirmOpen, setDiscardConfirmOpen] = createSignal(false);

  const updateRow = (i: number, field: "key" | "val", v: string) =>
    setRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: v } : row));
  const updateMode = (i: number, mode: HeaderRow["mode"]) =>
    setRows(r => r.map((row, idx) => idx === i ? { ...row, mode } : row));
  const removeRow = (i: number) =>
    setRows(r => r.filter((_, idx) => idx !== i));
  const addRow = () => setRows(r => [...r, blankRow()]);
  const headerActiveCount = () => rows().filter(r => r.key.trim()).length;

  const sectionCount = (id: SectionId) => {
    if (id === "params") return paramActiveCount();
    if (id === "headers") return headerActiveCount();
    if (id === "body") return bodyActiveCount();
    if (id === "auth") return authType() !== "none" ? 1 : 0;
    return 0;
  };

  const buildReq = (): RequestPayload => {
    let rawParams = params().filter(p => p.key.trim()).map(p => [p.key.trim(), p.val] as [string, string]);
    let rawHeaders = rows().filter(r => r.key.trim()).map(r => [r.key.trim(), r.val] as [string, string]);
    const authHdrs = computeAuthHeaders();
    if (authHdrs.length > 0) {
      rawHeaders = rawHeaders.filter(([k]) => k.toLowerCase() !== "authorization" && k.toLowerCase() !== authApiKey().trim().toLowerCase());
      rawHeaders = [...authHdrs, ...rawHeaders];
    }
    if (authType() === "apikey" && authApiAddTo() === "query") {
      const k = authApiKey().trim();
      const v = authApiValue().trim();
      if (k && v) rawParams = [[k, v], ...rawParams];
    }

    let body: string | null = null;
    let sendMethod = method().name;

    if (protocol() === "graphql") {
      const q = gqlQuery();
      const vRaw = gqlVariables().trim();
      if (sendMethod === "GET") {
        const gqlParams: [string, string][] = [["query", q]];
        if (vRaw) {
          let parsedVars: unknown = {};
          try { parsedVars = JSON.parse(vRaw); } catch { /* send empty object */ }
          gqlParams.push(["variables", JSON.stringify(parsedVars)]);
        }
        rawParams = [...gqlParams, ...rawParams];
      } else {
        sendMethod = "POST";
        let gqlVars: unknown = {};
        if (vRaw) {
          try { gqlVars = JSON.parse(vRaw); }
          catch { gqlVars = {}; }
        }
        body = JSON.stringify({ query: q, variables: gqlVars });
        if (!rawHeaders.some(([k]) => k.toLowerCase() === "content-type")) {
          rawHeaders = [["Content-Type", "application/json"], ...rawHeaders];
        }
      }
    } else {
      const mode = bodyMode();
      if (mode === "json" || mode === "text") {
        const t = bodyText();
        if (t) body = t;
      } else if (mode === "form") {
        const enc = encodeFormBody();
        if (enc) body = enc;
      }
      const meta = BODY_MODES.find(m => m.id === mode);
      if (body && meta?.contentType && !rawHeaders.some(([k]) => k.toLowerCase() === "content-type")) {
        rawHeaders = [["Content-Type", meta.contentType], ...rawHeaders];
      }
    }

    const rawUrl = url().trim();
    const normalizedUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

    return {
      protocol: protocol(),
      method: sendMethod,
      url: normalizedUrl,
      params: rawParams,
      headers: rawHeaders,
      body,
      body_mode: bodyMode(),
      graphql_query: gqlQuery(),
      graphql_variables: gqlVariables(),
    };
  };

  const [baseline, setBaseline] = createSignal<string>("");
  const dirty = createMemo(() => {
    if (!props.savedRequestId) return false;
    const b = baseline();
    if (!b) return false;
    return JSON.stringify(buildReq()) !== b;
  });
  createEffect(() => {
    props.onDirtyChange?.(dirty());
  });

  const handleSend = () => {
    const u = url().trim();
    if (!u || props.loading) return;
    props.onSend(buildReq());
  };

  const handleSave = () => {
    if (!url().trim()) return;
    const req = buildReq();
    if (props.savedRequestId) {
      props.onSave(req);
    } else {
      props.onSaveAs(req);
    }
  };

  const handleSaveAs = () => {
    if (!url().trim()) return;
    setSaveMenuOpen(false);
    props.onSaveAs(buildReq());
  };

  let protocolWrap: HTMLDivElement | undefined;

  const handleNew = () => {
    setProtocol("rest");
    setMethod(METHODS[0]);
    setUrl("");
    setParams([blankParam()]);
    setRows([blankRow()]);
    setBodyMode("none");
    setBodyText("");
    setFormRows([{ key: "", val: "" }]);
    setGqlQuery("");
    setGqlVariables("");
    setOpenSections(new Set<SectionId>());
    setInspectorContentHeight(0);
    setInspectorManualHeight(null);
    setActivePicker(null);
    setSaveMenuOpen(false);
    resetAuth();
    props.onNew();
  };

  createEffect(() => {
    const req = props.loadRequest;
    if (!req) return;
    setProtocol((req.protocol as Protocol) ?? "rest");
    const m = METHODS.find(m => m.name === req.method) ?? METHODS[0];
    setMethod(m);
    setUrl(req.url);
    setParams(req.params.length ? req.params.map(([k, v]) => ({ key: k, val: v })) : [blankParam()]);
    setRows(req.headers.length ? req.headers.map(([k, v]) => ({ key: k, val: v, mode: defaultHeaderMode(k, v) })) : [blankRow()]);
    setBodyMode((req.body_mode as BodyMode) ?? "none");
    if (req.body_mode === "form" && req.body) {
      const decoded = req.body.split("&").filter(Boolean).map(p => {
        const [k, v = ""] = p.split("=");
        return { key: decodeURIComponent(k ?? ""), val: decodeURIComponent(v) };
      });
      setFormRows(decoded.length ? decoded : [{ key: "", val: "" }]);
      setBodyText("");
    } else {
      setBodyText(req.body ?? "");
      setFormRows([{ key: "", val: "" }]);
    }
    setGqlQuery(req.graphql_query ?? "");
    setGqlVariables(req.graphql_variables ?? "");
    resetAuth();
    queueMicrotask(() => setBaseline(JSON.stringify(buildReq())));
  });

  // When the parent confirms a successful inline save, snapshot the current
  // form state as the new baseline so the dirty flag clears.
  createEffect(() => {
    const tick = props.savedTick;
    if (tick === undefined) return;
    if (!props.savedRequestId) return;
    queueMicrotask(() => setBaseline(JSON.stringify(buildReq())));
  });

  // No saved id → no baseline, no dirty state.
  createEffect(() => {
    if (!props.savedRequestId) setBaseline("");
  });

  const onDocMouseDown = (e: MouseEvent) => {
    if (menuWrap && !menuWrap.contains(e.target as Node)) setOpen(false);
    if (saveMenuWrap && !saveMenuWrap.contains(e.target as Node)) setSaveMenuOpen(false);
    if (discardWrap && !discardWrap.contains(e.target as Node)) setDiscardConfirmOpen(false);
    if (protocolWrap && !protocolWrap.contains(e.target as Node)) setProtocolOpen(false);
  };

  onMount(() => {
    document.addEventListener("mousedown", onDocMouseDown);
    const onGlobalSave = () => handleSave();
    window.addEventListener("oryn:save-request", onGlobalSave);
    onCleanup(() => window.removeEventListener("oryn:save-request", onGlobalSave));
    const onResize = () => {
      setInspectorManualHeight(h => (h === null ? null : clampInspectorHeight(h)));
      requestAnimationFrame(() => {
        updateInspectorContentHeight();
        shrinkManualInspectorHeight();
      });
    };
    window.addEventListener("resize", onResize);
    onCleanup(() => document.removeEventListener("mousedown", onDocMouseDown));
    onCleanup(() => window.removeEventListener("resize", onResize));
  });

  return (
    <div class="w-2/3 max-w-4xl flex flex-col gap-1.5">
      <div class="relative group">
        <div
          aria-hidden="true"
          class="pointer-events-none absolute -inset-4 rounded-3xl
                 bg-[radial-gradient(60%_60%_at_50%_50%,rgba(107,158,255,0.18),rgba(107,158,255,0)_70%)]
                 opacity-100 blur-xl"
        />

        <div
          class="relative flex items-stretch h-12 rounded-2xl
                 bg-surface-1 border
                 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03),0_10px_30px_-12px_rgba(0,0,0,0.7)]
                 transition-colors duration-300"
          classList={{
            "border-edge group-focus-within:border-edge-bright": !props.savedRequestId,
            "border-verb-get/45 group-focus-within:border-verb-get/70": !!props.savedRequestId && !dirty(),
            "border-amber-400/60 group-focus-within:border-amber-300": !!props.savedRequestId && dirty(),
          }}
        >
          <div ref={protocolWrap} class="relative flex items-stretch">
            <button
              type="button"
              onClick={() => setProtocolOpen(!protocolOpen())}
              class="flex items-center gap-2 pl-4 pr-3 rounded-l-2xl
                     text-[10px] font-semibold tracking-[0.12em] uppercase
                     hover:bg-white/2.5 transition-colors cursor-pointer"
            >
              <span class={protocolMeta().color}>{protocolMeta().label}</span>
              <svg
                class="w-3 h-3 text-ink-faint transition-transform duration-200"
                classList={{ "rotate-180": protocolOpen() }}
                viewBox="0 0 12 12"
                fill="none"
              >
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>

            {protocolOpen() && (
              <div
                class="absolute top-[calc(100%+6px)] left-0 w-40 z-20
                       rounded-xl border border-edge bg-surface-1
                       shadow-[0_12px_32px_-8px_rgba(0,0,0,0.6)]
                       py-1"
              >
                <For each={PROTOCOLS}>
                  {(p) => (
                    <button
                      type="button"
                      disabled={!p.implemented}
                      onClick={() => {
                        if (!p.implemented) return;
                        setProtocol(p.id as Protocol);
                        if (p.id === "graphql" && !["GET", "POST"].includes(method().name)) {
                          setMethod(METHODS.find(m => m.name === "POST")!);
                        }
                        setProtocolOpen(false);
                      }}
                      class="w-full flex items-center justify-between px-3 py-1.5
                             text-[11px] font-semibold tracking-[0.12em] uppercase
                             transition-colors"
                      classList={{
                        "hover:bg-white/4 cursor-pointer": p.implemented,
                        "opacity-40 cursor-not-allowed": !p.implemented,
                      }}
                    >
                      <span class={p.color}>{p.label}</span>
                      <Show when={!p.implemented}>
                        <span class="text-[9px] font-mono text-ink-faint normal-case tracking-normal">soon</span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            )}
          </div>

          <div class="w-px self-stretch my-2 bg-edge" />

          <div ref={menuWrap} class="relative flex items-stretch">
            <button
              type="button"
              onClick={() => setOpen(!open())}
              class="flex items-center gap-2 px-3
                     text-[11px] font-semibold tracking-[0.12em]
                     hover:bg-white/2.5 transition-colors cursor-pointer"
            >
              <span class={method().color}>{method().name}</span>
              <svg
                class="w-3 h-3 text-ink-faint transition-transform duration-200"
                classList={{ "rotate-180": open() }}
                viewBox="0 0 12 12"
                fill="none"
              >
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>

            {open() && (
              <div
                class="absolute top-[calc(100%+6px)] left-0 w-32 z-20
                       rounded-xl border border-edge bg-surface-1
                       shadow-[0_12px_32px_-8px_rgba(0,0,0,0.6)]
                       py-1"
              >
                <For each={protocol() === "graphql" ? METHODS.filter(m => m.name === "GET" || m.name === "POST") : METHODS}>
                  {(m) => (
                    <button
                      type="button"
                      onClick={() => {
                        setMethod(m);
                        setOpen(false);
                      }}
                      class="w-full flex items-center px-3 py-1.5
                             text-[11px] font-semibold tracking-[0.12em]
                             hover:bg-white/4 transition-colors cursor-pointer"
                    >
                      <span class={m.color}>{m.name}</span>
                    </button>
                  )}
                </For>
              </div>
            )}
          </div>

          <div class="w-px self-stretch my-2 bg-edge" />

          <div class="flex-1 flex items-center p-1">
            <div
              class="flex-1 h-full flex items-center px-3 rounded-lg
                     bg-surface-2
                     shadow-[inset_0_1px_2px_0_rgba(0,0,0,0.5),inset_0_-1px_0_0_rgba(255,255,255,0.02)]"
            >
              <UrlInput
                value={url()}
                onInput={setUrl}
                onEnter={handleSend}
                vars={vars() ?? []}
                secrets={secrets() ?? []}
                placeholder="https://"
              />
              <span
                aria-hidden="true"
                title="Ctrl+Enter to send"
                class="ml-2 select-none px-1.5 py-0.5 rounded
                       text-[10px] font-mono text-ink-mute
                       bg-white/5 border border-edge
                       opacity-0 group-focus-within:opacity-100
                       transition-opacity duration-200"
              >
                ⌃↵
              </span>
            </div>
          </div>

          {(() => {
            const status = () =>
              !props.savedRequestId ? "unsaved" :
              dirty()              ? "modified" :
                                      "saved";
            const label = () =>
              status() === "unsaved"  ? "Unsaved" :
              status() === "modified" ? "Modified" :
                                         "Saved";
            const tooltip = () =>
              status() === "unsaved"  ? "Not yet saved" :
              status() === "modified" ? "Unsaved changes" :
                                         "Saved";
            return (
              <div
                class="self-center mr-1 flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-widest border transition-colors"
                classList={{
                  "text-ink-faint bg-white/4 border-edge": status() === "unsaved",
                  "text-verb-get bg-verb-get/10 border-verb-get/30": status() === "saved",
                  "text-amber-400 bg-amber-400/10 border-amber-400/40": status() === "modified",
                }}
                title={tooltip()}
              >
                <span
                  aria-hidden="true"
                  class="w-1.5 h-1.5 rounded-full"
                  classList={{
                    "bg-ink-faint": status() === "unsaved",
                    "bg-verb-get shadow-[0_0_4px_rgba(74,222,128,0.6)]": status() === "saved",
                    "bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.7)] animate-pulse": status() === "modified",
                  }}
                />
                {label()}
              </div>
            );
          })()}

          <Show when={!!props.savedRequestId && dirty()}>
            <div ref={discardWrap} class="relative self-center mr-1">
              <button
                type="button"
                title="Discard changes"
                aria-label="Discard changes"
                onClick={() => setDiscardConfirmOpen(o => !o)}
                class="w-5 h-5 flex items-center justify-center rounded
                       text-ink-faint hover:text-amber-300 hover:bg-amber-400/10
                       transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 12 12" class="w-2.5 h-2.5" fill="none">
                  <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                </svg>
              </button>
              <Show when={discardConfirmOpen()}>
                <div
                  role="dialog"
                  class="absolute top-[calc(100%+8px)] right-0 z-30 w-56
                         rounded-xl border border-edge bg-surface-1
                         shadow-[0_16px_40px_-8px_rgba(0,0,0,0.7)]
                         p-3 space-y-2.5"
                >
                  <p class="text-[11px] font-mono text-ink leading-snug">
                    Discard unsaved changes?
                  </p>
                  <p class="text-[10px] font-mono text-ink-faint leading-snug">
                    Reverts to the last saved version. This can't be undone.
                  </p>
                  <div class="flex items-center justify-end gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setDiscardConfirmOpen(false)}
                      class="px-2 py-1 rounded-md text-[10px] font-mono
                             text-ink-faint hover:text-ink hover:bg-white/4
                             transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDiscardConfirmOpen(false);
                        props.onDiscard?.();
                      }}
                      class="px-2 py-1 rounded-md text-[10px] font-mono
                             text-amber-400 hover:text-amber-300
                             bg-amber-400/10 hover:bg-amber-400/15
                             border border-amber-400/40
                             transition-colors cursor-pointer"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              </Show>
            </div>
          </Show>

          <div ref={saveMenuWrap} class="relative flex items-stretch">
            <button
              type="button"
              aria-label={
                props.savedRequestId
                  ? (dirty() ? "Save changes" : "Saved")
                  : "Save request"
              }
              title={
                props.savedRequestId
                  ? (dirty() ? "Unsaved changes — click to save" : "Saved")
                  : "Save request"
              }
              onClick={handleSave}
              class="relative flex items-center justify-center w-7
                     hover:bg-white/2.5 transition-colors cursor-pointer"
              classList={{
                "text-ink-faint hover:text-ink": !props.savedRequestId,
                "text-verb-get/70 hover:text-verb-get": !!props.savedRequestId && !dirty(),
                "text-amber-400 hover:text-amber-300": !!props.savedRequestId && dirty(),
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3" />
                <rect x="4" y="1.5" width="6" height="4" rx="0.5" stroke="currentColor" stroke-width="1.3" />
                <rect x="3" y="7.5" width="8" height="5" rx="0.5" stroke="currentColor" stroke-width="1.3" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="More save options"
              onClick={() => setSaveMenuOpen(o => !o)}
              class="flex items-center justify-center w-3.5 pr-0.5
                     text-ink-faint hover:text-ink hover:bg-white/2.5
                     transition-colors cursor-pointer"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1.5 3L4 5.5L6.5 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <Show when={saveMenuOpen()}>
              <div class="absolute top-[calc(100%+6px)] right-0 z-20 w-28
                          rounded-xl border border-edge bg-surface-1
                          shadow-[0_12px_32px_-8px_rgba(0,0,0,0.6)] py-1">
                <button
                  type="button"
                  onClick={handleSaveAs}
                  class="w-full flex items-center px-3 py-1.5
                         text-[11px] font-mono text-ink-faint hover:text-ink hover:bg-white/4
                         transition-colors cursor-pointer"
                >
                  Save as…
                </button>
              </div>
            </Show>
          </div>

          <button
            type="button"
            aria-label="Send request"
            onClick={handleSend}
            disabled={props.loading}
            class="group/send flex items-center justify-center w-12 rounded-r-2xl
                   text-ink-mute hover:text-accent hover:bg-white/2.5
                   transition-colors cursor-pointer
                   disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {props.loading
              ? <svg class="w-4 h-4 animate-spin" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4" stroke-dasharray="28" stroke-dashoffset="10" />
                </svg>
              : <svg class="w-4 h-4 transition-transform duration-200 group-hover/send:translate-x-0.5" viewBox="0 0 16 16" fill="none">
                  <path d="M2.5 8H13.5M13.5 8L9 3.5M13.5 8L9 12.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
            }
          </button>
        </div>
      </div>

      {/* Section chips + expand/collapse */}
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1 flex-wrap">
          <For each={SECTIONS.filter(s => IMPLEMENTED_SECTIONS.has(s.id))}>
            {(section) => (
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                class={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-mono ${GHOST_BTN}`}
                classList={{
                  "text-ink bg-white/5": isSectionOpen(section.id),
                  "text-ink-faint hover:text-ink hover:bg-white/4": !isSectionOpen(section.id),
                }}
              >
                <Chevron open={isSectionOpen(section.id)} />
                {section.label}
                <Show when={sectionCount(section.id) > 0}>
                  <span class={section.id === "auth" ? "text-purple-400 text-[10px]" : "text-accent"}>
                    {section.id === "auth" ? authType() : sectionCount(section.id)}
                  </span>
                </Show>
              </button>
            )}
          </For>
        </div>

        <div class="flex items-center gap-1 shrink-0">
          <button
            type="button"
            title="New request"
            onClick={handleNew}
            class={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono text-ink-faint
                    hover:text-ink hover:bg-white/4 ${GHOST_BTN}`}
          >
            <svg viewBox="0 0 12 12" class="w-2.5 h-2.5" fill="none">
              <path d="M6 1.5V10.5M1.5 6H10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
            New
          </button>
          <span class="text-ink-faint/40 text-[10px]">·</span>
          <button
            type="button"
            title="Open all request sections"
            onClick={expandAll}
            class={`px-2 py-1 rounded-lg text-[10px] font-mono text-ink-faint
                    hover:text-ink hover:bg-white/4 ${GHOST_BTN}`}
          >
            Expand all
          </button>
          <Show when={hasOpenSections()}>
            <span class="text-ink-faint/40 text-[10px]">·</span>
            <button
              type="button"
              onClick={collapseAll}
              class={`px-2 py-1 rounded-lg text-[10px] font-mono text-ink-faint
                      hover:text-ink hover:bg-white/4 ${GHOST_BTN}`}
            >
              Collapse all
            </button>
          </Show>
        </div>
      </div>

      {/* Inspector — open sections stacked */}
      <Show when={hasOpenSections()}>
        <div
          style={{ height: `${inspectorHeight()}px` }}
          class="flex flex-col rounded-2xl bg-surface-1 border border-edge overflow-hidden
                 animate-[slide-down_0.15s_ease-out]"
        >
        <div class="flex-1 min-h-0 overflow-y-auto">
        <div ref={inspectorContentRef} class="p-2 space-y-2">
          <For each={SECTION_ORDER.filter(id => IMPLEMENTED_SECTIONS.has(id) && isSectionOpen(id))}>
            {(sectionId) => (
              <>
                <Show when={sectionId === "params"}>
                  <RequestSectionPanel variant="params" count={paramActiveCount()}>
                    <Index each={params()}>
                      {(param, i) => {
                        const paramStatus = () => valStatus(param().val, param().key);
                        const paramRefName = () => parseRefName(param().val);
                        const isParamRef = () =>
                          (paramStatus() === "secret-ok" || paramStatus() === "var-ok") && !!paramRefName();
                        const paramValueClass = () =>
                          paramStatus() === "secret-ok"   ? "text-verb-get" :
                          paramStatus() === "var-ok"      ? "text-accent" :
                          paramStatus() === "ref-missing" ? "text-amber-400" :
                          "text-ink";
                        const paramValueInput = (
                          <TextField
                            placeholder="Value"
                            value={param().val}
                            onInput={v => updateParam(i, "val", v)}
                            class={`w-full bg-transparent text-xs font-mono outline-none placeholder:text-ink-faint ${paramValueClass()}`}
                          />
                        );
                        return (
                        <div class="flex items-center gap-1.5 px-3 h-9 border-b border-edge last:border-b-0">
                          <TextField
                            placeholder="Key"
                            value={param().key}
                            onInput={v => updateParam(i, "key", v)}
                            class="w-2/5 bg-transparent text-xs font-mono text-ink-mute outline-none
                                   placeholder:text-ink-faint shrink-0"
                          />
                          <div class="w-px h-4 bg-edge shrink-0" />
                          <Show
                            when={isParamRef()}
                            fallback={<div class="flex-1 min-w-0">{paramValueInput}</div>}
                          >
                            <RefValueHover
                              kind={paramStatus() === "secret-ok" ? "secret" : "var"}
                              refName={paramRefName()!}
                              vars={vars() ?? []}
                              secrets={secrets() ?? []}
                            >
                              {paramValueInput}
                            </RefValueHover>
                          </Show>
                          <button
                            type="button"
                            title="Insert secret or variable reference"
                            onClick={e => {
                              e.stopPropagation();
                              const cur = activePicker();
                              if (cur?.section === "params" && cur.row === i) { setActivePicker(null); return; }
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              const z = currentZoom();
                              setPickerPos({ top: rect.bottom / z + 4, right: window.innerWidth / z - rect.right / z });
                              refetchSecrets();
                              refetchVars();
                              setActivePicker({ section: "params", row: i });
                            }}
                            class={`w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer shrink-0 ${
                              (() => { const ap = activePicker(); return ap?.section === "params" && ap.row === i; })() ? "text-accent bg-white/5" :
                              valStatus(param().val, param().key) === "secret-ok"               ? "text-verb-get" :
                              valStatus(param().val, param().key) === "var-ok"                  ? "text-accent" :
                              valStatus(param().val, param().key) === "ref-missing"             ? "text-amber-400" :
                              "text-ink-faint hover:text-ink hover:bg-white/5"
                            }`}
                          >
                            <svg viewBox="0 0 12 12" class="w-3 h-3" fill="none">
                              <rect x="3" y="6" width="6" height="4.5" rx="0.8" stroke="currentColor" stroke-width="1.2" />
                              <path d="M4.5 6V4.2C4.5 3.2 5.2 2.5 6 2.5C6.8 2.5 7.5 3.2 7.5 4.2V6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeParam(i)}
                            class="w-5 h-5 flex items-center justify-center rounded
                                   text-ink-faint hover:text-verb-delete hover:bg-white/5
                                   transition-colors cursor-pointer shrink-0"
                          >
                            <svg viewBox="0 0 12 12" class="w-2.5 h-2.5" fill="none">
                              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                            </svg>
                          </button>
                        </div>
                        );
                      }}
                    </Index>
                    <button
                      type="button"
                      onClick={addParam}
                      class="w-full h-8 text-[11px] font-mono text-ink-faint hover:text-ink
                             hover:bg-white/3 transition-colors cursor-pointer"
                    >
                      + Add param
                    </button>
                  </RequestSectionPanel>
                </Show>

                <Show when={sectionId === "headers"}>
                  <RequestSectionPanel variant="headers" count={headerActiveCount()}>
                    <Index each={rows()}>
                      {(row, i) => {
                        const rowStatus = () => valStatus(row().val, row().key);
                        const rowRefName = () => parseRefName(row().val);
                        const isLoadedRef = () =>
                          (rowStatus() === "secret-ok" || rowStatus() === "var-ok") && !!rowRefName();
                        const valueClass = () =>
                          rowStatus() === "secret-ok"   ? "text-verb-get" :
                          rowStatus() === "var-ok"      ? "text-accent" :
                          rowStatus() === "ref-missing" ? "text-amber-400" :
                          rowStatus() === "warn"        ? "text-amber-300" :
                          "text-ink";
                        const valueInput = (
                          <TextField
                            type={isLoadedRef() ? "text" : row().mode === "full" ? "text" : "password"}
                            placeholder="Value"
                            value={row().val}
                            onInput={v => updateRow(i, "val", v)}
                            class={`w-full bg-transparent text-xs font-mono outline-none placeholder:text-ink-faint ${valueClass()}`}
                          />
                        );
                        return (
                        <div class="relative flex items-center gap-1.5 px-3 h-9 border-b border-edge last:border-b-0">
                          <TextField
                            placeholder="Key"
                            value={row().key}
                            onInput={v => updateRow(i, "key", v)}
                            class="w-2/5 bg-transparent text-xs font-mono text-ink-mute outline-none
                                   placeholder:text-ink-faint shrink-0"
                          />
                          <div class="w-px h-4 bg-edge shrink-0" />

                          <Show
                            when={isLoadedRef()}
                            fallback={
                              <div class="flex-1 min-w-0 flex items-center overflow-hidden">
                                {valueInput}
                              </div>
                            }
                          >
                            <RefValueHover
                              kind={rowStatus() === "secret-ok" ? "secret" : "var"}
                              refName={rowRefName()!}
                              vars={vars() ?? []}
                              secrets={secrets() ?? []}
                            >
                              {valueInput}
                            </RefValueHover>
                          </Show>

                          {/* Secret / variable reference picker */}
                          <div class="relative shrink-0">
                            <button
                              type="button"
                              title={
                                valStatus(row().val, row().key) === "warn"
                                  ? "Looks like a raw secret — store it in Secrets instead"
                                  : "Insert secret or variable reference"
                              }
                              onClick={e => {
                                e.stopPropagation();
                                const cur = activePicker();
                                if (cur?.section === "headers" && cur.row === i) { setActivePicker(null); return; }
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const z = currentZoom();
                                setPickerPos({ top: rect.bottom / z + 4, right: window.innerWidth / z - rect.right / z });
                                refetchSecrets();
                                refetchVars();
                                setActivePicker({ section: "headers", row: i });
                              }}
                              class={`w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer ${
                                (() => { const ap = activePicker(); return ap?.section === "headers" && ap.row === i; })() ? "text-accent bg-white/5" :
                                valStatus(row().val, row().key) === "secret-ok"                    ? "text-verb-get" :
                                valStatus(row().val, row().key) === "var-ok"                       ? "text-accent" :
                                valStatus(row().val, row().key) === "ref-missing"                  ? "text-amber-400" :
                                valStatus(row().val, row().key) === "warn"                         ? "text-amber-400" :
                                "text-ink-faint hover:text-ink hover:bg-white/5"
                              }`}
                            >
                              <svg viewBox="0 0 12 12" class="w-3 h-3" fill="none">
                                <rect x="3" y="6" width="6" height="4.5" rx="0.8" stroke="currentColor" stroke-width="1.2" />
                                <path d="M4.5 6V4.2C4.5 3.2 5.2 2.5 6 2.5C6.8 2.5 7.5 3.2 7.5 4.2V6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                              </svg>
                            </button>

                          </div>

                          <Show when={!isLoadedRef()}>
                            <button
                              type="button"
                              title="Peek"
                              onClick={() => updateMode(i, row().mode === "peek" ? "hidden" : "peek")}
                              class="w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer shrink-0"
                              classList={{ "text-accent": row().mode === "peek", "text-ink-faint hover:text-ink hover:bg-white/5": row().mode !== "peek" }}
                            >
                              <svg viewBox="0 0 12 12" class="w-3 h-3" fill="none">
                                <circle cx="5" cy="5" r="3" stroke="currentColor" stroke-width="1.3" />
                                <path d="M7.5 7.5L10.5 10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                              </svg>
                            </button>

                            <button
                              type="button"
                              title={row().mode === "full" ? "Hide value" : "Show value"}
                              onClick={() => updateMode(i, row().mode === "full" ? "hidden" : "full")}
                              class="w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer shrink-0"
                              classList={{ "text-accent": row().mode !== "full", "text-ink-faint hover:text-ink hover:bg-white/5": row().mode === "full" }}
                            >
                              <Show
                                when={row().mode === "full"}
                                fallback={
                                  <svg viewBox="0 0 12 12" class="w-3 h-3" fill="none">
                                    <path d="M1 1L11 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                                    <path d="M5 3.1C5.3 3 5.6 3 6 3C9 3 11 6 11 6C10.6 6.7 9.9 7.5 9 8.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                                    <path d="M3 4.3C2 5 1 6 1 6C1 6 3 9 6 9C6.8 9 7.5 8.8 8 8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                                  </svg>
                                }
                              >
                                <svg viewBox="0 0 12 12" class="w-3 h-3" fill="none">
                                  <path d="M1 6C1 6 3 3 6 3C9 3 11 6 11 6C11 6 9 9 6 9C3 9 1 6 1 6Z" stroke="currentColor" stroke-width="1.3" />
                                  <circle cx="6" cy="6" r="1.5" stroke="currentColor" stroke-width="1.3" />
                                </svg>
                              </Show>
                            </button>
                          </Show>

                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            class="w-5 h-5 flex items-center justify-center rounded
                                   text-ink-faint hover:text-verb-delete hover:bg-white/5
                                   transition-colors cursor-pointer shrink-0"
                          >
                            <svg viewBox="0 0 12 12" class="w-2.5 h-2.5" fill="none">
                              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                            </svg>
                          </button>
                        </div>
                        );
                      }}
                    </Index>
                    <button
                      type="button"
                      onClick={addRow}
                      class="w-full h-8 text-[11px] font-mono text-ink-faint hover:text-ink
                             hover:bg-white/3 transition-colors cursor-pointer"
                    >
                      + Add header
                    </button>
                  </RequestSectionPanel>
                </Show>

                <Show when={sectionId === "body"}>
                  <RequestSectionPanel variant="body" count={bodyActiveCount()}>
                    <div class="p-3 space-y-2.5">
                      <Show
                        when={protocol() === "graphql"}
                        fallback={
                          <>
                            {/* Mode selector */}
                            <div class="flex items-center gap-3">
                              <span class="text-[10px] font-mono text-ink-faint w-16 shrink-0">Type</span>
                              <div class="flex gap-1">
                                <For each={BODY_MODES}>
                                  {(m) => (
                                    <button
                                      type="button"
                                      onClick={() => setBodyMode(m.id)}
                                      class="px-2 py-0.5 rounded-md text-[11px] font-mono transition-colors cursor-pointer border"
                                      classList={{
                                        "bg-verb-post/20 text-verb-post border-verb-post/40": bodyMode() === m.id,
                                        "text-ink-faint hover:text-ink hover:bg-white/4 border-transparent": bodyMode() !== m.id,
                                      }}
                                    >{m.label}</button>
                                  )}
                                </For>
                              </div>
                              <Show when={bodyMode() === "json"}>
                                <button
                                  type="button"
                                  onClick={formatBodyJson}
                                  disabled={!bodyJsonFormattable()}
                                  title="Prettify JSON"
                                  class="ml-auto px-2 py-0.5 rounded-md text-[10px] font-mono border border-transparent
                                         text-ink-faint hover:text-ink hover:bg-white/4 transition-colors cursor-pointer
                                         disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink-faint"
                                >Prettify</button>
                              </Show>
                            </div>

                            <Show when={bodyMode() === "json" || bodyMode() === "text"}>
                              <CodeEditor
                                value={bodyText()}
                                onChange={setBodyText}
                                language={bodyMode() === "json" ? "json" : "none"}
                                placeholder={bodyMode() === "json" ? "{\n  \"key\": \"value\"\n}" : "Raw body text"}
                                minHeight="11rem"
                                wrap={bodyWrap()}
                              />
                              <div class="flex items-center gap-2">
                                <Show when={bodyMode() === "json"}>
                                  <p class="text-[10px] font-mono text-ink-faint">
                                    Sends <span class="text-verb-post">Content-Type: application/json</span> unless overridden in Headers.
                                  </p>
                                </Show>
                                <button
                                  type="button"
                                  onClick={() => setBodyWrap(w => !w)}
                                  title={bodyWrap() ? "Disable line wrap" : "Enable line wrap"}
                                  class="ml-auto px-2 py-0.5 rounded-md text-[10px] font-mono border transition-colors cursor-pointer"
                                  classList={{
                                    "bg-verb-post/20 text-verb-post border-verb-post/40": bodyWrap(),
                                    "text-ink-faint hover:text-ink hover:bg-white/4 border-transparent": !bodyWrap(),
                                  }}
                                >Wrap</button>
                              </div>
                            </Show>

                            <Show when={bodyMode() === "form"}>
                              <div class="rounded-lg border border-edge overflow-hidden">
                                <Index each={formRows()}>
                                  {(row, i) => (
                                    <div class="flex items-center gap-1.5 px-3 h-9 border-b border-edge last:border-b-0">
                                      <TextField
                                        placeholder="Key"
                                        value={row().key}
                                        onInput={v => updateFormRow(i, "key", v)}
                                        class="w-2/5 bg-transparent text-xs font-mono text-ink-mute outline-none placeholder:text-ink-faint shrink-0"
                                      />
                                      <div class="w-px h-4 bg-edge shrink-0" />
                                      <TextField
                                        placeholder="Value"
                                        value={row().val}
                                        onInput={v => updateFormRow(i, "val", v)}
                                        class="flex-1 bg-transparent text-xs font-mono text-ink outline-none placeholder:text-ink-faint"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => removeFormRow(i)}
                                        class="w-5 h-5 flex items-center justify-center rounded text-ink-faint hover:text-verb-delete hover:bg-white/5 transition-colors cursor-pointer shrink-0"
                                      >
                                        <svg viewBox="0 0 12 12" class="w-2.5 h-2.5" fill="none">
                                          <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                                        </svg>
                                      </button>
                                    </div>
                                  )}
                                </Index>
                                <button
                                  type="button"
                                  onClick={addFormRow}
                                  class="w-full h-8 text-[11px] font-mono text-ink-faint hover:text-ink hover:bg-white/3 transition-colors cursor-pointer"
                                >
                                  + Add field
                                </button>
                              </div>
                            </Show>

                            <Show when={bodyMode() === "none"}>
                              <p class="text-[10px] font-mono text-ink-faint">No body will be sent.</p>
                            </Show>
                          </>
                        }
                      >
                        <div class="space-y-2">
                          <div class="flex items-center justify-between">
                            <span class="text-[10px] font-mono text-verb-patch uppercase tracking-wider">Query</span>
                            <span class="text-[10px] font-mono text-ink-faint">
                              {method().name === "GET" ? "GET · query string · no body" : "POST · application/json"}
                            </span>
                          </div>
                          <CodeEditor
                            value={gqlQuery()}
                            onChange={setGqlQuery}
                            language="none"
                            placeholder={"{\n  countries {\n    name\n    code\n  }\n}"}
                            minHeight="12rem"
                          />
                          <div class="flex items-center justify-between pt-1">
                            <span class="text-[10px] font-mono text-verb-patch uppercase tracking-wider">Variables (JSON)</span>
                            <button
                              type="button"
                              onClick={formatGqlVariables}
                              disabled={!gqlVariablesFormattable()}
                              title="Prettify JSON"
                              class="px-2 py-0.5 rounded-md text-[10px] font-mono
                                     text-ink-faint hover:text-ink hover:bg-white/4 transition-colors cursor-pointer
                                     disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink-faint"
                            >Prettify</button>
                          </div>
                          <CodeEditor
                            value={gqlVariables()}
                            onChange={setGqlVariables}
                            language="json"
                            placeholder={"{\n  \"code\": \"BR\"\n}"}
                            minHeight="6rem"
                          />
                          <Show when={gqlVariablesError()}>
                            {(err) => (
                              <p class="text-[10px] font-mono text-amber-400/90 flex items-start gap-1.5">
                                <svg viewBox="0 0 12 12" class="w-2.5 h-2.5 mt-0.75 shrink-0" fill="none">
                                  <path d="M6 1L11 10.5H1L6 1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
                                  <path d="M6 5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                                  <circle cx="6" cy="8.75" r="0.5" fill="currentColor" />
                                </svg>
                                <span>Invalid JSON — will be sent as <code class="text-amber-300">{"{}"}</code>. {err()}</span>
                              </p>
                            )}
                          </Show>
                        </div>
                      </Show>
                    </div>
                  </RequestSectionPanel>
                </Show>

                <Show when={sectionId === "auth"}>
                  <div class="rounded-xl border border-edge overflow-hidden bg-purple-500/3">
                    <div class="flex items-center gap-2 px-3 py-2 border-b border-edge/80 bg-black/15">
                      <span class="w-1 h-3.5 rounded-full shrink-0 bg-purple-500" aria-hidden="true" />
                      <span class="text-[11px] font-mono font-semibold tracking-wide text-purple-400">Auth</span>
                    </div>
                    <div class="p-3 space-y-2.5">
                      {/* Type selector */}
                      <div class="flex items-center gap-3">
                        <span class="text-[10px] font-mono text-ink-faint w-20 shrink-0">Type</span>
                        <div class="flex gap-1">
                          <For each={[["none","None"],["basic","Basic"],["bearer","Bearer"],["apikey","API Key"]] as [AuthType, string][]}>
                            {([val, label]) => (
                              <button
                                type="button"
                                onClick={() => setAuthType(val)}
                                class="px-2 py-0.5 rounded-md text-[11px] font-mono transition-colors cursor-pointer border"
                                classList={{
                                  "bg-purple-500/20 text-purple-300 border-purple-500/40": authType() === val,
                                  "text-ink-faint hover:text-ink hover:bg-white/4 border-transparent": authType() !== val,
                                }}
                              >{label}</button>
                            )}
                          </For>
                        </div>
                      </div>

                      {/* Basic Auth */}
                      <Show when={authType() === "basic"}>
                        <div class="space-y-2">
                          <div class="flex items-center gap-3">
                            <span class="text-[10px] font-mono text-ink-faint w-20 shrink-0">Username</span>
                            <div class="flex-1 flex items-center gap-1">
                              <TextField
                                value={authBasicUser()}
                                onInput={v => setAuthBasicUser(v)}
                                placeholder="email@example.com"
                                class="flex-1 bg-surface-2 rounded-lg px-2.5 h-7 text-xs font-mono text-ink outline-none border border-edge focus:border-edge-bright placeholder:text-ink-faint transition-colors"
                              />
                              <AuthPickerBtn field="basicUser" />
                            </div>
                          </div>
                          <div class="flex items-center gap-3">
                            <span class="text-[10px] font-mono text-ink-faint w-20 shrink-0">Password</span>
                            <div class="flex-1 flex items-center gap-1">
                              <TextField
                                type={authBasicPassVisible() ? "text" : "password"}
                                value={authBasicPass()}
                                onInput={v => setAuthBasicPass(v)}
                                placeholder="API token"
                                class="flex-1 bg-surface-2 rounded-lg px-2.5 h-7 text-xs font-mono text-ink outline-none border border-edge focus:border-edge-bright placeholder:text-ink-faint transition-colors"
                              />
                              <button
                                type="button"
                                onClick={() => setAuthBasicPassVisible(v => !v)}
                                class="w-7 h-7 flex items-center justify-center rounded text-ink-faint hover:text-ink hover:bg-white/5 transition-colors cursor-pointer shrink-0"
                                classList={{ "text-accent": authBasicPassVisible() }}
                              >
                                <svg viewBox="0 0 12 12" class="w-3 h-3" fill="none">
                                  <Show when={authBasicPassVisible()}
                                    fallback={<path d="M1 6C1 6 3 3 6 3C9 3 11 6 11 6C11 6 9 9 6 9C3 9 1 6 1 6Z M6 6m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0" stroke="currentColor" stroke-width="1.3" />}
                                  >
                                    <path d="M1 1L11 11M5 3.1C5.3 3 5.6 3 6 3C9 3 11 6 11 6C10.6 6.7 9.9 7.5 9 8.1M3 4.3C2 5 1 6 1 6C1 6 3 9 6 9C6.8 9 7.5 8.8 8 8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                                  </Show>
                                </svg>
                              </button>
                              <AuthPickerBtn field="basicPass" />
                            </div>
                          </div>
                          <Show when={authBasicPass().trim()}>
                            <p class="text-[10px] font-mono text-ink-faint pl-23">
                              Sends <span class="text-purple-400">Authorization: Basic &lt;base64&gt;</span>
                            </p>
                          </Show>
                        </div>
                      </Show>

                      {/* Bearer Token */}
                      <Show when={authType() === "bearer"}>
                        <div class="flex items-center gap-3">
                          <span class="text-[10px] font-mono text-ink-faint w-20 shrink-0">Token</span>
                          <div class="flex-1 flex items-center gap-1">
                            <TextField
                              value={authBearerToken()}
                              onInput={v => setAuthBearerToken(v)}
                              placeholder="Token or {{SECRET_NAME}}"
                              class="flex-1 bg-surface-2 rounded-lg px-2.5 h-7 text-xs font-mono text-ink outline-none border border-edge focus:border-edge-bright placeholder:text-ink-faint transition-colors"
                            />
                            <AuthPickerBtn field="bearer" />
                          </div>
                        </div>
                      </Show>

                      {/* API Key */}
                      <Show when={authType() === "apikey"}>
                        <div class="space-y-2">
                          <div class="flex items-center gap-3">
                            <span class="text-[10px] font-mono text-ink-faint w-20 shrink-0">Key</span>
                            <div class="flex-1 flex items-center gap-1">
                              <TextField
                                value={authApiKey()}
                                onInput={v => setAuthApiKey(v)}
                                placeholder="X-API-Key"
                                class="flex-1 bg-surface-2 rounded-lg px-2.5 h-7 text-xs font-mono text-ink outline-none border border-edge focus:border-edge-bright placeholder:text-ink-faint transition-colors"
                              />
                              <AuthPickerBtn field="apiKey" />
                            </div>
                          </div>
                          <div class="flex items-center gap-3">
                            <span class="text-[10px] font-mono text-ink-faint w-20 shrink-0">Value</span>
                            <div class="flex-1 flex items-center gap-1">
                              <TextField
                                value={authApiValue()}
                                onInput={v => setAuthApiValue(v)}
                                placeholder="Value or {{SECRET_NAME}}"
                                class="flex-1 bg-surface-2 rounded-lg px-2.5 h-7 text-xs font-mono text-ink outline-none border border-edge focus:border-edge-bright placeholder:text-ink-faint transition-colors"
                              />
                              <AuthPickerBtn field="apiValue" />
                            </div>
                          </div>
                          <div class="flex items-center gap-3">
                            <span class="text-[10px] font-mono text-ink-faint w-20 shrink-0">Add to</span>
                            <div class="flex gap-1">
                              <For each={[["header","Header"],["query","Query"]] as ["header"|"query", string][]}>
                                {([val, label]) => (
                                  <button
                                    type="button"
                                    onClick={() => setAuthApiAddTo(val)}
                                    class="px-2.5 py-0.5 rounded-md text-[11px] font-mono transition-colors cursor-pointer border"
                                    classList={{
                                      "bg-purple-500/20 text-purple-300 border-purple-500/40": authApiAddTo() === val,
                                      "text-ink-faint hover:text-ink hover:bg-white/4 border-transparent": authApiAddTo() !== val,
                                    }}
                                  >{label}</button>
                                )}
                              </For>
                            </div>
                          </div>
                        </div>
                      </Show>
                    </div>
                  </div>
                </Show>
              </>
            )}
          </For>
        </div>
        </div>
        <div
          onMouseDown={onInspectorDragStart}
          onDblClick={onInspectorHandleDblClick}
          title="Drag to resize · double-click to fit content"
          class="h-2 shrink-0 cursor-ns-resize flex items-center justify-center
                 hover:bg-white/5 transition-colors group"
        >
          <div class="w-8 h-0.5 rounded-full bg-edge group-hover:bg-ink-faint transition-colors" />
        </div>
        </div>
      </Show>

      <Show when={activePicker() !== null && pickerPos() !== null}>
        <Portal>
          <div class="fixed inset-0" style={{ "z-index": "9998" }} onClick={() => setActivePicker(null)} />
          <div
            style={{ position: "fixed", top: `${pickerPos()!.top}px`, right: `${pickerPos()!.right}px`, "z-index": "9999" }}
            class="w-52 rounded-xl border border-edge bg-surface-1 shadow-xl py-1 max-h-56 overflow-y-auto"
          >
            <Show when={(secrets() ?? []).length === 0 && (vars() ?? []).length === 0}>
              <p class="text-[11px] font-mono text-ink-faint px-3 py-2">No secrets or variables stored.</p>
            </Show>

            <Show when={(secrets() ?? []).length > 0}>
              <div class="px-3 pt-1 pb-0.5 text-[9px] font-mono text-ink-faint uppercase tracking-wider">Secrets</div>
              <For each={secrets()}>
                {(secret) => (
                  <button
                    type="button"
                    onClick={() => {
                      const p = activePicker();
                      if (!p) return;
                      const ref = `{{${secret.name}}}`;
                      if (p.section === "headers") updateRow(p.row, "val", ref);
                      else if (p.section === "params") updateParam(p.row, "val", ref);
                      else if (p.section === "auth") setAuthFieldValue(p.field, ref);
                      setActivePicker(null);
                    }}
                    class="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono text-ink hover:bg-white/5 transition-colors cursor-pointer text-left"
                  >
                    <span class="text-ink-faint shrink-0">{"{{"}</span>
                    <span class="flex-1 truncate">{secret.name}</span>
                    <span class="text-ink-faint shrink-0">{"}}"}</span>
                  </button>
                )}
              </For>
            </Show>

            <Show when={(vars() ?? []).length > 0}>
              <Show when={(secrets() ?? []).length > 0}>
                <div class="my-1 mx-2 border-t border-edge/60" />
              </Show>
              <div class="px-3 pt-1 pb-0.5 text-[9px] font-mono text-ink-faint uppercase tracking-wider">Variables</div>
              <For each={vars()}>
                {(v) => (
                  <button
                    type="button"
                    onClick={() => {
                      const p = activePicker();
                      if (!p) return;
                      const ref = `{{${v.name}}}`;
                      if (p.section === "headers") updateRow(p.row, "val", ref);
                      else if (p.section === "params") updateParam(p.row, "val", ref);
                      else if (p.section === "auth") setAuthFieldValue(p.field, ref);
                      setActivePicker(null);
                    }}
                    class="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono text-ink hover:bg-white/5 transition-colors cursor-pointer text-left"
                  >
                    <span class="text-accent shrink-0">{"{{"}</span>
                    <span class="flex-1 truncate">{v.name}</span>
                    <span class="text-accent shrink-0">{"}}"}</span>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </Portal>
      </Show>
    </div>
  );
}
