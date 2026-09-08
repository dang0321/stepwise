import type { Analysis, Focus, Role } from './visual-model.ts';
export type Value =
  | null
  | boolean
  | number
  | string
  | {
      type: string;
      items?: Value[] | [Value, Value][];
      length?: number;
      value?: string;
    };
export type Frame = {
  id: number;
  name: string;
  scope?: string;
  line: number;
  locals: Record<string, Value>;
  roles?: Record<string, Role>;
};
export type Step = {
  event: 'line' | 'return' | 'done' | 'error';
  line: number | null;
  globals: Record<string, Value>;
  roles?: Record<string, Role>;
  stack: Frame[];
  output: string;
  returnValue?: Value;
  error?: TraceError;
  focus?: Focus[];
  condition?: { expression: string; value: boolean };
};
export type TraceError = { type: string; message: string; line: number | null };
export type TraceResult = {
  steps: Step[];
  error: TraceError | null;
  warnings: string[];
  hints: Record<string, string>;
  comments: Record<string, string>;
  elapsedMs: number;
  pythonVersion: string;
  analysis?: Analysis | null;
};
export function container(
  v: Value | undefined,
): v is Exclude<Value, null | boolean | number | string> {
  return !!v && typeof v === 'object';
}
export function format(v: Value | undefined): string {
  if (v === undefined) return '—';
  if (v === null) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return String(v);
  if (v.items) {
    const items =
      v.type === 'dict'
        ? (v.items as [Value, Value][]).map(
            ([k, x]) => format(k) + ': ' + format(x),
          )
        : (v.items as Value[]).map(format);
    const body =
      items.join(', ') + (v.length && v.length > items.length ? ', …' : '');
    if (v.type === 'dict') return '{' + body + '}';
    if (v.type === 'set') return items.length ? '{' + body + '}' : 'set()';
    if (v.type === 'frozenset') return 'frozenset({' + body + '})';
    if (v.type === 'tuple')
      return '(' + body + (items.length === 1 ? ',' : '') + ')';
    if (v.type === 'deque') return 'deque([' + body + '])';
    return '[' + body + ']';
  }
  return v.value || '<' + v.type + '>';
}
export function changed(a: Value | undefined, b: Value | undefined) {
  return JSON.stringify(a) !== JSON.stringify(b);
}
export function scope(
  step: Step | undefined,
  frameId?: number,
): Record<string, Value> {
  if (!step) return {};
  return (
    (frameId === undefined
      ? step.stack.at(-1)?.locals
      : step.stack.find((f) => f.id === frameId)?.locals) || step.globals
  );
}
