import { Show, createSignal, createEffect, createMemo, For } from "solid-js";
import Toast from "./Toast";
import type { HttpResponse } from "../types";

export type { HttpResponse };

type Props = {
  response: HttpResponse | null;
  error: string | null;
  loading: boolean;
  onClear: () => void;
  isHistorical: boolean;
  historicalTimestamp: string | null;
  requestHeaders: [string, string][] | null;
};

function statusColor(code: number): string {
  if (code < 200) return "text-ink-mute";
  if (code < 300) return "text-verb-post";
  if (code < 400) return "text-verb-get";
  if (code < 500) return "text-verb-put";
  return "text-verb-delete";
}

function prettyBody(body: string, headers: [string, string][]): string {
  const ct = headers.find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
  if (ct.includes("json")) {
    try { return JSON.stringify(JSON.parse(body), null, 2); } catch {}
  }
  return body;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function HeaderSection(props: {
  title: string;
  headers: [string, string][];
  maskedKeys?: Set<string>;
}) {
  const [peeked, setPeeked] = createSignal(new Set<number>());
  const [revealed, setRevealed] = createSignal(new Set<number>());

  const togglePeek = (i: number) => setPeeked(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const toggleReveal = (i: number) => setRevealed(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const displayValue = (value: string, i: number, isMasked: boolean) => {
    if (!isMasked) return value;
    if (revealed().has(i)) return value;
    if (peeked().has(i)) return value.slice(0, 8) + "…";
    return "••••••••••••";
  };

  return (
    <div class="border-b border-edge last:border-b-0">
      <div class="px-4 py-1.5 bg-surface-0/40 flex items-center gap-1.5">
        <span class="text-[10px] font-mono font-semibold text-ink-faint tracking-wider uppercase">
          {props.title}
        </span>
        <span class="text-[10px] font-mono text-ink-faint">· {props.headers.length}</span>
      </div>
      <Show
        when={props.headers.length > 0}
        fallback={<p class="px-4 py-3 text-[11px] font-mono text-ink-faint">No headers</p>}
      >
        <For each={props.headers}>
          {([key, value], i) => {
            const isMasked = () => !!(props.maskedKeys?.has(key.toLowerCase()));
            return (
              <div class="flex items-center gap-3 px-4 py-1.5 border-b border-edge/40 last:border-b-0 hover:bg-white/2 transition-colors group">
                <span class="text-[11px] font-mono text-ink-mute shrink-0 min-w-35 max-w-50 truncate">{key}</span>
                <span class="flex-1 text-[11px] font-mono text-ink break-all">{displayValue(value, i(), isMasked())}</span>
                <Show when={isMasked()}>
                  <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      type="button"
                      title="Peek"
                      onClick={() => togglePeek(i())}
                      class={`w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer ${peeked().has(i()) ? "text-accent" : "text-ink-faint hover:text-ink hover:bg-white/5"}`}
                    >
                      <svg viewBox="0 0 12 12" class="w-3 h-3" fill="none">
                        <circle cx="5" cy="5" r="3" stroke="currentColor" stroke-width="1.3" />
                        <path d="M7.5 7.5L10.5 10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      title={revealed().has(i()) ? "Hide" : "Reveal"}
                      onClick={() => toggleReveal(i())}
                      class={`w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer ${revealed().has(i()) ? "text-accent" : "text-ink-faint hover:text-ink hover:bg-white/5"}`}
                    >
                      <Show
                        when={revealed().has(i())}
                        fallback={
                          <svg viewBox="0 0 12 12" class="w-3 h-3" fill="none">
                            <path d="M1 6C1 6 3 3 6 3C9 3 11 6 11 6C11 6 9 9 6 9C3 9 1 6 1 6Z" stroke="currentColor" stroke-width="1.3" />
                            <circle cx="6" cy="6" r="1.5" stroke="currentColor" stroke-width="1.3" />
                          </svg>
                        }
                      >
                        <svg viewBox="0 0 12 12" class="w-3 h-3" fill="none">
                          <path d="M1 1L11 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                          <path d="M5 3.1C5.3 3 5.6 3 6 3C9 3 11 6 11 6C10.6 6.7 9.9 7.5 9 8.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                          <path d="M3 4.3C2 5 1 6 1 6C1 6 3 9 6 9C6.8 9 7.5 8.8 8 8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                        </svg>
                      </Show>
                    </button>
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </Show>
    </div>
  );
}

export default function ResponsePanel(props: Props) {
  const [height, setHeight] = createSignal(280);
  const [copied, setCopied] = createSignal(false);
  const [view, setView] = createSignal<"body" | "headers">("body");

  createEffect(() => { if (props.response) setView("body"); });

  const maskedRequestKeys = createMemo(() =>
    new Set(
      (props.requestHeaders ?? [])
        .filter(([, v]) => /^\{\{.+\}\}$/.test(v))
        .map(([k]) => k.toLowerCase())
    )
  );

  const copyBody = () => {
    const res = props.response;
    if (!res) return;
    navigator.clipboard.writeText(prettyBody(res.body, res.headers));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const onDragStart = (e: MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height();
    const onMove = (e: MouseEvent) => setHeight(Math.max(120, startH + e.clientY - startY));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      style={{ height: `${height()}px` }}
      class="w-2/3 max-w-4xl flex flex-col rounded-2xl
             bg-surface-1 border border-edge
             shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]
             overflow-hidden
             animate-[slide-down_0.2s_ease-out]"
      classList={{ "border-amber-500/30": props.isHistorical }}
    >
      {/* Historical response banner */}
      <Show when={props.isHistorical && props.historicalTimestamp}>
        {(ts) => (
          <div class="flex items-center gap-1.5 px-4 h-6 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
            <svg viewBox="0 0 12 12" class="w-2.5 h-2.5 text-amber-400/80 shrink-0" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2" />
              <path d="M6 3.5V6L7.5 7.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class="text-[10px] font-mono text-amber-400/80">
              Cached response · {relativeTime(ts())}
            </span>
          </div>
        )}
      </Show>

      {/* Header — always visible */}
      <div class="flex items-center gap-3 px-4 h-10 border-b border-edge shrink-0">
        <Show when={props.loading}>
          <svg class="w-3.5 h-3.5 animate-spin text-ink-mute shrink-0" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4" stroke-dasharray="28" stroke-dashoffset="10" />
          </svg>
          <span class="text-xs text-ink-mute font-mono">Sending…</span>
        </Show>

        <Show when={!props.loading && props.error}>
          <span class="text-xs text-verb-delete font-mono">Error</span>
        </Show>

        <Show when={!props.loading && props.response}>
          {(res) => (
            <>
              <span class={`text-sm font-semibold font-mono ${statusColor(res().status)}`}>
                {res().status} {res().status_text}
              </span>
              <span class="text-xs text-ink-faint font-mono">{res().elapsed_ms} ms</span>
              <span class="text-xs text-ink-faint font-mono">
                {(new TextEncoder().encode(res().body).length / 1024).toFixed(1)} KB
              </span>
            </>
          )}
        </Show>

        <Show when={!props.loading && props.response}>
          <div class="ml-auto flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
            <button
              type="button"
              onClick={() => setView("body")}
              class="px-2 h-5 rounded text-[10px] font-mono transition-colors cursor-pointer"
              classList={{
                "bg-surface-1 text-ink shadow-sm": view() === "body",
                "text-ink-faint hover:text-ink": view() !== "body",
              }}
            >Body</button>
            <button
              type="button"
              onClick={() => setView("headers")}
              class="px-2 h-5 rounded text-[10px] font-mono transition-colors cursor-pointer"
              classList={{
                "bg-surface-1 text-ink shadow-sm": view() === "headers",
                "text-ink-faint hover:text-ink": view() !== "headers",
              }}
            >Headers</button>
          </div>
        </Show>

        <Show when={!props.loading && props.response && view() === "body"}>
          <button
            onClick={copyBody}
            aria-label="Copy response body"
            class="w-6 h-6 flex items-center justify-center rounded
                   text-ink-faint hover:text-ink hover:bg-white/5
                   transition-colors cursor-pointer"
          >
            <Show
              when={copied()}
              fallback={
                <svg viewBox="0 0 12 12" class="w-3 h-3" fill="none">
                  <rect x="1" y="3" width="7" height="8" rx="1" stroke="currentColor" stroke-width="1.3" />
                  <path d="M4 3V2a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                </svg>
              }
            >
              <svg viewBox="0 0 12 12" class="w-3 h-3 text-verb-post" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </Show>
          </button>
        </Show>

        <button
          onClick={props.onClear}
          aria-label="Clear response"
          class="w-6 h-6 flex items-center justify-center rounded
                 text-ink-faint hover:text-verb-delete hover:bg-white/5
                 transition-colors cursor-pointer"
          classList={{ "ml-auto": !props.response || props.loading }}
        >
          <svg viewBox="0 0 12 12" class="w-3 h-3" fill="none">
            <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <Show when={!props.loading && props.error}>
        <div class="flex-1 flex items-center justify-center px-6">
          <span class="text-sm text-verb-delete font-mono text-center break-all">{props.error}</span>
        </div>
      </Show>

      <Show when={!props.loading && props.response}>
        {(res) => (
          <>
            <Show when={view() === "body"}>
              <div class="flex-1 overflow-auto p-4 min-h-0">
                <pre class="text-xs text-ink font-mono leading-relaxed whitespace-pre-wrap break-all">
                  {prettyBody(res().body, res().headers)}
                </pre>
              </div>
            </Show>
            <Show when={view() === "headers"}>
              <div class="flex-1 overflow-auto min-h-0">
                <HeaderSection title="Request" headers={res().request_headers ?? []} maskedKeys={maskedRequestKeys()} />
                <HeaderSection title="Response" headers={res().headers} />
              </div>
            </Show>
          </>
        )}
      </Show>

      <div
        onMouseDown={onDragStart}
        class="h-2 shrink-0 cursor-ns-resize flex items-center justify-center
               hover:bg-white/5 transition-colors group"
      >
        <div class="w-8 h-0.5 rounded-full bg-edge group-hover:bg-ink-faint transition-colors" />
      </div>

      <Toast show={copied()} message="Response copied to clipboard" />
    </div>
  );
}
