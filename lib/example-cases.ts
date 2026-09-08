import type { Example } from './examples.ts';
export const baseCases: Record<string, Partial<Example>> = {
  bubble: {
    expected: '[1, 2, 3, 4, 5, 7, 8, 9]\n',
    patterns: ['sorting'],
  },
  bfs: {
    expected: '[0, 1, 2, 3, 4]\n',
    patterns: ['bfs'],
  },
  binary: {
    expected: '3\n',
    patterns: ['binary_search'],
    samples: [
      {
        label: '탐색 실패',
        stdin: '6',
        expected: '-1\n',
      },
      {
        label: '첫 원소',
        stdin: '1',
        expected: '0\n',
      },
    ],
  },
  recursion: {
    expected: '120\n',
    patterns: ['recursion'],
    samples: [
      {
        label: '종료 조건',
        stdin: '1',
        expected: '1\n',
      },
      {
        label: '0의 팩토리얼',
        stdin: '0',
        expected: '1\n',
      },
    ],
  },
  grid: {
    expected: '1 2 3 4\n5 6 7 8\n9 10 11 12\n',
    patterns: ['grid'],
    samples: [
      {
        label: '한 칸',
        stdin: '1 1',
        expected: '1\n',
      },
      {
        label: '직사각형',
        stdin: '2 3',
        expected: '1 2 3\n4 5 6\n',
      },
    ],
  },
  input: {
    expected: '0 3 4 8 9 14\n',
    patterns: ['prefix_sum'],
    samples: [
      {
        label: '원소 한 개',
        stdin: '1\n0',
        expected: '0 0\n',
      },
      {
        label: '음수·0 포함',
        stdin: '5\n-2 0 3 -1 2',
        expected: '0 -2 -2 1 0 2\n',
      },
    ],
  },
};
