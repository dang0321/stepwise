'use client';
// SVG diagrams expose image semantics without replacing their vector content.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import { useId } from 'react';
import { changed, container, format, type Value } from '@/lib/trace';
import {
  chooseView,
  focusKind,
  graphModel,
  graphState,
  sequence,
  type Focus,
  type Role,
  type ViewKind,
} from '@/lib/visual-model';

type Props = {
  value: Value;
  previous: Value | undefined;
  variables: Record<string, Value>;
  name?: string;
  focus?: Focus[];
  role?: Role;
  mode?: ViewKind;
  scale?: { min: number; max: number };
  bounds?: { left: string; right: string; mid?: string };
};
function Cell({
  value,
  previous,
  focus = '',
}: {
  value: Value;
  previous?: Value;
  focus?: string;
}) {
  return (
    <span
      className={
        'value-cell ' +
        (changed(value, previous) ? 'cell-changed ' : '') +
        (focus ? 'focus-' + focus : '')
      }
    >
      {format(value)}
    </span>
  );
}
function Graph({
  value,
  variables,
  role,
  focus,
  name,
  forest = false,
}: {
  value: Value;
  variables: Record<string, Value>;
  role?: Role;
  focus: Focus[];
  name: string;
  forest?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const items = sequence(value);
  const model =
    forest &&
    items &&
    items.length <= 24 &&
    items.every(
      (x) =>
        typeof x === 'number' &&
        Number.isInteger(x) &&
        x >= 0 &&
        x < items.length,
    )
      ? {
          keys: items.map((_, i) => i),
          edges: items.flatMap((p, i) =>
            p === i ? [] : [{ from: i, to: p as number, weight: undefined }],
          ),
        }
      : graphModel(value, role?.neighborIndex);
  if (!model)
    return (
      <div className="view-fallback">
        <p>
          이 값은 {forest ? '부모 인덱스 배열' : '인접 리스트'}로 해석할 수
          없거나 정점이 24개를 넘습니다. 값 카드를 표시합니다.
        </p>
        <pre>{format(value)}</pre>
      </div>
    );
  const { keys, edges } = model;
  const positions = keys.map((_, i) => ({
    x:
      230 +
      Math.cos((2 * Math.PI * i) / Math.max(1, keys.length) - Math.PI / 2) *
        165,
    y:
      145 +
      Math.sin((2 * Math.PI * i) / Math.max(1, keys.length) - Math.PI / 2) *
        103,
  }));
  const active = role?.bindings?.current
    ? variables[role.bindings.current]
    : focus.find((f) => f.variable === name || f.aliases?.includes(name))
        ?.indices[0];
  const neighbor = role?.bindings?.neighbor
    ? variables[role.bindings.neighbor]
    : undefined;
  const stateName = role?.related?.find((n) =>
    keys.some((key) => graphState(variables[n], key) !== undefined),
  );
  return (
    <div className="graph-view">
      <svg
        viewBox="0 0 460 290"
        role="img"
        aria-label={
          forest ? '부모를 가리키는 집합 트리' : '가중치를 포함한 방향 그래프'
        }
      >
        <defs>
          <marker
            id={id}
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            <path d="M0,0 L7,3.5 L0,7" fill="#839d8d" />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const a = positions[e.from],
            b = positions[e.to],
            d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const reciprocal = edges.some(
            (other) => other.from === e.to && other.to === e.from,
          );
          const bend = reciprocal ? 24 : 0;
          const cx = (a.x + b.x) / 2 - ((b.y - a.y) * bend) / d;
          const cy = (a.y + b.y) / 2 + ((b.x - a.x) * bend) / d;
          return (
            <g key={i}>
              {e.from === e.to ? (
                <path
                  d={'M ' + a.x + ' ' + (a.y - 22) + ' c 40 -35 40 35 5 20'}
                  fill="none"
                  stroke="#839d8d"
                  markerEnd={'url(#' + id + ')'}
                />
              ) : (
                <path
                  d={
                    'M ' +
                    (a.x + ((b.x - a.x) * 23) / d) +
                    ' ' +
                    (a.y + ((b.y - a.y) * 23) / d) +
                    ' Q ' +
                    cx +
                    ' ' +
                    cy +
                    ' ' +
                    (b.x - ((b.x - a.x) * 28) / d) +
                    ' ' +
                    (b.y - ((b.y - a.y) * 28) / d)
                  }
                  fill="none"
                  stroke="#607c6b"
                  strokeWidth={keys[e.from] === active ? 2.5 : 1.2}
                  markerEnd={'url(#' + id + ')'}
                />
              )}{' '}
              {e.weight !== undefined && (
                <text
                  x={e.from === e.to ? a.x + 30 : (a.x + b.x + 2 * cx) / 4 + 6}
                  y={e.from === e.to ? a.y - 20 : (a.y + b.y + 2 * cy) / 4 - 6}
                  className="edge-weight"
                >
                  {format(e.weight)}
                </text>
              )}
            </g>
          );
        })}
        {keys.map((key, i) => (
          <g
            key={i}
            className={
              key === active
                ? 'node-active'
                : key === neighbor
                  ? 'node-neighbor'
                  : ''
            }
          >
            <circle
              cx={positions[i].x}
              cy={positions[i].y}
              r={23}
              fill={forest && items?.[i] === i ? '#35583e' : '#253b31'}
              stroke="#70977c"
            />
            <text
              x={positions[i].x}
              y={positions[i].y + 5}
              textAnchor="middle"
              fill="#d9e8df"
              fontSize="13"
            >
              {(typeof key === 'string' ? key : format(key)).slice(0, 12)}
            </text>
            {stateName &&
              graphState(variables[stateName], key) !== undefined && (
                <text
                  x={positions[i].x}
                  y={positions[i].y + 38}
                  textAnchor="middle"
                  fill="#b9d7c1"
                  fontSize="10"
                >
                  {format(graphState(variables[stateName], key)).slice(0, 16)}
                </text>
              )}
            {stateName && (
              <title>
                {stateName +
                  '[' +
                  format(key) +
                  '] = ' +
                  format(graphState(variables[stateName], key))}
              </title>
            )}
          </g>
        ))}
      </svg>
      <p className="data-note">
        {forest
          ? '화살표: 자식 → 부모 · 진한 정점: 자기 자신을 부모로 가진 대표 · 배치는 고정됩니다.'
          : '화살표: 연결 방향 · 선 위 숫자: 가중치 · 밝은 정점: 이웃 조회에 쓰인 현재 값'}
        {stateName && ' · 정점 아래: ' + stateName + '의 현재 값'}
      </p>
    </div>
  );
}
function Heap({ items, previous }: { items: Value[]; previous: Value[] }) {
  if (items.length > 31)
    return (
      <div className="view-fallback">
        <p>힙 트리는 31개 이하일 때 표시합니다.</p>
        <pre>{format({ type: 'list', items, length: items.length })}</pre>
      </div>
    );
  const levels = Math.max(
      1,
      Math.floor(Math.log2(Math.max(1, items.length))) + 1,
    ),
    height = levels * 65;
  const pos = items.map((_, i) => {
    const l = Math.floor(Math.log2(i + 1)),
      first = 2 ** l - 1;
    return { x: ((i - first + 0.5) * 460) / 2 ** l, y: 32 + l * 65 };
  });
  return (
    <div className="heap-view">
      <svg
        viewBox={'0 0 460 ' + height}
        role="img"
        aria-label="배열 인덱스에 따른 이진 힙 트리"
      >
        {pos.slice(1).map((p, j) => {
          const a = pos[Math.floor(j / 2)];
          return (
            <line
              key={j}
              x1={a.x}
              y1={a.y}
              x2={p.x}
              y2={p.y}
              stroke="#55745d"
            />
          );
        })}
        {items.map((v, i) => (
          <g key={i}>
            <circle
              cx={pos[i].x}
              cy={pos[i].y}
              r={22}
              fill={changed(v, previous[i]) ? '#426e4e' : '#263b2d'}
              stroke="#91c29e"
            />
            <text
              x={pos[i].x}
              y={pos[i].y + 4}
              textAnchor="middle"
              fill="#deeee2"
              fontSize="11"
            >
              {format(v).slice(0, 12)}
            </text>
            <text
              x={pos[i].x + 25}
              y={pos[i].y - 15}
              fill="#91a996"
              fontSize="10"
            >
              {i}
            </text>
            <title>{'[' + i + '] ' + format(v)}</title>
          </g>
        ))}
      </svg>
      <p className="data-note">
        부모 i → 자식 2i+1, 2i+2 · 힙은 전체 정렬된 배열이 아닙니다.
      </p>
    </div>
  );
}
export function DataView({
  value,
  previous,
  variables,
  name = '',
  focus = [],
  role,
  mode = 'auto',
  scale,
  bounds,
}: Props) {
  const view = chooseView(value, role, mode),
    items = sequence(value),
    old = sequence(previous) || [];
  const clipped =
    container(value) &&
    value.length !== undefined &&
    value.items &&
    value.length > value.items.length;
  const notice = clipped ? (
    <p className="data-note">
      전체 {value.length}개 중 처음 {value.items!.length}개 표시
    </p>
  ) : null;
  if (view === 'graph' || view === 'forest')
    return (
      <>
        <Graph
          value={value}
          variables={variables}
          role={role}
          focus={focus}
          name={name}
          forest={view === 'forest'}
        />
        {notice}
      </>
    );
  if (
    view === 'bits' &&
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  ) {
    const bits = value
      .toString(2)
      .padStart(
        Math.max(
          4,
          Math.min(
            32,
            role?.widthVariable &&
              typeof variables[role.widthVariable] === 'number'
              ? (variables[role.widthVariable] as number)
              : 4,
          ),
        ),
        '0',
      );
    return (
      <div className="bits-view">
        <div className="sequence">
          {bits.split('').map((b, i) => (
            <div key={i}>
              <span
                className={'value-cell ' + (b === '1' ? 'cell-changed' : '')}
              >
                {b}
              </span>
              <small>2^{bits.length - i - 1}</small>
            </div>
          ))}
        </div>
        <p className="data-note">
          10진수 {value} · 켜진 비트는 1입니다. 오른쪽부터 0번 비트입니다.
        </p>
      </div>
    );
  }
  if (view === 'heap' && items)
    return (
      <>
        <Heap items={items} previous={old} />
        {notice}
      </>
    );
  if (typeof value === 'string') {
    return (
      <div className="sequence-view">
        <div className="sequence">
          {Array.from(value).map((v, i) => (
            <div key={i}>
              <Cell
                value={v}
                previous={
                  typeof previous === 'string'
                    ? Array.from(previous)[i]
                    : undefined
                }
                focus={focusKind(focus, name, [i], Array.from(value).length)}
              />
              <small>{i}</small>
            </div>
          ))}
        </div>
        <p className="data-note">
          문자 단위 인덱스 · 노란 테두리: 다음 쓰기 · 파란 테두리: 다음 읽기
        </p>
      </div>
    );
  }
  if (!container(value) || !value.items)
    return (
      <div className="scalar-view">
        <Cell value={value} previous={previous} />
      </div>
    );
  if (value.type === 'dict') {
    const entries = value.items as [Value, Value][],
      before =
        container(previous) && previous.type === 'dict'
          ? (previous.items as [Value, Value][])
          : [];
    const max = Math.max(
      1,
      ...entries.map(([, v]) => (typeof v === 'number' ? Math.abs(v) : 0)),
    );
    return (
      <div className="dictionary-view">
        {entries.map(([k, v], i) => (
          <div className="dictionary-row" key={i}>
            <code>{format(k)}</code>
            <span>→</span>
            <Cell
              value={v}
              previous={before.find(([key]) => format(key) === format(k))?.[1]}
              focus={
                typeof k === 'number' || typeof k === 'string'
                  ? focusKind(focus, name, [k])
                  : ''
              }
            />
            {view === 'frequency' && typeof v === 'number' && v >= 0 && (
              <span
                className="frequency-bar"
                style={{ width: (v / max) * 120 }}
              />
            )}
          </div>
        ))}
        {entries.length === 0 && <p className="empty-copy">빈 매핑입니다.</p>}
        {notice}
      </div>
    );
  }
  if (!items) return null;
  const matrix = items.length > 0 && items.every((x) => sequence(x) !== null);
  if (matrix && view !== 'cards' && view !== 'stack' && view !== 'queue') {
    return (
      <div className="matrix-wrap">
        <div className="matrix">
          {items.map((row, r) => (
            <div className="matrix-row" key={r}>
              <span className="matrix-index">{r}</span>
              {sequence(row)!.map((v, c) => (
                <div key={c}>
                  <small>
                    {r},{c}
                  </small>
                  <Cell
                    value={v}
                    previous={sequence(old[r])?.[c]}
                    focus={focusKind(
                      focus,
                      name,
                      [r, c],
                      [
                        value.length ?? items.length,
                        container(row)
                          ? (row.length ?? sequence(row)!.length)
                          : sequence(row)!.length,
                      ],
                    )}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="data-note">
          행, 열 인덱스 · 노란색: 다음 쓰기 대상 · 파란색: 다음 읽기 대상 ·
          녹색: 직전 단계에서 바뀐 값
        </p>
        {notice}
      </div>
    );
  }
  const numeric =
    items.length > 0 &&
    items.every((v) => typeof v === 'number' && Number.isFinite(v));
  if (numeric && ['array', 'interval', 'auto'].includes(view)) {
    const min = scale?.min ?? Math.min(0, ...(items as number[])),
      max = scale?.max ?? Math.max(1, ...(items as number[])),
      height = 180;
    const y = (v: number) => 18 + ((max - v) / (max - min || 1)) * height,
      zero = y(0);
    return (
      <>
        <div className="signed-bars">
          <div className="zero-line" style={{ top: zero }}>
            <small>0</small>
          </div>
          {(items as number[]).map((v, i) => {
            const kind = focusKind(
              focus,
              name,
              [i],
              value.length ?? items.length,
            );
            const pointer = bounds
              ? Object.values(bounds).filter((n) => variables[n] === i)
              : [];
            return (
              <div
                className={
                  'signed-column ' +
                  (changed(v, old[i]) ? 'changed ' : '') +
                  (kind ? 'focus-' + kind + ' ' : '')
                }
                key={i}
              >
                <span className="pointer">{pointer.join(', ')}</span>
                <div
                  className="signed-bar"
                  style={{
                    top: Math.min(y(v), zero),
                    height: Math.max(3, Math.abs(y(v) - zero)),
                  }}
                />
                <strong style={{ top: v >= 0 ? y(v) - 18 : y(v) + 4 }}>
                  {v}
                </strong>
                <small className="signed-index">{i}</small>
              </div>
            );
          })}
        </div>
        <p className="data-note">
          기록 전체에 고정된 눈금 · 0선 아래는 음수
          {bounds ? ' · 포인터는 코드에서 찾은 경계 변수의 현재 위치' : ''} ·
          노란/파란 테두리는 다음 접근 위치
        </p>
        {notice}
      </>
    );
  }
  return (
    <div
      className={'sequence-view ' + (view === 'stack' ? 'vertical-stack' : '')}
    >
      <div className="sequence">
        {items.map((v, i) => (
          <div key={i}>
            <Cell
              value={v}
              previous={old[i]}
              focus={focusKind(focus, name, [i], value.length ?? items.length)}
            />
            <small>
              {view === 'queue'
                ? i === 0
                  ? 'FRONT'
                  : i === items.length - 1
                    ? 'BACK'
                    : i
                : view === 'stack' && i === items.length - 1
                  ? 'TOP'
                  : value.type === 'set'
                    ? '항목'
                    : i}
            </small>
          </div>
        ))}
      </div>
      {items.length === 0 && <p className="empty-copy">비어 있습니다.</p>}
      <p className="data-note">
        {view === 'table'
          ? '점화식 테이블 · 다음에 참조할 상태와 갱신할 상태를 테두리로 구분합니다.'
          : view === 'prefix'
            ? '누적값 테이블 · 각 칸이 어느 시점에 갱신되는지 확인하세요.'
            : view === 'stack'
              ? '아래에서 위로 쌓입니다. TOP이 다음 pop() 대상입니다.'
              : view === 'queue'
                ? 'FRONT에서 꺼내고 BACK에 넣는 순서입니다.'
                : '각 칸은 현재 값입니다. 변경된 값은 녹색으로 강조합니다.'}
      </p>
      {notice}
    </div>
  );
}
