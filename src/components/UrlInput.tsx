import { createSignal, createMemo, For, Show, onCleanup, onMount, createEffect } from "solid-js";
import type { SecretMeta, VarEntry } from "../types";
import {
  caretOffsetFromMouse,
  findRefAtOffset,
  parseRefSegments,
  refAnchorRect,
  refKindClass,
  type RefMatch,
} from "../lib/refTokens";
import RefTooltip from "./RefTooltip";

type Props = {
  value: string;
  onInput: (value: string) => void;
  onEnter?: () => void;
  vars: VarEntry[];
  secrets: SecretMeta[];
  placeholder?: string;
  class?: string;
};

export default function UrlInput(props: Props) {
  let inputRef: HTMLInputElement | undefined;
  let mirrorRef: HTMLDivElement | undefined;
  const [mirrorText, setMirrorText] = createSignal(props.value);
  const [hoverRef, setHoverRef] = createSignal<RefMatch | null>(null);
  const [tooltipAnchor, setTooltipAnchor] = createSignal<DOMRect | null>(null);

  const secretNames = createMemo(() => new Set(props.secrets.map(s => s.name)));
  const varNames = createMemo(() => new Set(props.vars.map(v => v.name)));
  const segments = createMemo(() =>
    parseRefSegments(mirrorText(), secretNames(), varNames()),
  );

  // Per-input undo/redo. WebKitGTK (Tauri on Linux) doesn't wire Ctrl+Z/Y to
  // native input undo, so we maintain a debounced history here.
  const IDLE_SNAPSHOT_MS = 300;
  let history: string[] = [props.value ?? ""];
  let cursor = 0;
  let idleTimer: number | undefined;

  const resetHistory = (initial: string) => {
    history = [initial];
    cursor = 0;
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
  };

  const scheduleSnapshot = (value: string) => {
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      idleTimer = undefined;
      if (cursor < history.length - 1) history = history.slice(0, cursor + 1);
      if (history[cursor] === value) return;
      history.push(value);
      cursor = history.length - 1;
    }, IDLE_SNAPSHOT_MS);
  };

  const applyHistoryStep = (delta: -1 | 1): boolean => {
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
      const current = inputRef?.value ?? "";
      if (history[cursor] !== current) {
        if (cursor < history.length - 1) history = history.slice(0, cursor + 1);
        history.push(current);
        cursor = history.length - 1;
      }
    }
    const target = cursor + delta;
    if (target < 0 || target >= history.length) return false;
    cursor = target;
    const next = history[cursor];
    if (inputRef && inputRef.value !== next) inputRef.value = next;
    setMirrorText(next);
    props.onInput(next);
    return true;
  };

  const applyExternalValue = (value: string) => {
    setMirrorText(value);
    if (inputRef && inputRef.value !== value) {
      inputRef.value = value;
    }
    resetHistory(value);
  };

  onMount(() => applyExternalValue(props.value));

  // Sync when parent changes URL (load request, new tab, etc.) — not while typing.
  createEffect(() => {
    const external = props.value;
    if (document.activeElement === inputRef) return;
    if (mirrorText() !== external || (inputRef && inputRef.value !== external)) {
      applyExternalValue(external);
    }
  });

  let closeTimer: number | undefined;

  const clearHover = () => {
    setHoverRef(null);
    setTooltipAnchor(null);
  };

  const cancelClose = () => {
    if (closeTimer !== undefined) {
      clearTimeout(closeTimer);
      closeTimer = undefined;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer = window.setTimeout(() => {
      clearHover();
      closeTimer = undefined;
    }, 120);
  };

  const onMouseMove = (e: MouseEvent) => {
    const input = inputRef;
    if (!input) return;
    const text = input.value;
    const offset = caretOffsetFromMouse(input, e.clientX);
    const match = findRefAtOffset(text, offset, secretNames(), varNames());
    if (!match) {
      scheduleClose();
      return;
    }
    cancelClose();
    setHoverRef(match);
    setTooltipAnchor(refAnchorRect(input, match));
  };

  const syncScroll = (scrollLeft: number) => {
    if (mirrorRef) mirrorRef.scrollLeft = scrollLeft;
  };

  onCleanup(() => {
    cancelClose();
    clearHover();
    if (idleTimer !== undefined) clearTimeout(idleTimer);
  });

  return (
    <div
      class={`relative flex-1 min-w-0 h-full flex items-center ${props.class ?? ""}`}
      onMouseLeave={scheduleClose}
    >
      <div
        aria-hidden="true"
        class="absolute inset-0 flex items-center overflow-x-auto overflow-y-hidden pointer-events-none select-none"
      >
        <div
          ref={mirrorRef}
          class="px-0 w-full overflow-hidden whitespace-pre font-mono text-sm tracking-tight"
        >
          <Show
            when={mirrorText().length > 0}
            fallback={
              <span class="text-ink-faint">{props.placeholder ?? "https://"}</span>
            }
          >
            <For each={segments()}>
              {(seg) =>
                seg.type === "text" ? (
                  <span class="text-ink">{seg.value}</span>
                ) : (
                  <span class={refKindClass(seg.kind)}>{seg.value}</span>
                )
              }
            </For>
          </Show>
        </div>
      </div>

      <input
        ref={inputRef}
        type="text"
        onInput={(e) => {
          const v = e.currentTarget.value;
          scheduleSnapshot(v);
          setMirrorText(v);
          props.onInput(v);
        }}
        onKeyDown={(e) => {
          const mod = e.ctrlKey || e.metaKey;
          if (mod && !e.altKey) {
            const k = e.key.toLowerCase();
            const isUndo = k === "z" && !e.shiftKey;
            const isRedo = k === "y" || (k === "z" && e.shiftKey);
            if (isUndo || isRedo) {
              if (applyHistoryStep(isUndo ? -1 : 1)) {
                e.preventDefault();
                e.stopPropagation();
              }
              return;
            }
          }
          if (e.key === "Enter") props.onEnter?.();
        }}
        onMouseMove={onMouseMove}
        onScroll={(e) => syncScroll(e.currentTarget.scrollLeft)}
        placeholder={props.placeholder ?? "https://"}
        spellcheck={false}
        autocomplete="off"
        class="relative z-10 w-full bg-transparent outline-none
               text-sm text-transparent caret-ink placeholder:text-ink-faint
               font-mono tracking-tight selection:bg-accent/25"
      />

      <RefTooltip
        open={!!hoverRef()}
        anchor={tooltipAnchor()}
        kind={hoverRef()?.kind ?? "missing"}
        refName={hoverRef()?.name ?? ""}
        vars={props.vars}
        secrets={props.secrets}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      />
    </div>
  );
}
