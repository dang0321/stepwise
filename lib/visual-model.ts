import { container, type Value } from './trace.ts';
export type ViewKind =
  | 'auto'
  | 'array'
  | 'cards'
  | 'table'
  | 'prefix'
  | 'grid'
  | 'graph'
  | 'heap'
  | 'forest'
  | 'bits'
  | 'queue'
  | 'stack'
  | 'frequency'
  | 'distance'
  | 'interval'
  | 'string';
export type Focus = {
  variable: string;
  indices: (number | string)[];
  kind: 'read' | 'write';
  expression: string;
};
export type Role = {
  view: ViewKind;
  reason: string;
  priority: number;
  line: number;
  bindings?: { current?: string; neighbor?: string };
};
export type Analysis = {
  candidates: {
    id: string;
    label: string;
    evidence: string;
    lines: number[];
    confidence: string;
    rank: number;
  }[];
  roles: Record<string, Record<string, Role>>;
  bounds: Record<
    string,
    Record<string, { left: string; right: string; mid?: string }>
  >;
  note: string;
};
export function sequence(v: Value | undefined): Value[] | null {
  return container(v) && v.items && v.type !== 'dict'
    ? (v.items as Value[])
    : null;
}
export function extent(values: (Value | undefined)[]) {
  let min = 0,
    max = 1;
  for (const v of values) {
    for (const x of sequence(v) || []) {
      if (typeof x === 'number' && Number.isFinite(x)) {
        min = Math.min(min, x);
        max = Math.max(max, x);
      }
    }
  }
  return { min, max };
}
export function focusKind(
  focus: Focus[],
  name: string,
  indices: (number | string)[],
  length?: number | number[],
) {
  const lengths = typeof length === 'number' ? [length] : length || [];
  const match = focus.filter(
    (f) =>
      f.variable === name &&
      f.indices.length === indices.length &&
      f.indices.every((n, i) => {
        const size = lengths[i];
        const normal = typeof n === 'number' && n < 0 && size ? n + size : n;
        return normal === indices[i];
      }),
  );
  return match.some((f) => f.kind === 'write')
    ? 'write'
    : match.length
      ? 'read'
      : '';
}
export function graphModel(v: Value) {
  const rows =
    container(v) && v.type === 'dict'
      ? (v.items as [Value, Value][])
      : sequence(v)?.map((x, i) => [i, x] as [Value, Value]);
  if (!rows || rows.length > 24) return null;
  const keys = rows.map(([k]) => k);
  if (keys.some((k) => typeof k !== 'number' && typeof k !== 'string'))
    return null;
  const edges: { from: number; to: number; weight?: Value }[] = [];
  for (let from = 0; from < rows.length; from++) {
    const neighbors = sequence(rows[from][1]);
    if (!neighbors) return null;
    for (const item of neighbors) {
      const pair = sequence(item),
        target = pair?.length === 2 ? pair[0] : item,
        weight = pair?.length === 2 ? pair[1] : undefined;
      if (weight !== undefined && typeof weight !== 'number') return null;
      const to = keys.findIndex((k) => k === target);
      if (to < 0) return null;
      edges.push({ from, to, ...(weight !== undefined ? { weight } : {}) });
    }
  }
  return { keys, edges };
}
export function chooseView(
  value: Value,
  role?: Role,
  override: ViewKind = 'auto',
): ViewKind {
  if (override !== 'auto') return override;
  if (role) return role.view;
  if (typeof value === 'string') return 'string';
  if (container(value) && value.type === 'deque') return 'queue';
  if (sequence(value)?.some((x) => sequence(x) !== null)) return 'grid';
  if (sequence(value)?.every((x) => typeof x === 'number')) return 'array';
  return 'cards';
}
