import type { SecretMeta, VarEntry } from "../types";

export type RefKind = "var" | "secret" | "missing";

export function parseRefName(val: string): string | null {
  const m = val.match(/^\{\{(\w+)\}\}$/);
  return m ? m[1] : null;
}

export function resolveRefKind(
  name: string,
  secretNames: Set<string>,
  varNames: Set<string>,
): RefKind {
  if (secretNames.has(name)) return "secret";
  if (varNames.has(name)) return "var";
  return "missing";
}

export function refKindClass(kind: RefKind): string {
  switch (kind) {
    case "secret":
      return "text-verb-get";
    case "var":
      return "text-accent";
    case "missing":
      return "text-amber-400";
  }
}

export type RefMatch = {
  name: string;
  kind: RefKind;
  start: number;
  end: number;
  text: string;
};

export function findRefAtOffset(
  text: string,
  offset: number,
  secretNames: Set<string>,
  varNames: Set<string>,
): RefMatch | null {
  const re = /\{\{(\w+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (offset >= start && offset < end) {
      const name = m[1];
      return {
        name,
        kind: resolveRefKind(name, secretNames, varNames),
        start,
        end,
        text: m[0],
      };
    }
  }
  return null;
}

export type UrlSegment =
  | { type: "text"; value: string }
  | { type: "ref"; value: string; name: string; kind: RefKind };

export function parseRefSegments(
  text: string,
  secretNames: Set<string>,
  varNames: Set<string>,
): UrlSegment[] {
  const segments: UrlSegment[] = [];
  const re = /\{\{(\w+)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ type: "text", value: text.slice(last, m.index) });
    }
    const name = m[1];
    segments.push({
      type: "ref",
      value: m[0],
      name,
      kind: resolveRefKind(name, secretNames, varNames),
    });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push({ type: "text", value: text.slice(last) });
  }
  return segments;
}

function currentZoom() {
  const z = parseFloat(document.body.style.zoom);
  return Number.isFinite(z) && z > 0 ? z : 1;
}

function inputMeasureCtx(input: HTMLInputElement) {
  const style = window.getComputedStyle(input);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return ctx;
}

function measureInputPrefix(input: HTMLInputElement, length: number): number {
  const ctx = inputMeasureCtx(input);
  if (!ctx) return 0;
  return ctx.measureText(input.value.slice(0, length)).width;
}

export function caretOffsetFromMouse(
  input: HTMLInputElement,
  clientX: number,
): number {
  const style = window.getComputedStyle(input);
  const ctx = inputMeasureCtx(input);
  if (!ctx) return 0;

  const rect = input.getBoundingClientRect();
  const padL = parseFloat(style.paddingLeft) || 0;
  const z = currentZoom();
  let x = (clientX - rect.left) / z - padL + input.scrollLeft;
  if (x <= 0) return 0;

  const text = input.value;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid)).width > x) hi = mid - 1;
    else lo = mid;
  }
  return Math.min(lo, text.length);
}

export function refAnchorRect(input: HTMLInputElement, match: RefMatch): DOMRect {
  const style = window.getComputedStyle(input);
  const rect = input.getBoundingClientRect();
  const padL = parseFloat(style.paddingLeft) || 0;
  const z = currentZoom();
  const innerLeft = padL + measureInputPrefix(input, match.start) - input.scrollLeft;
  const innerWidth = measureInputPrefix(input, match.end) - measureInputPrefix(input, match.start);
  const left = rect.left + innerLeft * z;
  return new DOMRect(left, rect.top, Math.max(innerWidth * z, 8), rect.height);
}

export function refValueStatus(
  val: string,
  key: string,
  knownSecrets: Set<string>,
  knownVars: Set<string>,
): "secret-ok" | "var-ok" | "ref-missing" | "warn" | "normal" {
  const m = val.match(/^\{\{(\w+)\}\}$/);
  if (m) {
    if (knownSecrets.has(m[1])) return "secret-ok";
    if (knownVars.has(m[1])) return "var-ok";
    return "ref-missing";
  }
  if (val.length >= 20 && !/\s/.test(val) && /key|token|secret|auth|password|bearer|api/i.test(key)) {
    return "warn";
  }
  return "normal";
}

export function varValueByName(vars: VarEntry[], name: string): string {
  return vars.find(v => v.name === name)?.value ?? "";
}

export async function secretValueByName(
  secrets: SecretMeta[],
  name: string,
): Promise<string | null> {
  const meta = secrets.find(s => s.name === name);
  if (!meta) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const full = await invoke<{ value: string }>("get_secret", { id: meta.id });
  return full.value;
}
