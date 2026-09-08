'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Workflow,
  Code2,
  Braces,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  RotateCcw,
  Terminal,
  Layers3,
  Pencil,
  CircleHelp,
  LoaderCircle,
  ArrowRight,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataView } from '@/components/data-view';
import { InputSamples } from '@/components/input-samples';
import {
  extent,
  compatibleView,
  recommendView,
  globalFocus,
  VIEW_LABELS,
  type Role,
  type ViewKind,
} from '@/lib/visual-model';
import { examples } from '@/lib/examples';
import { changed, container, format, type TraceResult } from '@/lib/trace';

type Status = 'idle' | 'loading' | 'running' | 'ready' | 'error';
function Pick({
  value,
  onChange,
  items,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => v !== null && onChange(v)}
      disabled={disabled}
    >
      <SelectTrigger aria-label={label} className="pick-trigger">
        <SelectValue>
          {items.find((x) => x.value === value)?.label || label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="pick-content">
        {items.map((x) => (
          <SelectItem value={x.value} key={x.value}>
            {x.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Highlight({ line }: { line: string }) {
  const parts = line.split(
    /(#[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:for|while|if|else|elif|in|not|and|or|def|return|break|continue|from|import|True|False|None)\b|\b\d+\b|\b(?:print|input|range|len|int|list|map|enumerate|sum)\b)/g,
  );
  return (
    <>
      {parts.map((p, i) => (
        <span
          key={i}
          className={
            p.startsWith('#')
              ? 'syntax-comment'
              : /^["']/.test(p)
                ? 'syntax-string'
                : /^\d+$/.test(p)
                  ? 'syntax-number'
                  : /^(for|while|if|else|elif|in|not|and|or|def|return|break|continue|from|import|True|False|None)$/.test(
                        p,
                      )
                    ? 'syntax-keyword'
                    : /^(print|input|range|len|int|list|map|enumerate|sum)$/.test(
                          p,
                        )
                      ? 'syntax-call'
                      : ''
          }
        >
          {p}
        </span>
      ))}
    </>
  );
}

export default function Home() {
  const [code, setCode] = useState(examples[0].code),
    [stdin, setStdin] = useState(''),
    [example, setExample] = useState('bubble');
  const [result, setResult] = useState<TraceResult | null>(null),
    [status, setStatus] = useState<Status>('idle'),
    [message, setMessage] = useState('');
  const [cursor, setCursor] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState('1'),
    [editing, setEditing] = useState(true);
  const [variable, setVariable] = useState(''),
    [frameChoice, setFrameChoice] = useState('current'),
    [help, setHelp] = useState(false);
  const [viewPreference, setViewPreference] = useState<{
    variable: string;
    mode: ViewKind;
  }>({ variable: '', mode: 'auto' });
  const worker = useRef<Worker | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    codeViewport = useRef<HTMLDivElement>(null),
    insightViewport = useRef<HTMLDivElement>(null);
  const busy = status === 'loading' || status === 'running';
  const stepCount = result?.steps.length || 0;
  const steps = result?.steps || [],
    step = steps[cursor],
    previous = steps[cursor - 1];
  const actualFrame =
    frameChoice === 'global'
      ? undefined
      : frameChoice === 'current'
        ? step?.stack.at(-1)
        : step?.stack.find((f) => String(f.id) === frameChoice) ||
          step?.stack.at(-1);
  const vars = { ...step?.globals, ...actualFrame?.locals };
  const oldVars = actualFrame
    ? {
        ...previous?.globals,
        ...previous?.stack.find((f) => f.id === actualFrame.id)?.locals,
      }
    : previous?.globals || {};
  const scopeId = actualFrame?.scope || '<module>';
  const roles = result?.analysis?.roles || {};
  function roleFor(name: string): Role | undefined {
    if (actualFrame && Object.hasOwn(actualFrame.locals, name))
      return actualFrame.roles?.[name] || roles[scopeId]?.[name];
    return step?.roles?.[name] || roles['<module>']?.[name];
  }
  const preferred: Record<string, string> = {
    dijkstra: 'graph',
    topological: 'graph',
    bfs: 'graph',
    dfs: 'graph',
    union_find: 'forest',
    binary_search: 'interval',
    two_pointers: 'interval',
    sliding_window: 'interval',
    backtracking: 'stack',
    dynamic_programming: 'table',
    prefix_sum: 'prefix',
    heap: 'heap',
    frequency: 'frequency',
    bitmask: 'bits',
    string_matching: 'table',
  };
  preferred.grid_bfs = 'grid';
  const preferredView = preferred[result?.analysis?.candidates[0]?.id || ''];
  const names = Object.keys(vars),
    structures = names.filter(
      (k) => container(vars[k]) && (vars[k] as { items?: unknown }).items,
    );
  const ranked = [...names].sort((a, b) => {
    const score = (name: string) => {
      const r = roleFor(name);
      const supported = r && compatibleView(vars[name], r.view, r);
      return (
        (supported ? r.priority : 0) * 10 +
        (supported && r.origin === 'code' ? 2 : 0) +
        (supported && r.view === preferredView ? 100 : 0) +
        (step?.focus?.some(
          (f) => f.variable === name || f.aliases?.includes(name),
        )
          ? 3
          : 0) +
        (structures.includes(name) ? 1 : 0)
      );
    };
    return score(b) - score(a);
  });
  const selected = names.includes(variable) ? variable : ranked[0] || '';
  const viewMode =
    viewPreference.variable === selected ? viewPreference.mode : 'auto';
  const selectedRole = roleFor(selected);
  const recommendation = selected
    ? recommendView(vars[selected], selectedRole, viewMode)
    : null;
  const selectedBounds =
    result?.analysis?.bounds[scopeId]?.[selected] ||
    (scopeId === '<module>' ||
    !actualFrame ||
    !Object.hasOwn(actualFrame.locals, selected)
      ? result?.analysis?.bounds['<module>']?.[selected]
      : undefined);
  const topFrame = step?.stack.at(-1);
  const visibleFocus =
    actualFrame?.id === topFrame?.id
      ? step?.focus || []
      : !actualFrame
        ? globalFocus(
            step?.focus || [],
            topFrame?.name === '<module>'
              ? []
              : Object.keys(topFrame?.locals || {}),
          )
        : [];
  const selectedFrameId =
    actualFrame?.name !== '<module>' &&
    actualFrame &&
    Object.hasOwn(actualFrame.locals, selected)
      ? actualFrame.id
      : undefined;
  const chartScale = extent(
    (result?.steps || []).map((s) =>
      selectedFrameId !== undefined
        ? s.stack.find((f) => f.id === selectedFrameId)?.locals[selected]
        : s.globals[selected],
    ),
  );
  const differences = Array.from(
    new Set([...Object.keys(oldVars), ...names]),
  ).filter((k) => changed(vars[k], oldVars[k]));
  const line = step?.event === 'error' ? step.error?.line : step?.line;
  const clearWorker = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const run = useCallback(
    (source: string, input: string) => {
      clearWorker();
      setPlaying(false);
      setResult(null);
      setCursor(0);
      setVariable('');
      setViewPreference({ variable: '', mode: 'auto' });
      setFrameChoice('current');
      setEditing(false);
      setMessage('');
      if (!source.trim()) {
        setStatus('error');
        setMessage('실행할 파이썬 코드를 입력해주세요.');
        setEditing(true);
        return;
      }
      if (source.length > 30000 || input.length > 50000) {
        setStatus('error');
        setMessage('코드는 30,000자, 표준 입력은 50,000자 이내로 줄여주세요.');
        setEditing(true);
        return;
      }
      setStatus('loading');
      try {
        const w = new Worker(
          new URL('./python-worker.mjs', window.location.href),
          { type: 'module' },
        );
        worker.current = w;
        const fail = (text: string) => {
          if (worker.current !== w) return;
          clearWorker();
          setStatus('error');
          setMessage(text);
        };
        timer.current = setTimeout(
          () =>
            fail(
              '실행 환경을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 실행해주세요.',
            ),
          90000,
        );
        w.onmessage = ({ data }) => {
          if (worker.current !== w) return;
          if (data.type === 'running') {
            setStatus('running');
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(
              () =>
                fail(
                  '실행 시간이 길어 중단했습니다. 반복 횟수나 입력 크기를 줄여주세요.',
                ),
              12000,
            );
          }
          if (data.type === 'error') fail('실행 환경 오류: ' + data.message);
          if (data.type === 'result') {
            clearWorker();
            const r = data.result as TraceResult;
            setResult(r);
            setStatus(r.error ? 'error' : 'ready');
            setCursor(
              r.error ? r.steps.length - 1 : Math.min(1, r.steps.length - 1),
            );
          }
        };
        w.onerror = () =>
          fail(
            '파이썬 실행 환경을 불러오지 못했습니다. 인터넷 연결 후 다시 실행해주세요.',
          );
        w.postMessage({ type: 'run', code: source, stdin: input });
      } catch (e) {
        clearWorker();
        setStatus('error');
        setMessage(
          '이 브라우저에서 실행 환경을 시작하지 못했습니다: ' + String(e),
        );
      }
    },
    [clearWorker],
  );
  useEffect(() => {
    const startup = setTimeout(
      () => run(examples[0].code, examples[0].stdin),
      0,
    );
    return () => {
      clearTimeout(startup);
      clearWorker();
    };
  }, [run, clearWorker]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(
      () =>
        setCursor((n) => {
          if (n >= steps.length - 1) {
            setPlaying(false);
            return n;
          }
          return n + 1;
        }),
      800 / Number(speed),
    );
    return () => clearInterval(id);
  }, [playing, speed, steps.length]);
  const move = useCallback(
    (delta: number) => {
      setPlaying(false);
      setCursor((n) => Math.max(0, Math.min(stepCount - 1, n + delta)));
    },
    [stepCount],
  );
  const togglePlay = useCallback(() => {
    if (stepCount < 2 || busy) return;
    if (cursor >= stepCount - 1) setCursor(0);
    setPlaying((x) => !x);
  }, [stepCount, busy, cursor]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(
          'textarea,input,button,[role="slider"],[role="combobox"],[role="listbox"],[role="tab"]',
        )
      )
        return;
      if (e.key === 'ArrowRight' && steps.length) {
        e.preventDefault();
        move(1);
      }
      if (e.key === 'ArrowLeft' && steps.length) {
        e.preventDefault();
        move(-1);
      }
      if (e.code === 'Space' && steps.length) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, togglePlay, steps.length]);
  useEffect(() => {
    const box = codeViewport.current,
      active = box?.querySelector<HTMLElement>('.active-line');
    if (box && active) {
      const y = active.offsetTop - box.offsetTop;
      if (y < box.scrollTop || y + 30 > box.scrollTop + box.clientHeight)
        box.scrollTop = Math.max(0, y - box.clientHeight / 2);
    }
  }, [line, editing]);
  useEffect(() => {
    if (insightViewport.current) insightViewport.current.scrollTop = 0;
  }, [cursor, result]);
  const invalidate = () => {
    setPlaying(false);
    setResult(null);
    setCursor(0);
    setStatus('idle');
    setMessage('');
    setEditing(true);
  };
  const stop = () => {
    setPlaying(false);
    if (busy) {
      clearWorker();
      setStatus('idle');
      setMessage('실행을 중단했습니다. 시각화 실행으로 다시 시작할 수 있어요.');
      setEditing(true);
    }
  };
  const loadExample = (id: string) => {
    const x = examples.find((v) => v.id === id);
    if (!x) return;
    setExample(id);
    setCode(x.code);
    setStdin(x.stdin);
    run(x.code, x.stdin);
  };
  const phase = busy
    ? status === 'loading'
      ? 'Python 준비 중'
      : '실행 기록 수집 중'
    : result?.error
      ? '오류 기록'
      : result
        ? '실행 기록 준비됨'
        : '실행 대기';
  const comment = step?.line
    ? result?.comments?.[String(step.line)]
    : undefined;
  const insightTitle =
    step?.event === 'done'
      ? '실행이 끝났습니다'
      : step?.event === 'error'
        ? (step.error?.line ? 'L' + step.error.line + ' · ' : '') +
          (step.error?.type || '실행 오류')
        : step?.event === 'return'
          ? (actualFrame?.name || '함수') +
            ' 함수가 ' +
            format(step.returnValue) +
            '을 반환합니다'
          : line
            ? '다음 실행 · ' + line + '번째 줄'
            : busy
              ? '파이썬 실행 환경을 준비하고 있어요'
              : '코드를 실행해 흐름을 살펴보세요';
  const insightBody =
    step?.event === 'error'
      ? step.error?.message
      : step?.event === 'done'
        ? '최종 상태입니다. 이전 단계로 돌아가 값이 만들어진 과정을 확인해보세요.'
        : step?.event === 'return'
          ? '이 함수에서 실행을 마치고 호출한 위치로 돌아갑니다.'
          : line
            ? result?.hints[String(line)]
            : '처음 실행할 때는 인터넷에서 파이썬 실행 환경을 내려받습니다.';
  const stateRef = useRef({ result, cursor });
  useEffect(() => {
    stateRef.current = { result, cursor };
  }, [result, cursor]);
  useEffect(() => {
    type Context = {
      registerTool: (
        tool: unknown,
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    const register = (tool: unknown) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: controller.signal }),
        ).catch(() => {});
      } catch {
        /* Optional browser API. */
      }
    };
    register({
      name: 'read_execution_step',
      description: 'Read the current Python trace step and total count.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({
        index: stateRef.current.cursor,
        total: stateRef.current.result?.steps.length || 0,
        step: stateRef.current.result?.steps[stateRef.current.cursor] || null,
      }),
    });
    register({
      name: 'navigate_execution_step',
      description:
        'Pause playback and move the visible trace to a zero-based recorded step.',
      inputSchema: {
        type: 'object',
        properties: { index: { type: 'integer', minimum: 0 } },
        required: ['index'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input: unknown) => {
        const index = (input as { index?: unknown })?.index,
          count = stateRef.current.result?.steps.length || 0;
        if (
          typeof index !== 'number' ||
          !Number.isInteger(index) ||
          index < 0 ||
          index >= count
        )
          throw new Error('index must reference an existing recorded step');
        setPlaying(false);
        setCursor(index);
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        return { index, total: count };
      },
    });
    return () => controller.abort();
  }, []);
  return (
    <main className="app-shell">
      <header className="topbar">
        {/* A full reload intentionally starts a fresh tracing session. */}
        {/* oxlint-disable-next-line next/no-html-link-for-pages */}
        <a className="brand" href="./">
          <span className="brand-icon">
            <Workflow size={21} />
          </span>
          step<span className="brand-accent">wise</span>
          <span className="beta">LAB</span>
        </a>
        <span className="header-note">코드의 흐름이 보이는 순간</span>
        <span className="local-badge">
          <i /> 브라우저에서 실행
        </span>
        <button
          className="help-button"
          onClick={() => setHelp(!help)}
          aria-expanded={help}
        >
          <CircleHelp size={16} /> 사용 가이드
        </button>
      </header>
      <section className="intro">
        <div>
          <div className="eyebrow">PYTHON ALGORITHM PLAYGROUND</div>
          <h1>
            한 단계씩, 이해가 될 때까지<span>.</span>
          </h1>
          <p>
            값이 바뀌는 순간을 놓치지 마세요. 실행하고, 멈추고, 되돌아보세요.
          </p>
        </div>
        <div className="intro-shortcut">
          <kbd>←</kbd>
          <kbd>→</kbd>
          <span>한 단계씩</span>
          <kbd>space</kbd>
          <span>재생 / 정지</span>
        </div>
      </section>
      {help && (
        <aside className="help-box">
          <strong>코드 → 입력 → 실행 → 한 단계씩 확인</strong>
          <p>
            강조된 줄은 <b>다음에 실행할 줄</b>이고, 변수는 그 줄 실행 전의
            상태입니다. ‘다음 줄’을 누르면 값의 변화를 볼 수 있어요. 함수가
            반환되는 순간도 별도 단계로 남깁니다. 기록을 먼저 수집한 뒤
            재생하며, 되돌리기는 저장된 상태를 보여줍니다.
          </p>
          <p>
            표준 입력은 줄바꿈까지 그대로 전달됩니다. input(),
            sys.stdin.readline(), sys.stdin.read()를 사용할 수 있어요. 입력
            부족은 EOFError로 표시합니다. 실행 중 새 값을 묻는 팝업은 뜨지
            않습니다.
          </p>
          <p>
            기본 파이썬과 표준 라이브러리 중심의 첫 버전입니다. 최대 1,200단계,
            긴 컨테이너는 80개 항목을 표시합니다. 클래스는 타입 요약으로
            표시하며, 임의 객체의 내부·동일 객체의 별칭·스레드/비동기 실행은
            완전하게 추적하지 않습니다. 직접 작성하거나 신뢰하는 코드를
            실행해주세요.
          </p>
        </aside>
      )}
      <div className="workspace-toolbar">
        <div className="workspace-title">
          <span className="status-dot" /> 나의 작업 공간{' '}
          <span className="slash">/</span>
          <Pick
            label="예제 선택"
            value={example}
            disabled={busy}
            onChange={loadExample}
            items={[
              ...examples.map((x) => ({
                value: x.id,
                label: x.category + ' · ' + x.label,
              })),
              ...(example === 'custom'
                ? [{ value: 'custom', label: '내 코드' }]
                : []),
            ]}
          />
        </div>
        <span className="small-muted">{phase}</span>
      </div>
      {result?.analysis && (
        <section className="analysis-panel" aria-label="코드 분석 결과">
          <div className="analysis-title">
            <strong>
              {result.analysis.candidates[0]?.label || '일반 파이썬 실행'}
            </strong>
            <span>실제 코드의 연산 패턴 분석</span>
            <span>{examples.length}개 예제</span>
          </div>
          <p>
            {result.analysis.candidates[0]?.evidence ||
              '특정 알고리즘 패턴을 확정하지 못했습니다. 실행 값의 형태에 맞춰 표시합니다.'}
          </p>
          <details>
            <summary>
              추정 근거와 함께 발견한 패턴 {result.analysis.candidates.length}개
            </summary>
            <p>{result.analysis.note}</p>
            <div className="coverage-list">
              {result.analysis.candidates.map((c) => (
                <div key={c.id}>
                  <strong>{c.label}</strong>
                  <span>{c.evidence}</span>
                  <span>
                    {c.lines.map((n) => (
                      <button
                        key={n}
                        onClick={() => {
                          const index = steps.findIndex(
                            (s) => s.event === 'line' && s.line === n,
                          );
                          if (index >= 0) {
                            setPlaying(false);
                            setCursor(index);
                          }
                        }}
                      >
                        L{n}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </details>
        </section>
      )}
      <section className="workspace" id="workspace">
        <article className="code-panel">
          <div className="panel-heading">
            <span>
              <Code2 size={17} /> 코드 에디터
            </span>
            <div className="heading-actions">
              <span className="file-tag">main.py</span>
              {!editing && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={invalidate}
                >
                  <Pencil size={13} /> 수정
                </button>
              )}
            </div>
          </div>
          {editing ? (
            <div className="code-editor">
              <div className="line-numbers">
                {code.split('\n').map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <textarea
                aria-label="파이썬 코드"
                spellCheck={false}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setExample('custom');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const el = e.currentTarget,
                      start = el.selectionStart,
                      end = el.selectionEnd;
                    setCode(code.slice(0, start) + '    ' + code.slice(end));
                    setExample('custom');
                    requestAnimationFrame(() => {
                      el.selectionStart = el.selectionEnd = start + 4;
                    });
                  }
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    run(code, stdin);
                  }
                }}
              />
            </div>
          ) : (
            <div
              className="code-read"
              ref={codeViewport}
              // Keyboard users need to focus and scroll the code viewport.
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
              tabIndex={0}
              aria-label="실행 코드와 다음 실행 위치"
            >
              {code.split('\n').map((text, i) => (
                <div
                  key={i}
                  className={
                    'code-line ' +
                    (line === i + 1 ? 'active-line ' : '') +
                    (step?.event === 'error' && line === i + 1
                      ? 'error-line'
                      : '')
                  }
                >
                  <span className="code-number">
                    {line === i + 1 ? <ArrowRight size={12} /> : i + 1}
                  </span>
                  <code>
                    <Highlight line={text || ' '} />
                  </code>
                </div>
              ))}
            </div>
          )}
          <div className="input-area">
            <label htmlFor="stdin">
              표준 입력 <span>input() · sys.stdin.readline()</span>
            </label>
            <textarea
              id="stdin"
              value={stdin}
              disabled={busy}
              onChange={(e) => {
                setStdin(e.target.value);
                invalidate();
              }}
              placeholder="필요한 입력을 줄마다 적어주세요"
              spellCheck={false}
            />
            <InputSamples
              key={code}
              code={code}
              disabled={busy}
              onApply={(text) => {
                setStdin(text);
                invalidate();
              }}
            />
          </div>
          <div className="editor-footer">
            <span>
              {busy ? '실행 준비와 기록 수집 중' : 'Ctrl + Enter로 실행'}
            </span>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => run(code, stdin)}
            >
              {busy ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Play size={15} />
              )}{' '}
              {busy ? '실행 준비 중' : '시각화 실행'}
            </button>
            {busy && (
              <button className="text-button" onClick={stop}>
                <Square size={14} /> 중단
              </button>
            )}
          </div>
        </article>
        <article className="visual-panel">
          <div className="panel-heading">
            <span>
              <Braces size={18} /> 자료구조 시각화
            </span>
            <span className="view-tag">
              {step?.event === 'done'
                ? '실행 완료'
                : line
                  ? 'NEXT · L' + line
                  : 'LIVE TRACE'}
            </span>
          </div>
          <div className="visual-content">
            <div className="visual-controls">
              <div className="visual-title">
                <div>
                  <span className="eyebrow">
                    {selected ? 'WATCHING VARIABLE' : 'EXECUTION CANVAS'}
                  </span>
                  <div className="variable-picker">
                    {selected ? (
                      <Pick
                        value={selected}
                        label="시각화할 변수"
                        onChange={setVariable}
                        items={names.map((n) => ({ value: n, label: n }))}
                      />
                    ) : (
                      <h2>변수의 흐름</h2>
                    )}
                    <span className="type-tag">
                      {selected
                        ? container(vars[selected])
                          ? vars[selected].type +
                            (vars[selected].length !== undefined
                              ? ' · ' + vars[selected].length + '개'
                              : '')
                          : typeof vars[selected]
                        : '실행하면 나타납니다'}
                    </span>
                  </div>
                </div>
                <span className="legend">
                  <i /> 변경된 값
                </span>
              </div>
              {selected && (
                <div className="view-settings">
                  <div>
                    <Pick
                      label="표시 방식"
                      value={viewMode}
                      onChange={(v) =>
                        setViewPreference({
                          variable: selected,
                          mode: v as ViewKind,
                        })
                      }
                      items={Object.entries(VIEW_LABELS)
                        .filter(
                          ([v]) =>
                            v === viewMode ||
                            compatibleView(
                              vars[selected],
                              v as ViewKind,
                              selectedRole,
                            ),
                        )
                        .map(([value, label]) => ({ value, label }))}
                    />
                    <button
                      className="text-button"
                      onClick={() => {
                        setVariable('');
                        setViewPreference({ variable: '', mode: 'auto' });
                      }}
                    >
                      자동 추적으로
                    </button>
                  </div>
                  <p>
                    {recommendation &&
                      VIEW_LABELS[recommendation.view] +
                        ' · ' +
                        recommendation.reason}
                    {!!selectedRole?.aliases?.length &&
                      ' · 같은 자료구조: ' + selectedRole.aliases.join(', ')}
                  </p>
                </div>
              )}
            </div>
            <div className="visual-stage">
              {selected ? (
                <Tabs defaultValue="visual" className="data-tabs">
                  <TabsList variant="line">
                    <TabsTrigger value="visual">시각화</TabsTrigger>
                    <TabsTrigger value="raw">원본 값</TabsTrigger>
                  </TabsList>
                  <TabsContent value="visual">
                    <DataView
                      value={vars[selected]}
                      previous={oldVars[selected]}
                      variables={vars}
                      name={selected}
                      role={selectedRole}
                      mode={viewMode}
                      focus={visibleFocus}
                      scale={chartScale}
                      bounds={selectedBounds}
                    />
                  </TabsContent>
                  <TabsContent value="raw">
                    <pre className="raw-value">{format(vars[selected])}</pre>
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="canvas-empty">
                  {busy ? (
                    <LoaderCircle className="spin" size={25} />
                  ) : (
                    <Workflow size={29} />
                  )}
                  <strong>
                    {busy
                      ? '코드의 흐름을 기록하고 있어요'
                      : '아직 만들어진 변수가 없습니다'}
                  </strong>
                  <p>
                    {busy
                      ? '첫 준비에는 잠시 시간이 걸릴 수 있어요.'
                      : '다음 줄로 이동하거나 코드를 실행해주세요.'}
                  </p>
                </div>
              )}
            </div>
            <div className="related-slot">
              {selected &&
                structures.filter((n) => n !== selected).length > 0 && (
                  <div className="related-values" aria-label="함께 볼 자료구조">
                    {structures
                      .filter((n) => n !== selected)
                      .sort(
                        (a, b) =>
                          (roleFor(b)?.priority || 0) -
                          (roleFor(a)?.priority || 0),
                      )
                      .slice(0, 3)
                      .map((n) => (
                        <button key={n} onClick={() => setVariable(n)}>
                          <code>{n}</code>
                          <span>{format(vars[n])}</span>
                        </button>
                      ))}
                  </div>
                )}
            </div>
          </div>
          <section
            className="execution-explanation"
            aria-label="다음 실행과 원본 주석"
          >
            <div
              ref={insightViewport}
              // Let keyboard users scroll long explanations without moving the canvas.
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
              tabIndex={0}
              aria-label="현재 단계 설명과 주석"
              className={
                'step-insight ' +
                (step?.event === 'error' ? 'insight-error' : '')
              }
            >
              <span className="insight-icon">
                {step?.event === 'done' ? (
                  <Check size={19} />
                ) : step?.event === 'error' ? (
                  <AlertCircle size={19} />
                ) : (
                  <Workflow size={19} />
                )}
              </span>
              <div>
                <strong>{insightTitle}</strong>
                <p>{insightBody}</p>
                {comment && <p className="source-comment"># {comment}</p>}
                {step?.condition && (
                  <p className="condition-result">
                    현재 값으로 조건 검사 →{' '}
                    <strong>
                      {step.condition.value ? 'True · 참' : 'False · 거짓'}
                    </strong>
                  </p>
                )}
                {(step?.focus?.length || 0) > 0 && (
                  <div className="access-tags">
                    {step?.focus?.map((f, i) => (
                      <span className={'access-' + f.kind} key={i}>
                        {f.kind === 'write' ? '다음 쓰기' : '다음 읽기'} ·{' '}
                        {f.expression} → {f.variable}
                        {f.indices.map((n) => '[' + n + ']').join('')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
          <div className="details-grid">
            <div>
              <div className="detail-heading">
                <h3>
                  <Layers3 size={16} /> 변수 · 호출 스택
                </h3>
                {step && (
                  <Pick
                    label="변수 범위"
                    value={frameChoice}
                    onChange={setFrameChoice}
                    items={[
                      { value: 'current', label: '현재 함수 + 전역' },
                      { value: 'global', label: '전역' },
                      ...step.stack
                        .filter((f) => f.name !== '<module>')
                        .map((f) => ({
                          value: String(f.id),
                          label: f.name + ' #' + f.id,
                        })),
                    ]}
                  />
                )}
              </div>
              {step?.stack.length !== undefined && step.stack.length > 1 && (
                <div className="stack-trail">
                  {step.stack.map((f) => (
                    <span key={f.id}>
                      {f.name === '<module>' ? 'main' : f.name}
                    </span>
                  ))}
                </div>
              )}
              {differences.length > 0 && (
                <div className="change-summary">
                  <span>직전 단계와 비교</span>
                  {differences.slice(0, 4).map((k) => (
                    <div key={k}>
                      <code>{k}</code>
                      <span>{format(oldVars[k]).slice(0, 65)}</span>
                      <ArrowRight size={12} />
                      <strong>{format(vars[k]).slice(0, 65)}</strong>
                    </div>
                  ))}
                  {differences.length > 4 && (
                    <small>외 {differences.length - 4}개 변수 변경</small>
                  )}
                </div>
              )}
              <div className="variable-list">
                {names.length ? (
                  names.map((n) => (
                    <button
                      onClick={() => setVariable(n)}
                      className={
                        changed(vars[n], oldVars[n]) ? 'var-changed' : ''
                      }
                      key={n}
                    >
                      <code>{n}</code>
                      <span title={format(vars[n])}>{format(vars[n])}</span>
                    </button>
                  ))
                ) : (
                  <p className="empty-copy">
                    이 범위에 표시할 변수가 없습니다.
                  </p>
                )}
              </div>
            </div>
            <div>
              <h3>
                <Terminal size={16} /> 출력{' '}
                <span className="output-tag">stdout</span>
              </h3>
              <pre
                className={
                  'console-output ' + (step?.output ? 'has-output' : '')
                }
              >
                {step?.output || '아직 출력이 없습니다.'}
              </pre>
            </div>
          </div>
        </article>
      </section>
      {(message || result?.warnings.length || result?.error) && (
        <div
          className={
            'notice ' +
            (result?.error || status === 'error' ? 'notice-error' : '')
          }
          role={result?.error || status === 'error' ? 'alert' : 'status'}
        >
          {message && <p>{message}</p>}
          {result?.error && (
            <p>
              {result.error.type}: {result.error.message}
            </p>
          )}
          {result?.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
      <section className="playback" aria-label="실행 재생 컨트롤">
        <div className="transport">
          <button
            title="처음으로"
            aria-label="처음으로"
            disabled={!steps.length}
            onClick={() => {
              setPlaying(false);
              setCursor(0);
            }}
          >
            <RotateCcw size={17} />
          </button>
          <button
            title="이전 단계 (←)"
            aria-label="이전 단계"
            disabled={!steps.length || cursor === 0}
            onClick={() => move(-1)}
          >
            <SkipBack size={17} />
          </button>
          <button
            className="play-button"
            title={playing ? '일시정지 (Space)' : '자동 재생 (Space)'}
            aria-label={playing ? '일시정지' : '자동 재생'}
            disabled={steps.length < 2 || busy}
            onClick={togglePlay}
          >
            {playing ? <Pause size={19} /> : <Play size={19} />}
          </button>
          <button
            title="정지 — 현재 단계 유지"
            aria-label="정지"
            disabled={!playing && !busy}
            onClick={stop}
          >
            <Square size={15} />
          </button>
          <button
            className="next-step"
            title="다음 줄 / 반환 단계 (→)"
            aria-label="다음 줄"
            disabled={!steps.length || cursor === steps.length - 1}
            onClick={() => move(1)}
          >
            <SkipForward size={17} />
            <span>다음 줄</span>
          </button>
        </div>
        <div className="timeline">
          <div>
            <strong>{playing ? '재생 중' : '실행 타임라인'}</strong>
            <span>
              {steps.length
                ? String(cursor + 1).padStart(2, '0') + ' / ' + steps.length
                : '실행 대기'}
            </span>
          </div>
          <Slider
            value={[cursor]}
            min={0}
            max={Math.max(steps.length - 1, 1)}
            disabled={steps.length < 2}
            onValueChange={(v) => {
              setPlaying(false);
              setCursor(Array.isArray(v) ? v[0] : v);
            }}
            aria-label="실행 단계"
          />
        </div>
        <div className="speed">
          <Pick
            value={speed}
            label="재생 속도"
            onChange={setSpeed}
            items={['0.25', '0.5', '1', '2', '4'].map((v) => ({
              value: v,
              label: v + '×',
            }))}
          />
        </div>
      </section>
      <footer className="site-footer">
        <span>↳ 결과보다 과정을 이해하는 연습.</span>
        <span>
          {result
            ? 'Python ' + result.pythonVersion + ' · ' + steps.length + ' steps'
            : 'Stepwise · Python visualizer'}
        </span>
      </footer>
    </main>
  );
}
