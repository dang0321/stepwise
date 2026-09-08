import assert from 'node:assert/strict';
import {
  chooseView,
  extent,
  focusKind,
  graphModel,
} from '../lib/visual-model.ts';
const list = (items) => ({ type: 'list', items, length: items.length });
assert.deepEqual(extent([list([-5, 2]), list([9, -2])]), { min: -5, max: 9 });
assert.deepEqual(extent([list([0, 0]), undefined]), { min: 0, max: 1 });
assert.equal(chooseView(list([2, 1])), 'array');
assert.equal(chooseView(list([list([1]), list([2])])), 'grid');
assert.equal(chooseView({ type: 'deque', items: [1], length: 1 }), 'queue');
assert.equal(chooseView(list([1]), { view: 'heap' }), 'heap');
assert.equal(chooseView(list([1]), { view: 'heap' }, 'cards'), 'cards');
assert.equal(chooseView('가나다'), 'string');
const focus = [
  {
    variable: 'grid',
    indices: [-1, -1],
    kind: 'write',
    expression: 'grid[-1][-1]',
  },
];
assert.equal(focusKind(focus, 'grid', [1, 2], [2, 3]), 'write');
assert.equal(focusKind(focus, 'other', [1, 2], [2, 3]), '');
assert.equal(
  focusKind([{ variable: 'a', indices: [-1], kind: 'read' }], 'a', [2], 3),
  'read',
);
assert.equal(
  focusKind(
    [{ variable: 'counts', indices: [-1], kind: 'read' }],
    'counts',
    [-1],
  ),
  'read',
);
assert.equal(
  focusKind(
    [
      { variable: 'a', indices: [0], kind: 'read' },
      { variable: 'a', indices: [0], kind: 'write' },
    ],
    'a',
    [0],
    1,
  ),
  'write',
);
assert.deepEqual(graphModel(list([list([1]), list([])])), {
  keys: [0, 1],
  edges: [{ from: 0, to: 1 }],
});
assert.deepEqual(graphModel(list([list([list([1, 7])]), list([])])).edges, [
  { from: 0, to: 1, weight: 7 },
]);
assert.equal(graphModel(list([list([7]), list([])])), null);
assert.equal(
  graphModel(list(Array.from({ length: 25 }, () => list([])))),
  null,
);
assert.equal(
  graphModel(list([list([list([1, 'not a weight'])]), list([])])),
  null,
);
assert.deepEqual(
  graphModel({
    type: 'dict',
    items: [
      ['A', list(['B'])],
      ['B', list([])],
    ],
    length: 2,
  }).edges,
  [{ from: 0, to: 1 }],
);
console.log('PASS 19 visualization model assertions');
