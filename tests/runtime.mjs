import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadPyodide } from 'pyodide';
import { examples } from '../lib/examples.ts';
import { chooseView } from '../lib/visual-model.ts';

process.on('uncaughtException', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

const py = await loadPyodide();
for (const name of ['code_analysis.py', 'input_samples.py'])
  py.FS.writeFile(
    '/' + name,
    await readFile(new URL('../public/' + name, import.meta.url), 'utf8'),
  );
py.FS.writeFile(
  '/tracer.py',
  await readFile(new URL('../public/tracer.py', import.meta.url), 'utf8'),
);
for (const name of [
  'test_tracer.py',
  'test_input_samples.py',
  'test_code_analysis.py',
]) {
  py.FS.writeFile(
    '/' + name,
    await readFile(new URL('./' + name, import.meta.url), 'utf8'),
  );
}
py.runPython("import sys; sys.path.insert(0, '/')");
py.runPython(
  'import unittest; suite=unittest.defaultTestLoader.discover("/",pattern="test_*.py"); _test_result=unittest.TextTestRunner(verbosity=1).run(suite); assert _test_result.wasSuccessful()',
);
const contractCount = py.runPython('_test_result.testsRun');
let scenarioCount = 0;
const patterns = new Set();
function viewProfile(trace) {
  const views = new Set();
  for (const step of trace.steps) {
    const scopes = [
      [step.globals, step.roles],
      ...step.stack.map((frame) => [frame.locals, frame.roles]),
    ];
    for (const [values, roles] of scopes)
      for (const [name, role] of Object.entries(roles || {}))
        if (Object.hasOwn(values, name))
          views.add(chooseView(values[name], role));
  }
  return [...views].sort((a, b) => a.localeCompare(b));
}
const expected = {
  bubble: '[1, 2, 3, 4, 5, 7, 8, 9]\n',
  binary: '3\n',
  bfs: '[0, 1, 2, 3, 4]\n',
  recursion: '120\n',
  grid: '1 2 3 4\n5 6 7 8\n9 10 11 12\n',
  input: '0 3 4 8 9 14\n',
};
py.runPython('from tracer import run_trace; import json');
py.runPython(
  "\nimport ast\ndef rename_user_symbols(source):\n    tree=ast.parse(source)\n    imported={a.asname or a.name.split('.')[0] for node in ast.walk(tree) if isinstance(node,(ast.Import,ast.ImportFrom)) for a in node.names}\n    names={n.id for n in ast.walk(tree) if isinstance(n,ast.Name) and isinstance(n.ctx,ast.Store)}\n    names|={n.arg for n in ast.walk(tree) if isinstance(n,ast.arg)}\n    names|={n.name for n in ast.walk(tree) if isinstance(n,ast.FunctionDef)}\n    names={n for n in names if n not in imported and not n.startswith('__')}\n    mapping={name:'renamed_'+str(i) for i,name in enumerate(sorted(names))}\n    class Rename(ast.NodeTransformer):\n        def visit_Name(self,node):\n            node.id=mapping.get(node.id,node.id)\n            return node\n        def visit_arg(self,node):\n            node.arg=mapping.get(node.arg,node.arg)\n            return node\n        def visit_FunctionDef(self,node):\n            node.name=mapping.get(node.name,node.name)\n            return self.generic_visit(node)\n        def visit_keyword(self,node):\n            node.arg=mapping.get(node.arg,node.arg)\n            return self.generic_visit(node)\n    return ast.unparse(ast.fix_missing_locations(Rename().visit(tree)))\n",
);
for (const x of examples) {
  scenarioCount++;
  py.globals.set('_source', x.code);
  py.globals.set('_stdin', x.stdin);
  const result = JSON.parse(
    py.runPython('json.dumps(run_trace(_source,_stdin),ensure_ascii=False)'),
  );
  assert.equal(result.error, null, JSON.stringify(result.error));
  for (const c of result.analysis.candidates) patterns.add(c.id);
  assert.equal(result.steps.at(-1).output, x.expected || expected[x.id], x.id);
  for (const pattern of x.patterns || [])
    assert.ok(
      result.analysis.candidates.some((c) => c.id === pattern),
      x.id + ' expected pattern ' + pattern,
    );
  for (const sample of x.samples || []) {
    scenarioCount++;
    py.globals.set('_stdin', sample.stdin);
    const r = JSON.parse(
      py.runPython('json.dumps(run_trace(_source,_stdin),ensure_ascii=False)'),
    );
    assert.equal(
      r.error,
      null,
      x.id + ' ' + sample.label + ' ' + JSON.stringify(r.error),
    );
    assert.equal(
      r.steps.at(-1).output,
      sample.expected,
      x.id + ' ' + sample.label,
    );
  }
  assert.ok(result.steps.length > 1);
  py.globals.set('_stdin', x.stdin);
  const renamed = JSON.parse(
    py.runPython(
      'json.dumps(run_trace(rename_user_symbols(_source),_stdin),ensure_ascii=False)',
    ),
  );
  assert.equal(
    renamed.error,
    null,
    'renamed ' + x.id + ' ' + JSON.stringify(renamed.error),
  );
  assert.equal(
    renamed.steps.at(-1).output,
    x.expected || expected[x.id],
    'renamed ' + x.id,
  );
  for (const pattern of x.patterns || [])
    assert.ok(
      renamed.analysis.candidates.some((c) => c.id === pattern),
      'renamed ' + x.id + ' pattern ' + pattern,
    );
  assert.deepEqual(
    viewProfile(renamed),
    viewProfile(result),
    'renamed ' + x.id + ' visualization types',
  );
  scenarioCount++;
  console.log('PASS example ' + x.id + ': ' + result.steps.length + ' steps');
}
console.log(
  'PASS Pyodide ' +
    py.version +
    ': ' +
    contractCount +
    ' Python tests, ' +
    examples.length +
    ' examples / ' +
    scenarioCount +
    ' scenarios, ' +
    patterns.size +
    ' observed patterns',
);
console.log(
  'Patterns: ' + [...patterns].sort((a, b) => a.localeCompare(b)).join(', '),
);
