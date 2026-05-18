import { createSignal, onCleanup, type JSX } from "solid-js";
import type { SecretMeta, VarEntry } from "../types";
import { parseRefName } from "../lib/refTokens";
import RefTooltip from "./RefTooltip";

export { parseRefName };

type Props = {
  kind: "var" | "secret";
  refName: string;
  vars: VarEntry[];
  secrets: SecretMeta[];
  children: JSX.Element;
};

export default function RefValueHover(props: Props) {
  const [open, setOpen] = createSignal(false);
  const [anchor, setAnchor] = createSignal<DOMRect | null>(null);
  let closeTimer: number | undefined;

  const cancelClose = () => {
    if (closeTimer !== undefined) {
      clearTimeout(closeTimer);
      closeTimer = undefined;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer = window.setTimeout(() => {
      setOpen(false);
      setAnchor(null);
      closeTimer = undefined;
    }, 120);
  };

  const show = (e: MouseEvent) => {
    cancelClose();
    const el = e.currentTarget as HTMLElement;
    setAnchor(el.getBoundingClientRect());
    setOpen(true);
  };

  onCleanup(cancelClose);

  return (
    <div
      class="flex-1 min-w-0 flex items-center overflow-hidden"
      onMouseEnter={show}
      onMouseLeave={scheduleClose}
    >
      {props.children}
      <RefTooltip
        open={open()}
        anchor={anchor()}
        kind={props.kind}
        refName={props.refName}
        vars={props.vars}
        secrets={props.secrets}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      />
    </div>
  );
}
