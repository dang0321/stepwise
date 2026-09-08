# Stepwise

파이썬 알고리즘을 실행하고 변수·배열·호출 스택의 변화를 단계별로 탐색하는 다크 테마 웹 앱입니다.

## 로컬 실행

Node.js 24 이상과 npm이 필요합니다. Python을 별도로 설치하지 않아도 사이트와 WASM 테스트를 실행할 수 있습니다.

```powershell
npm ci
npm run dev
```

터미널에 표시되는 주소를 엽니다. 기본 주소는 http://localhost:3000/ 입니다.

배포용 정적 파일을 만들고 확인하려면:

```powershell
npm run build
npm start
```

정적 결과물은 `dist/client/`, 정적 미리보기는 http://127.0.0.1:4173/ 입니다.

## 사용 방법

1. 예제를 선택하거나 **수정**을 눌러 코드를 입력합니다.
2. `input()` 등에 전달할 값을 **표준 입력** 창에 줄 단위로 적습니다.
3. **시각화 실행**을 누릅니다. 처음에는 Pyodide 실행 환경을 CDN에서 다운로드합니다.
4. **다음 줄**, 이전 단계, 재생, 정지, 속도(0.25×–4×), 타임라인으로 실행 과정을 살펴봅니다.
5. 변수 이름이나 변수 목록을 눌러 시각화 대상을 바꿉니다. 재귀 호출은 범위 선택으로 각 함수의 지역 변수를 볼 수 있습니다.

`← / →`는 단계 이동, `Space`는 재생/일시정지입니다. 코드 입력 창에서는 `Tab`으로 공백 4개를 넣고 `Ctrl + Enter`로 실행합니다.

**강조된 줄은 다음 실행할 줄입니다.** 보이는 변수는 그 줄 실행 전의 상태입니다. 직전 기록과 비교한 변화, 코드에 작성한 주석, 문장 종류에 따른 설명을 함께 보여줍니다. 함수 반환은 별도 단계이며 마지막 단계는 실행 완료 상태입니다. 일시정지는 기록 재생을 멈추고, 기록 수집 중 중단은 Worker 자체를 종료합니다.

## 입력 예시

```python
n = int(input())
numbers = list(map(int, input().split()))
print(n, sum(numbers))
```

표준 입력:

```text
5
3 1 4 1 5
```

`input()`, `sys.stdin.readline()`, `sys.stdin.read()`, `sys.stdin.buffer.readline()`를 지원합니다. 빈 줄과 마지막 줄바꿈 유무를 보존합니다. 입력을 전부 미리 넣는 방식이며 실행 중 입력 팝업은 제공하지 않습니다.

## 포함된 시각화

- 숫자 리스트: 값의 크기를 나타내는 막대, 인덱스, 바뀐 칸 강조
- 음수/문자열/혼합 리스트, tuple, set, deque: 값 카드
- 중첩 리스트: 행·열 격자
- 딕셔너리: 키/값 목록. 모든 값이 기존 키를 가리키는 리스트 등의 구조일 때 방향 그래프로 해석
- 정수/문자열 등: 현재 값
- 함수: 호출 스택, 범위별 지역 변수, 반환 값
- 같은 시점의 print 출력과 변수 변화 요약

막대 위의 i/j/left/right/mid/low/high는 같은 인덱스 값을 가진 변수 이름을 표시하는 규칙입니다. 코드 의미를 분석해 포인터임을 증명한 표시는 아닙니다. 그래프의 node/neighbor 강조도 변수 이름을 사용하는 표시 규칙입니다. 막대 높이는 현재 단계의 최대값에 맞춰 조정됩니다.

## 실행 방식과 한계

React + TypeScript + Vinext/Vite로 만든 정적 사이트입니다. Pyodide 314.0.6의 실제 Python을 모듈 Web Worker에서 실행하고 `sys.settrace`로 기록합니다. 예제 전용 애니메이션이 아니라 사용자가 작성한 코드의 실행 결과입니다.

입력한 코드를 업로드하는 서버나 분석 수집 기능은 구현하지 않았습니다. 런타임 다운로드에는 인터넷이 필요합니다. 사용자 코드가 직접 네트워크 기능을 호출하는 경우는 별개입니다. Worker는 새 실행마다 생성하여 상태를 분리하지만 **악성 코드를 위한 보안 샌드박스는 아닙니다.** 신뢰하는 알고리즘 코드를 사용하세요.

첫 버전의 범위:

- 최대 1,200단계. 추적 중 8초 검사 + 메인 스레드의 12초 강제 종료
- 실행 환경 다운로드에는 최대 90초 대기
- 출력 16,000자, 기록 약 600만 문자 제한
- 컨테이너 80개, 범위별 변수 40개, 깊이 4, 단계당 값 600개까지 표시. 생략 시 알림 표시
- 기본 파이썬/표준 라이브러리 중심. 별도 pip 패키지 설치 UI 없음
- 사용자 클래스는 타입 요약. 메모리 주소, 별칭 관계, 객체 내부를 완전하게 표시하지 않음
- 스레드·비동기·동적 exec로 생성한 소스·추적기를 변경하는 코드는 완전하게 추적하지 않음
- 복합 문장, comprehension, 함수 반환은 Python의 trace event 기준으로 여러 단계가 될 수 있음
- 되돌리기는 실행 기록의 재생이며 실제 실행을 역으로 수행하지 않음
- 주석 설명은 Python AST 문장 종류와 원래 주석에 기반. AI가 코드의 목적을 이해해 생성한 해설은 아님
- 코드와 입력은 페이지를 새로고침하면 초기화됨

## 검증

```powershell
npm run typecheck
npm test
npm run build
```

`npm test`는 Pyodide WASM에서 실행하는 21개 추적 계약 테스트, 내장 예제 6개, 값 표현 테스트를 포함합니다. Python 3이 별도 설치되어 있으면 아래로 같은 계약 테스트를 직접 실행할 수도 있습니다.

```powershell
$env:PYTHONPATH='public'
python -B -m unittest discover -s tests
```

브라우저 버튼 클릭·모바일 화면·실제 브라우저 CDN 다운로드를 포함한 E2E/시각 QA는 아직 수행하지 않았습니다. WebMCP를 지원하는 브라우저에는 읽기/단계 이동 도구를 선택적으로 등록하지만 해당 브라우저 환경에서의 계약 검증은 아직 수행하지 않았습니다.

Windows에서 기본 vinext CLI의 즉시 종료가 libuv assertion을 발생시켜 `scripts/build.mjs`는 같은 Vite build API와 Vinext prerender API를 순서대로 사용합니다. 오류를 성공으로 바꾸지 않으며 빌드/렌더 오류는 그대로 실패합니다.

## GitHub Pages로 공유하기

사이트 주소: https://dang0321.github.io/stepwise/

저장소: https://github.com/dang0321/stepwise

GitHub Pages는 `main` 브랜치의 `/docs` 폴더를 게시 원본으로 사용합니다. `docs/`에는 현재 버전의 정적 빌드 결과가 포함되어 있습니다.

저장소 이름이 `stepwise`인 경우, 저장소의 하위 경로를 포함해 빌드합니다.

```powershell
$env:PAGES_BASE_PATH='/stepwise'
npm run build
Get-ChildItem -LiteralPath dist/client/stepwise -Force | Copy-Item -Destination docs -Recurse -Force
Remove-Item Env:PAGES_BASE_PATH
```

`사용자명.github.io`라는 루트 사이트 저장소는 `PAGES_BASE_PATH`를 생략합니다. 하위 경로를 사용한 이 예시에서는 `dist/client/stepwise` 폴더의 내용 전체를 GitHub Pages 배포 대상으로 사용합니다. 루트 사이트는 `dist/client`를 사용합니다. `.nojekyll`도 함께 포함합니다.

변경한 소스와 `docs/`를 함께 커밋해 `main`에 푸시하면 GitHub Pages가 새 스냅샷을 게시합니다. 게시 상태는 저장소의 Actions 또는 Settings → Pages에서 확인할 수 있습니다.

## 코드 위치

- `app/page.tsx`: 에디터, 실행 상태, 재생 컨트롤, 설명 패널
- `components/data-view.tsx`: 자료구조별 렌더링
- `public/python-worker.mjs`: Pyodide 로딩 및 Worker 메시지
- `public/tracer.py`: 실행 추적, 입력/출력, 제한, 설명 생성
- `lib/examples.ts`: 내장 예제
- `tests/`: 추적 엔진 테스트

구현 참고: [Pyodide Web Worker](https://pyodide.org/en/stable/usage/webworker.html), [Python sys.settrace](https://docs.python.org/3/library/sys.html#sys.settrace). 2026-09-08 확인.
