import { createSignal, createEffect, Show } from "solid-js";
import { Portal } from "solid-js/web";
import type { SecretMeta, VarEntry } from "../types";
import { secretValueByName, varValueByName, type RefKind } from "../lib/refTokens";

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

type Props = {
  open: boolean;
  anchor: DOMRect | null;
  kind: RefKind;
  refName: string;
  vars: VarEntry[];
  secrets: SecretMeta[];
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

function currentZoom() {
  const z = parseFloat(document.body.style.zoom);
  return Number.isFinite(z) && z > 0 ? z : 1;
}

export default function RefTooltip(props: Props) {
  const [secretValue, setSecretValue] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [peek, setPeek] = createSignal(false);
  const [reveal, setReveal] = createSignal(false);

  const loadSecret = async () => {
    if (props.kind !== "secret" || secretValue() !== null || loading()) return;
    setLoading(true);
    try {
      setSecretValue(await secretValueByName(props.secrets, props.refName));
    } finally {
      setLoading(false);
    }
  };

  const displaySecret = () => {
    const v = secretValue();
    if (v === null) return loading() ? "…" : "••••••••";
    if (reveal()) return v;
    if (peek()) {
      const n = peekCount(v.length);
      return v.slice(0, n) + "•".repeat(Math.max(0, v.length - n));
    }
    return "•".repeat(Math.min(v.length, 20));
  };

  const tooltipStyle = () => {
    const rect = props.anchor;
    if (!rect) return {};
    const z = currentZoom();
    const left = rect.left / z;
    const top = rect.bottom / z + 4;
    const maxW = Math.min(320, window.innerWidth / z - left - 12);
    return {
      top: `${top}px`,
      left: `${left}px`,
      "max-width": `${maxW}px`,
    };
  };

  createEffect(() => {
    if (!props.open) {
      setPeek(false);
      setReveal(false);
      setSecretValue(null);
      return;
    }
    if (props.kind === "secret") void loadSecret();
  });

  return (
    <Portal>
      <Show when={props.open && props.anchor}>
        <div
          style={tooltipStyle()}
          onMouseEnter={() => props.onMouseEnter?.()}
          onMouseLeave={() => props.onMouseLeave?.()}
          class="fixed z-300 px-2.5 py-2 rounded-lg bg-surface-1 border border-edge shadow-[0_8px_24px_rgba(0,0,0,0.55)] no-drag"
        >
          <Show
            when={props.kind === "missing"}
            fallback={
              <Show
                when={props.kind === "var"}
                fallback={
                  <div class="flex items-center gap-1 min-w-0">
                    <span class="flex-1 text-[11px] font-mono text-ink break-all select-none min-w-0">
                      {displaySecret()}
                    </span>
                    <button
                      type="button"
                      title="Peek"
                      onClick={(e) => { e.stopPropagation(); setPeek(p => !p); if (reveal()) setReveal(false); }}
                      class="w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer shrink-0"
                      classList={{
                        "text-accent bg-accent/10": peek(),
                        "text-ink-faint hover:text-ink hover:bg-white/5": !peek(),
                      }}
                    >
                      <IconPeek />
                    </button>
                    <button
                      type="button"
                      title={reveal() ? "Hide" : "Reveal"}
                      onClick={(e) => { e.stopPropagation(); setReveal(r => !r); if (!reveal()) setPeek(false); }}
                      class="w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer shrink-0"
                      classList={{
                        "text-accent bg-accent/10": reveal(),
                        "text-ink-faint hover:text-ink hover:bg-white/5": !reveal(),
                      }}
                    >
                      <Show when={reveal()} fallback={<IconRevealHidden />}>
                        <IconRevealVisible />
                      </Show>
                    </button>
                  </div>
                }
              >
                <span class="text-[11px] font-mono text-ink break-all">
                  {varValueByName(props.vars, props.refName)}
                </span>
              </Show>
            }
          >
            <span class="text-[11px] font-mono text-amber-400">Unknown reference</span>
          </Show>
        </div>
      </Show>
    </Portal>
  );
}
