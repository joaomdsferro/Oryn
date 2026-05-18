import { createSignal, createEffect, Show } from "solid-js";
import { Portal } from "solid-js/web";

type Props = {
  open: boolean;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void | Promise<void>;
};

export default function NewCollectionDialog(props: Props) {
  const [name, setName] = createSignal("");
  let inputRef: HTMLInputElement | undefined;

  createEffect(() => {
    if (props.open) {
      setName("");
      queueMicrotask(() => inputRef?.focus());
    }
  });

  const submit = () => {
    const trimmed = name().trim();
    if (!trimmed || props.saving) return;
    void props.onSubmit(trimmed);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
    }
  };

  return (
    <Portal>
      <Show when={props.open}>
        <div class="fixed inset-0 z-200 flex items-center justify-center no-drag">
          <div
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={props.onClose}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-collection-title"
            class="relative w-full max-w-xs mx-4 rounded-2xl bg-surface-1 border border-edge shadow-[0_24px_64px_-12px_rgba(0,0,0,0.8)] p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={onKeyDown}
          >
            <p id="new-collection-title" class="text-xs font-mono font-semibold text-ink">
              New collection
            </p>
            <input
              ref={inputRef}
              type="text"
              placeholder="Collection name"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              class="w-full bg-surface-2 rounded-lg px-3 h-9 text-[11px] font-mono text-ink placeholder:text-ink-faint border border-edge outline-none focus:border-edge-bright transition-colors"
            />
            <div class="flex gap-2 pt-1">
              <button
                type="button"
                onClick={props.onClose}
                disabled={props.saving}
                class="h-8 px-3 rounded-lg text-[11px] font-mono text-ink-mute hover:text-ink hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={props.saving || !name().trim()}
                class="flex-1 h-8 rounded-lg bg-white/5 text-[11px] font-mono text-ink hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {props.saving ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </Portal>
  );
}
