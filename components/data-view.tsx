'use client';
import { changed, container, format, type Value } from '@/lib/trace';

function Scalar({
  value,
  previous,
}: {
  value: Value;
  previous: Value | undefined;
}) {
  return (
    <span
      className={
        'value-cell ' + (changed(value, previous) ? 'cell-changed' : '')
      }
    >
      {format(value)}
    </span>
  );
}
export function DataView({
  value,
  previous,
  variables,
}: {
  value: Value;
  previous: Value | undefined;
  variables: Record<string, Value>;
}) {
  if (!container(value) || !value.items)
    return (
      <div className="scalar-view">
        <Scalar value={value} previous={previous} />
      </div>
    );
  const oldItems = container(previous) ? previous.items : undefined;
  const items = value.items as Value[];
  const clipped = !!value.length && value.length > items.length;
  const notice = clipped ? (
    <p className="data-note">
      전체 {value.length}개 중 처음 {items.length}개 표시
    </p>
  ) : null;
  if (value.type === 'dict') {
    const entries = value.items as [Value, Value][];
    const nodeNames = entries.map(([k]) => format(k));
    const isGraph =
      entries.length > 0 &&
      entries.length <= 20 &&
      entries.every(
        ([, v]) =>
          container(v) &&
          v.items &&
          v.type !== 'dict' &&
          (v.items as Value[]).every((n) => nodeNames.includes(format(n))),
      );
    if (isGraph) {
      const positions = entries.map((_, i) => ({
        x:
          200 +
          Math.cos((2 * Math.PI * i) / entries.length - Math.PI / 2) * 140,
        y:
          120 + Math.sin((2 * Math.PI * i) / entries.length - Math.PI / 2) * 85,
      }));
      const active = format(variables.node),
        neighbor = format(variables.neighbor);
      return (
        <div className="graph-view">
          <svg
            viewBox="0 0 400 240"
            role="img"
            aria-label="딕셔너리를 방향 그래프의 인접 리스트로 해석한 그림"
          >
            <defs>
              <marker
                id="arrow"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6" fill="#637b71" />
              </marker>
            </defs>
            {entries.flatMap(([, v], i) =>
              (v as { items: Value[] }).items.map((n, j) => {
                const t = nodeNames.indexOf(format(n)),
                  a = positions[i],
                  b = positions[t],
                  d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
                return i === t ? (
                  <circle
                    key={i + '-' + j}
                    cx={a.x + 14}
                    cy={a.y - 18}
                    r={13}
                    fill="none"
                    stroke="#637b71"
                  />
                ) : (
                  <line
                    key={i + '-' + j}
                    x1={a.x + ((b.x - a.x) * 23) / d}
                    y1={a.y + ((b.y - a.y) * 23) / d}
                    x2={b.x - ((b.x - a.x) * 27) / d}
                    y2={b.y - ((b.y - a.y) * 27) / d}
                    stroke="#526b60"
                    strokeWidth="1.5"
                    markerEnd="url(#arrow)"
                  />
                );
              }),
            )}
            {entries.map(([k], i) => (
              <g
                key={i}
                className={
                  nodeNames[i] === active
                    ? 'node-active'
                    : nodeNames[i] === neighbor
                      ? 'node-neighbor'
                      : ''
                }
              >
                <circle
                  cx={positions[i].x}
                  cy={positions[i].y}
                  r={23}
                  fill="#253b31"
                  stroke="#608b70"
                />
                <text
                  x={positions[i].x}
                  y={positions[i].y + 5}
                  textAnchor="middle"
                  fill="#d9e8df"
                  fontSize="13"
                >
                  {format(k).slice(0, 9)}
                </text>
              </g>
            ))}
          </svg>
          <p className="data-note">
            인접 리스트로 해석 · 화살표는 연결 방향 · 밝은 노드는 node 변수
          </p>
        </div>
      );
    }
    return (
      <div className="dictionary-view">
        {entries.length === 0 ? (
          <p className="empty-copy">빈 딕셔너리입니다.</p>
        ) : (
          entries.map(([k, v], i) => {
            const old = (oldItems as [Value, Value][] | undefined)?.find(
              ([key]) => format(key) === format(k),
            );
            return (
              <div className="dictionary-row" key={i}>
                <code>{format(k)}</code>
                <span>→</span>
                <Scalar value={v} previous={old?.[1]} />
              </div>
            );
          })
        )}
        {notice}
      </div>
    );
  }
  const isMatrix =
    items.length > 0 &&
    items.every(
      (v) => container(v) && ['list', 'tuple'].includes(v.type) && v.items,
    );
  if (isMatrix)
    return (
      <div className="matrix-wrap">
        <div className="matrix">
          {items.map((row, r) => (
            <div className="matrix-row" key={r}>
              <span className="matrix-index">{r}</span>
              {(row as { items: Value[] }).items.map((cell, c) => {
                const oldRow = oldItems?.[r] as Value | undefined;
                return (
                  <div key={c} title={'[' + r + '][' + c + ']'}>
                    <small>
                      {r},{c}
                    </small>
                    <Scalar
                      value={cell}
                      previous={
                        container(oldRow)
                          ? (oldRow.items as Value[] | undefined)?.[c]
                          : undefined
                      }
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p className="data-note">각 칸의 작은 숫자는 행, 열 인덱스입니다.</p>
        {notice}
      </div>
    );
  const numeric =
    items.length > 0 && items.every((v) => typeof v === 'number' && v >= 0);
  const pointers = Object.entries(variables).filter(
    ([k, v]) =>
      ['i', 'j', 'left', 'right', 'mid', 'low', 'high'].includes(k) &&
      typeof v === 'number' &&
      Number.isInteger(v) &&
      v >= 0 &&
      v < items.length,
  );
  if (numeric) {
    const max = Math.max(...(items as number[]), 1);
    return (
      <div>
        <div className="bars">
          {(items as number[]).map((v, i) => (
            <div
              className={
                'bar-column ' +
                (changed(v, (oldItems as Value[] | undefined)?.[i])
                  ? 'changed'
                  : '')
              }
              key={i}
            >
              <span className="pointer">
                {pointers
                  .filter(([, v]) => v === i)
                  .map(([k]) => k)
                  .join(', ')}
              </span>
              <span className="bar-value">{v}</span>
              <div
                className="bar"
                style={{ height: Math.max(4, (v / max) * 155) }}
              />
              <span className="bar-index">{i}</span>
            </div>
          ))}
        </div>
        <p className="data-note">
          막대 높이 = 값 · 아래 숫자 = 인덱스
          {pointers.length > 0 ? ' · 위 이름 = 같은 인덱스 값을 가진 변수' : ''}
        </p>
        {notice}
      </div>
    );
  }
  return (
    <div className="sequence-view">
      {items.length === 0 ? (
        <p className="empty-copy">비어 있는 {value.type}입니다.</p>
      ) : (
        <div className="sequence">
          {items.map((v, i) => (
            <div key={i}>
              <Scalar
                value={v}
                previous={(oldItems as Value[] | undefined)?.[i]}
              />
              <small>
                {value.type === 'set' || value.type === 'frozenset'
                  ? '항목'
                  : i}
              </small>
            </div>
          ))}
        </div>
      )}
      <p className="data-note">
        {value.type === 'deque'
          ? '왼쪽 = 큐의 앞 · 오른쪽 = 큐의 뒤'
          : value.type === 'set'
            ? '집합의 표시 순서는 정렬 순서가 아닙니다.'
            : '테두리가 밝은 칸은 직전 단계에서 바뀐 값입니다.'}
      </p>
      {notice}
    </div>
  );
}
