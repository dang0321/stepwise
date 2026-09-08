'use client';
import { useEffect, useRef, useState } from 'react';
import { FlaskConical, LoaderCircle, ArrowDownToLine } from 'lucide-react';
import { examples } from '@/lib/examples';
export type InputSample = {
  label: string;
  stdin: string;
  reason: string;
  verified: boolean;
  expected?: string;
};
type Proposal = {
  status: string;
  samples: InputSample[];
  reason: string;
  schema: { line: number; targets: string[]; kind: string }[];
};
export function InputSamples({
  code,
  disabled,
  onApply,
}: {
  code: string;
  disabled: boolean;
  onApply: (text: string) => void;
}) {
  const [proposal, setProposal] = useState<Proposal | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const [selected, setSelected] = useState(0),
    [source, setSource] = useState('');
  const job = useRef<Worker | null>(null),
    timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exact = examples.find((x) => x.code.trim() === code.trim());
  const curated: InputSample[] = exact?.stdin
    ? [
        {
          label: '기본 예제',
          stdin: exact.stdin,
          reason: '이 코드에서 정상 실행을 확인한 예제 입력입니다.',
          verified: true,
          expected: exact.expected,
        },
        ...(exact.samples || []).map((s) => ({
          ...s,
          reason: '이 코드의 경계·분기 동작을 확인하는 실행 검증 사례입니다.',
          verified: true,
        })),
      ]
    : [];
  const fresh = source === code ? proposal : null;
  const samples = curated.length ? curated : fresh?.samples || [];
  const sample = samples[Math.min(selected, Math.max(0, samples.length - 1))];
  function stop() {
    job.current?.terminate();
    job.current = null;
    if (timeout.current) clearTimeout(timeout.current);
  }
  useEffect(() => {
    return stop;
  }, []);
  function analyze() {
    stop();
    setLoading(true);
    setError('');
    setSource(code);
    setProposal(null);
    setSelected(0);
    let w: Worker;
    try {
      w = new Worker(new URL('./analysis-worker.mjs', window.location.href), {
        type: 'module',
      });
    } catch {
      setLoading(false);
      setError('이 브라우저에서 입력 분석기를 시작하지 못했습니다.');
      return;
    }
    job.current = w;
    const fail = (message: string) => {
      if (job.current !== w) return;
      stop();
      setLoading(false);
      setError(message);
    };
    timeout.current = setTimeout(
      () =>
        fail(
          '분석 준비가 지연되고 있습니다. 인터넷 연결 후 다시 시도해주세요.',
        ),
      90000,
    );
    w.onerror = () => fail('분석기를 불러오지 못했습니다. 다시 시도해주세요.');
    w.onmessage = ({ data }) => {
      if (job.current !== w) return;
      if (data.error) {
        fail(data.error);
        return;
      }
      stop();
      setLoading(false);
      setProposal(data.result);
    };
    w.postMessage({ id: 1, code });
  }
  return (
    <section className="sample-panel" aria-label="샘플 입력">
      <div className="sample-heading">
        <strong>
          <FlaskConical size={14} /> 샘플 입력
        </strong>
        {!exact && (
          <button
            type="button"
            disabled={disabled || loading || !code.trim()}
            onClick={analyze}
            className="text-button"
          >
            {loading ? <LoaderCircle className="spin" size={13} /> : null}
            {loading ? '입력 분석 중' : '내 코드에서 제안 받기'}
          </button>
        )}
      </div>
      {samples.length > 0 ? (
        <>
          <div className="sample-choices">
            {samples.map((s, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={selected === i}
                onClick={() => setSelected(i)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <pre className="sample-preview">{sample.stdin}</pre>
          <p>
            {sample.verified ? '✓ 실행 검증한 예제' : '입력 형식 추정'} ·{' '}
            {sample.reason}
          </p>
          {sample.expected !== undefined && (
            <details>
              <summary>예상 출력 보기</summary>
              <pre>{sample.expected}</pre>
            </details>
          )}
          <button
            type="button"
            className="sample-apply"
            disabled={disabled}
            onClick={() => onApply(sample.stdin)}
          >
            <ArrowDownToLine size={13} /> 이 샘플을 입력창에 적용
          </button>
        </>
      ) : (
        <p>
          {fresh?.reason ||
            (exact
              ? '이 예제는 표준 입력 없이 실행됩니다.'
              : '코드의 읽기 순서를 분석해 입력 후보를 제안합니다.')}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
