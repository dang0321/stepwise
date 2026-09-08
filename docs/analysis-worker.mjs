const CDN = 'https://cdn.jsdelivr.net/pyodide/v314.0.6/full/';
let ready;
async function runtime() {
  if (!ready)
    ready = (async () => {
      const [{ loadPyodide }, response] = await Promise.all([
        import(CDN + 'pyodide.mjs'),
        fetch(new URL('./input_samples.py', import.meta.url)),
      ]);
      if (!response.ok) throw new Error('입력 분석기를 불러오지 못했습니다.');
      const py = await loadPyodide({ indexURL: CDN });
      py.runPython(await response.text());
      return py;
    })();
  return ready;
}
self.onmessage = async ({ data }) => {
  try {
    const py = await runtime();
    py.globals.set('_source', data.code);
    const result = JSON.parse(
      py.runPython(
        "__import__('json').dumps(suggest_inputs(_source),ensure_ascii=False)",
      ),
    );
    self.postMessage({ id: data.id, result });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error?.message || error) });
  }
};
