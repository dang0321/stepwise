import assert from 'node:assert/strict';
import { format, changed } from '../lib/trace.ts';
assert.equal(format(null), 'None');
assert.equal(format(false), 'False');
assert.equal(
  format({ type: 'dict', items: [['x', 3]], length: 1 }),
  '{"x": 3}',
);
assert.equal(format({ type: 'list', items: [1, 2], length: 5 }), '[1, 2, …]');
assert.equal(
  changed({ type: 'list', items: [1] }, { type: 'list', items: [2] }),
  true,
);
console.log('PASS serialized value formatting and changes');
