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
  aliases?: string[];
};
export type Role = {
  view: ViewKind;
  reason: string;
  priority: number;
  line: number;
  bindings?: { current?: string; neighbor?: string };
  origin?: 'code' | 'shared';
  aliases?: string[];
  neighborIndex?: number;
  related?: string[];
  widthVariable?: string;
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
      (f.variable === name || f.aliases?.includes(name)) &&
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

function complete(v: Value | undefined) {
  return (
    container(v) &&
    !!v.items &&
    (v.length === undefined || v.length === v.items.length)
  );
}
export function graphModel(v: Value, neighborIndex = 0) {
  const dictionary = container(v) && v.type === 'dict';
  if (!complete(v)) return null;
  const rows = dictionary
    ? (v.items as [Value, Value][])
    : sequence(v)?.map((x, i) => [i, x] as [Value, Value]);
  if (!rows || rows.length > 24) return null;
  const keys: Value[] = rows.map(([k]) => k);
  if (keys.some((k) => typeof k !== 'number' && typeof k !== 'string'))
    return null;
  const edges: { from: number; to: number; weight?: Value }[] = [];
  for (let from = 0; from < rows.length; from++) {
    const neighbors = rows[from][1];
    if (!complete(neighbors)) return null;
    const weightedMap = container(neighbors) && neighbors.type === 'dict';
    const entries = weightedMap
      ? (neighbors.items as [Value, Value][])
      : sequence(neighbors)?.map((item) => {
          const pair = sequence(item);
          return pair?.length === 2
            ? ([
                pair[neighborIndex === 1 ? 1 : 0],
                pair[neighborIndex === 1 ? 0 : 1],
              ] as [Value, Value])
            : ([item, undefined] as [Value, undefined]);
        });
    if (!entries) return null;
    for (const [target, weight] of entries) {
      if (typeof target !== 'number' && typeof target !== 'string') return null;
      if (
        weight !== undefined &&
        (typeof weight !== 'number' || !Number.isFinite(weight))
      )
        return null;
      let to = keys.findIndex((k) => k === target);
      if (to < 0) {
        if (!dictionary || keys.length >= 24) return null;
        to = keys.length;
        keys.push(target);
      }
      edges.push({ from, to, ...(weight !== undefined ? { weight } : {}) });
    }
  }
  return { keys, edges };
}
export const VIEW_LABELS: Record<ViewKind, string> = {
  auto: '자동 추천',
  array: '배열 막대',
  cards: '값 카드',
  table: '상태 테이블',
  prefix: '누적값',
  grid: '행·열 격자',
  graph: '방향 그래프',
  heap: '이진 힙',
  forest: '부모 관계',
  bits: '비트',
  queue: '큐',
  stack: '스택',
  frequency: '키별 집계',
  distance: '거리·비용',
  interval: '인덱스 탐색',
  string: '문자열',
};
export function compatibleView(
  value: Value,
  view: ViewKind,
  role?: Role,
): boolean {
  const items = sequence(value);
  if (view === 'graph') return graphModel(value, role?.neighborIndex) !== null;
  if (view === 'forest')
    return (
      complete(value) &&
      !!items &&
      items.length <= 24 &&
      items.every(
        (x) =>
          typeof x === 'number' &&
          Number.isInteger(x) &&
          x >= 0 &&
          x < items.length,
      )
    );
  if (view === 'bits')
    return (
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    );
  if (view === 'string') return typeof value === 'string';
  if (view === 'array' || view === 'interval')
    return (
      !!items && items.every((x) => typeof x === 'number' && Number.isFinite(x))
    );
  if (view === 'heap')
    return (
      complete(value) &&
      !!items &&
      items.length <= 31 &&
      container(value) &&
      ['list', 'tuple'].includes(value.type)
    );
  if (view === 'queue' || view === 'stack')
    return (
      !!items &&
      container(value) &&
      ['list', 'tuple', 'deque'].includes(value.type)
    );
  if (view === 'grid')
    return (
      !!items && items.length > 0 && items.every((x) => sequence(x) !== null)
    );
  if (view === 'frequency')
    return (
      container(value) &&
      value.type === 'dict' &&
      !!value.items &&
      (value.items as [Value, Value][]).every(([, v]) => typeof v === 'number')
    );
  if (['table', 'prefix', 'distance'].includes(view))
    return !!items || (container(value) && value.type === 'dict');
  return true;
}
function valueView(value: Value): ViewKind {
  if (typeof value === 'string') return 'string';
  if (container(value) && value.type === 'deque') return 'queue';
  const items = sequence(value);
  if (items?.length && items.every((x) => sequence(x) !== null)) return 'grid';
  if (
    items?.length &&
    items.every((x) => typeof x === 'number' && Number.isFinite(x))
  )
    return 'array';
  return 'cards';
}
export function recommendView(
  value: Value,
  role?: Role,
  override: ViewKind = 'auto',
) {
  const requested = override !== 'auto' ? override : role?.view;
  const view =
    requested && compatibleView(value, requested, role)
      ? requested
      : valueView(value);
  const fallback = !!requested && requested !== view;
  const source = override !== 'auto' ? 'manual' : role ? 'code' : 'value';
  const reason = fallback
    ? VIEW_LABELS[requested!] +
      '로 표시하기에는 현재 값의 구조나 표시 범위가 맞지 않아 ' +
      VIEW_LABELS[view] +
      '로 표시합니다.'
    : source === 'manual'
      ? '직접 선택한 보기입니다.'
      : role
        ? role.reason + ' · 현재 값의 구조 확인'
        : '역할을 확정할 근거가 부족해 현재 자료형에 맞춰 표시합니다.';
  return { view, source, reason, fallback };
}
export function chooseView(
  value: Value,
  role?: Role,
  override: ViewKind = 'auto',
): ViewKind {
  return recommendView(value, role, override).view;
}

export function globalFocus(focus: Focus[], localNames: string[]): Focus[] {
  const hidden = new Set(localNames);
  return focus.flatMap((f) => {
    const names = [f.variable, ...(f.aliases || [])].filter(
      (n) => !hidden.has(n),
    );
    return names.length
      ? [{ ...f, variable: names[0], aliases: names.slice(1) }]
      : [];
  });
}
export function graphState(
  value: Value | undefined,
  key: Value,
): Value | undefined {
  if (container(value) && value.type === 'dict')
    return (value.items as [Value, Value][] | undefined)?.find(
      ([k]) => k === key,
    )?.[1];
  const values = sequence(value);
  return values && typeof key === 'number' && Number.isInteger(key) && key >= 0
    ? values[key]
    : undefined;
}
