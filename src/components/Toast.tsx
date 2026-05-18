import { Show } from "solid-js";
import { Portal } from "solid-js/web";

type Props = {
  show: boolean;
  message: string;
};

export default function Toast(props: Props) {
  return (
    <Portal>
      <Show when={props.show}>
        <div
          class="fixed top-5 left-1/2 z-300
                 flex items-center gap-2 px-4 py-2.5
                 rounded-2xl bg-surface-1 border-2 border-white/20
                 shadow-[0_8px_32px_rgba(0,0,0,0.6)]
                 text-xs text-ink font-mono
                 animate-[toast-lifecycle_2s_ease-in-out_forwards]"
        >
          <svg viewBox="0 0 12 12" class="w-3 h-3 text-verb-post shrink-0" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {props.message}
        </div>
      </Show>
    </Portal>
  );
}
