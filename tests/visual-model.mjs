import assert from 'node:assert/strict';
import {
  chooseView,
  recommendView,
  compatibleView,
  globalFocus,
  graphState,
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

const customCases = [
  [
    'reversed weighted adjacency',
    () =>
      assert.deepEqual(
        graphModel(list([list([list([7, 1])]), list([])]), 1).edges,
        [{ from: 0, to: 1, weight: 7 }],
      ),
  ],
  [
    'weighted mapping and leaf',
    () =>
      assert.deepEqual(
        graphModel({
          type: 'dict',
          items: [['A', { type: 'dict', items: [['B', 5]], length: 1 }]],
          length: 1,
        }),
        { keys: ['A', 'B'], edges: [{ from: 0, to: 1, weight: 5 }] },
      ),
  ],
  [
    'incomplete graph stays generic',
    () =>
      assert.equal(
        graphModel({ type: 'list', items: [list([])], length: 8 }),
        null,
      ),
  ],
  [
    'unknown nested arrays stay grids',
    () => assert.equal(chooseView(list([list([1]), list([0])])), 'grid'),
  ],
  [
    'incompatible graph role falls back',
    () => {
      const r = recommendView(list([3, 2]), { view: 'graph' });
      assert.equal(r.view, 'array');
      assert.equal(r.fallback, true);
    },
  ],
  [
    'negative bit value is not a mask',
    () => assert.equal(chooseView(-1, { view: 'bits' }), 'cards'),
  ],
  [
    'invalid parent index stays an array',
    () => assert.equal(chooseView(list([0, 8]), { view: 'forest' }), 'array'),
  ],
  [
    'large heap uses array fallback',
    () =>
      assert.equal(
        chooseView(list(Array.from({ length: 32 }, (_, i) => i)), {
          view: 'heap',
        }),
        'array',
      ),
  ],
  [
    'list queue can be selected',
    () => assert.equal(compatibleView(list([1, 2]), 'queue'), true),
  ],
  [
    'alias access uses same slot',
    () =>
      assert.equal(
        focusKind(
          [
            {
              variable: 'local',
              aliases: ['global'],
              indices: [1],
              kind: 'read',
            },
          ],
          'global',
          [1],
          2,
        ),
        'read',
      ),
  ],
  [
    'local shadow cannot highlight global name',
    () =>
      assert.deepEqual(
        globalFocus(
          [
            {
              variable: 'local',
              aliases: ['original', 'copy'],
              indices: [1],
              kind: 'read',
            },
          ],
          ['local', 'copy'],
        ),
        [{ variable: 'original', aliases: [], indices: [1], kind: 'read' }],
      ),
  ],
  [
    'fully shadowed access is hidden',
    () =>
      assert.deepEqual(
        globalFocus([{ variable: 'x', indices: [0], kind: 'write' }], ['x']),
        [],
      ),
  ],
  [
    'graph state from dictionary key',
    () =>
      assert.equal(
        graphState({ type: 'dict', items: [['B', false]], length: 1 }, 'B'),
        false,
      ),
  ],
  [
    'graph state missing index',
    () => assert.equal(graphState(list([1]), 8), undefined),
  ],
  [
    'role cannot turn a scalar into a heap',
    () => assert.equal(chooseView(3, { view: 'heap' }), 'cards'),
  ],
  [
    'mixed nesting stays cards',
    () => assert.equal(chooseView(list([list([1]), 'text'])), 'cards'),
  ],
  [
    'large integer summary is not a bit mask',
    () =>
      assert.equal(
        compatibleView({ type: 'int', value: '99999999999999999999' }, 'bits'),
        false,
      ),
  ],
  [
    'rejected manual view explains fallback',
    () => assert.equal(recommendView('abc', undefined, 'graph').fallback, true),
  ],
];
for (const [name, test] of customCases) {
  try {
    test();
  } catch (error) {
    throw new Error(name, { cause: error });
  }
}
console.log('PASS ' + customCases.length + ' custom-code visualization cases');
