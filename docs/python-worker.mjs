// Fresh worker for each run keeps Python state isolated between runs.
const CDN = 'https://cdn.jsdelivr.net/pyodide/v314.0.6/full/';
self.onmessage = async ({ data }) => {
  if (data.type !== 'run') return;
  try {
    self.postMessage({ type: 'loading' });
    const [{ loadPyodide }, tracerResponse, analysisResponse] =
      await Promise.all([
        import(CDN + 'pyodide.mjs'),
        fetch(new URL('./tracer.py', import.meta.url)),
        fetch(new URL('./code_analysis.py', import.meta.url)),
      ]);
    if (!tracerResponse.ok)
      throw new Error('실행 엔진 파일을 불러오지 못했습니다.');
    const pyodide = await loadPyodide({ indexURL: CDN });
    if (!analysisResponse.ok)
      throw new Error('코드 분석기를 불러오지 못했습니다.');
    pyodide.FS.writeFile(
      '/home/pyodide/code_analysis.py',
      await analysisResponse.text(),
    );
    pyodide.runPython(await tracerResponse.text());
    self.postMessage({ type: 'running' });
    pyodide.globals.set('_source', data.code);
    pyodide.globals.set('_stdin', data.stdin);
    const serialized = pyodide.runPython(
      'json.dumps(run_trace(_source, _stdin), ensure_ascii=False)',
    );
    self.postMessage({ type: 'result', result: JSON.parse(serialized) });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: String(error?.message || error),
    });
  }
};
