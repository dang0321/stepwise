import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadPyodide } from 'pyodide';
import { examples } from '../lib/examples.ts';

process.on('uncaughtException', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

const py = await loadPyodide();
py.FS.writeFile(
  '/tracer.py',
  await readFile(new URL('../public/tracer.py', import.meta.url), 'utf8'),
);
py.FS.writeFile(
  '/test_tracer.py',
  await readFile(new URL('./test_tracer.py', import.meta.url), 'utf8'),
);
py.runPython("import sys; sys.path.insert(0, '/')");
py.runPython(
  'import unittest, test_tracer; suite=unittest.defaultTestLoader.loadTestsFromModule(test_tracer); _test_result=unittest.TextTestRunner(verbosity=1).run(suite); assert _test_result.wasSuccessful()',
);
const expected = {
  bubble: '[1, 2, 3, 4, 5, 7, 8, 9]\n',
  binary: '3\n',
  bfs: '[0, 1, 2, 3, 4]\n',
  recursion: '120\n',
  grid: '1 2 3 4\n5 6 7 8\n9 10 11 12\n',
  input: '0 3 4 8 9 14\n',
};
py.runPython('from tracer import run_trace; import json');
for (const x of examples) {
  py.globals.set('_source', x.code);
  py.globals.set('_stdin', x.stdin);
  const result = JSON.parse(
    py.runPython('json.dumps(run_trace(_source,_stdin),ensure_ascii=False)'),
  );
  assert.equal(result.error, null, JSON.stringify(result.error));
  assert.equal(result.steps.at(-1).output, expected[x.id], x.id);
  assert.ok(result.steps.length > 1);
  console.log('PASS example ' + x.id + ': ' + result.steps.length + ' steps');
}
console.log(
  'PASS Pyodide ' + py.version + ' runtime: 21 contract tests + 6 examples',
);
