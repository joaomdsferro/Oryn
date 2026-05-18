import { createEffect, onMount, onCleanup, splitProps, type JSX } from "solid-js";

type Props = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "value" | "onInput"> & {
  value: string;
  onInput: (value: string) => void;
};

const IDLE_SNAPSHOT_MS = 300;

// Uncontrolled <input> with its own undo/redo history. We don't rely on the
// browser's native input undo because WebKitGTK (used by Tauri on Linux) does
// not wire Ctrl+Z/Y to input undo. Snapshots are debounced so a burst of
// keystrokes collapses into a single undo step.
export default function TextField(props: Props) {
  let ref: HTMLInputElement | undefined;
  const [own, rest] = splitProps(props, ["value", "onInput"]);

  let history: string[] = [own.value ?? ""];
  let cursor = 0;
  let idleTimer: number | undefined;
  let lastExternal = own.value ?? "";

  const setRefValue = (next: string) => {
    if (!ref) return;
    if (ref.value !== next) ref.value = next;
  };

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
      // Drop any redo branch beyond the current cursor.
      if (cursor < history.length - 1) history = history.slice(0, cursor + 1);
      if (history[cursor] === value) return;
      history.push(value);
      cursor = history.length - 1;
    }, IDLE_SNAPSHOT_MS);
  };

  const applyHistoryStep = (delta: -1 | 1) => {
    // Commit any pending burst as a snapshot before stepping so the user can
    // come back to the current state on redo.
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
      const current = ref?.value ?? "";
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
    setRefValue(next);
    own.onInput(next);
    return true;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || e.altKey) return;
    const k = e.key.toLowerCase();
    const isUndo = k === "z" && !e.shiftKey;
    const isRedo = k === "y" || (k === "z" && e.shiftKey);
    if (!isUndo && !isRedo) return;
    if (applyHistoryStep(isUndo ? -1 : 1)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  onMount(() => {
    setRefValue(own.value ?? "");
  });

  // External (parent-driven) value changes: rebase history.
  createEffect(() => {
    const next = own.value ?? "";
    if (next === lastExternal) return;
    lastExternal = next;
    if (!ref) return;
    if (document.activeElement === ref) return;
    setRefValue(next);
    resetHistory(next);
  });

  onCleanup(() => {
    if (idleTimer !== undefined) clearTimeout(idleTimer);
  });

  return (
    <input
      ref={ref}
      {...rest}
      onKeyDown={onKeyDown}
      onInput={(e) => {
        const v = e.currentTarget.value;
        scheduleSnapshot(v);
        own.onInput(v);
      }}
    />
  );
}
