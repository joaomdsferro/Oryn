type LeftControlsProps = {
  sidebarOpen: boolean;
  sidebarShortcutLabel?: string;
  onToggleSidebar: () => void;
  onOpenSecrets: () => void;
  onOpenVars: () => void;
  onOpenImport: () => void;
};

function sidebarTitle(open: boolean, shortcut?: string) {
  const action = open ? "Close sidebar" : "Open sidebar";
  return shortcut ? `${action} (${shortcut})` : action;
}

const stop = (e: MouseEvent) => e.stopPropagation();

export function LeftControls(props: LeftControlsProps) {
  return (
    <div class="no-drag flex items-center gap-0.5">
      <button
        type="button"
        onMouseDown={stop}
        onClick={(e) => { stop(e); props.onToggleSidebar(); }}
        title={sidebarTitle(props.sidebarOpen, props.sidebarShortcutLabel)}
        class="w-8 h-8 flex items-center justify-center rounded transition-colors cursor-pointer outline-none"
        classList={{
          "text-white/70 bg-surface-2": props.sidebarOpen,
          "text-white/40 hover:text-white/70 hover:bg-surface-2": !props.sidebarOpen,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.2" />
          <line x1="5" y1="1" x2="5" y2="13" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>

      <button
        type="button"
        onMouseDown={stop}
        onClick={(e) => { stop(e); props.onOpenSecrets(); }}
        title="Secrets"
        class="w-8 h-8 flex items-center justify-center rounded text-white/40 hover:text-white/70 hover:bg-surface-2 cursor-pointer transition-colors outline-none"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <rect x="3.5" y="6" width="6" height="4.5" rx="1" stroke="currentColor" stroke-width="1.2" />
          <path d="M4.75 6V4.25C4.75 3.15 5.57 2.25 6.5 2.25C7.43 2.25 8.25 3.15 8.25 4.25V6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        </svg>
      </button>

      <button
        type="button"
        onMouseDown={stop}
        onClick={(e) => { stop(e); props.onOpenVars(); }}
        title="Variables"
        class="w-8 h-8 flex items-center justify-center rounded text-white/40 hover:text-white/70 hover:bg-surface-2 cursor-pointer transition-colors outline-none"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M4.5 2.5C3.5 2.5 3 3 3 4V5.5C3 6.3 2.5 6.5 2 6.5C2.5 6.5 3 6.7 3 7.5V9C3 10 3.5 10.5 4.5 10.5"
            stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M8.5 2.5C9.5 2.5 10 3 10 4V5.5C10 6.3 10.5 6.5 11 6.5C10.5 6.5 10 6.7 10 7.5V9C10 10 9.5 10.5 8.5 10.5"
            stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      <button
        type="button"
        onMouseDown={stop}
        onClick={(e) => { stop(e); props.onOpenImport(); }}
        title="Import Postman collection"
        class="w-8 h-8 flex items-center justify-center rounded text-white/40 hover:text-white/70 hover:bg-surface-2 cursor-pointer transition-colors outline-none"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M6.5 2V8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          <path d="M3.75 5.25L6.5 8L9.25 5.25" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M2.5 10H10.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  );
}
