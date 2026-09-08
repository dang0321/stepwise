import { extraExamples } from './extra-examples.ts';
import { baseCases } from './example-cases.ts';
export type SampleCase = { label: string; stdin: string; expected: string };
export type Example = {
  id: string;
  label: string;
  category: string;
  stdin: string;
  code: string;
  expected?: string;
  patterns?: string[];
  samples?: SampleCase[];
};
export const examples: Example[] = [
  {
    id: 'bubble',
    label: '버블 정렬',
    category: '정렬',
    stdin: '',
    code: `numbers = [7, 3, 9, 2, 5, 1, 8, 4]

# 이웃한 두 값을 비교해 큰 값을 오른쪽으로 보냅니다
for i in range(len(numbers) - 1):
    for j in range(len(numbers) - 1 - i):
        if numbers[j] > numbers[j + 1]:
            numbers[j], numbers[j + 1] = numbers[j + 1], numbers[j]

print(numbers)`,
  },
  {
    id: 'binary',
    label: '이진 탐색',
    category: '탐색',
    stdin: '7',
    code: `numbers = [1, 3, 5, 7, 9, 11, 13, 15]
target = int(input())
left, right = 0, len(numbers) - 1
answer = -1

# 탐색 범위를 절반씩 줄입니다
while left <= right:
    mid = (left + right) // 2
    if numbers[mid] == target:
        answer = mid
        break
    elif numbers[mid] < target:
        left = mid + 1
    else:
        right = mid - 1

print(answer)`,
  },
  {
    id: 'bfs',
    label: 'BFS · 큐',
    category: '그래프',
    stdin: '',
    code: `from collections import deque

graph = {0: [1, 2], 1: [3], 2: [3, 4], 3: [], 4: []}
queue = deque([0])
visited = {0}
order = []

# 큐의 앞에서 꺼내고, 아직 방문하지 않은 이웃을 뒤에 넣습니다
while queue:
    node = queue.popleft()
    order.append(node)
    for neighbor in graph[node]:
        if neighbor not in visited:
            visited.add(neighbor)
            queue.append(neighbor)

print(order)`,
  },
  {
    id: 'recursion',
    label: '재귀 · 팩토리얼',
    category: '재귀',
    stdin: '5',
    code: `def factorial(n):
    # 1에 도달하면 재귀 호출을 멈춥니다
    if n <= 1:
        return 1
    result = n * factorial(n - 1)
    return result

n = int(input())
answer = factorial(n)
print(answer)`,
  },
  {
    id: 'grid',
    label: '2차원 배열',
    category: '배열',
    stdin: '3 4',
    code: `import sys

rows, cols = map(int, sys.stdin.readline().split())
grid = [[0] * cols for _ in range(rows)]

# 행과 열을 순회하며 값을 채웁니다
for r in range(rows):
    for c in range(cols):
        grid[r][c] = r * cols + c + 1

for row in grid:
    print(*row)`,
  },
  {
    id: 'input',
    label: '입력 · 누적 합',
    category: '입력',
    stdin: '5\n3 1 4 1 5',
    code: `n = int(input())
numbers = list(map(int, input().split()))
prefix = [0]
total = 0

# 입력받은 수를 하나씩 더해 누적 합 배열에 저장합니다
for i in range(n):
    total += numbers[i]
    prefix.append(total)

print(*prefix)`,
  },
  ...extraExamples,
].map((example) => ({ ...example, ...baseCases[example.id] }));
