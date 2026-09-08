"""Stepwise trace engine. Runs only the supplied code in its own namespace.
Snapshots are BEFORE the indicated line, except return/done/error events.
This is an educational tracer, not a security sandbox.
"""
import ast
import io
import json
import math
import sys
import time
import tokenize
import types
from collections import deque

FILENAME = "<stepwise>"
MAX_STEPS = 1200
MAX_TRACE_CHARS = 6_000_000


class TraceLimit(BaseException):
    pass


def run_trace(source, stdin_text=""):
    steps, warnings, hints, comments = [], set(), {}, {}
    namespace = {"__name__": "__main__"}
    output = io.StringIO()
    byte_input = io.BytesIO(stdin_text.encode("utf-8"))
    input_stream = io.TextIOWrapper(byte_input, encoding="utf-8")
    previous_streams = sys.stdin, sys.stdout, sys.stderr
    started, total_chars = time.monotonic(), 0
    frame_ids, next_id = {}, 0
    pending_exceptions = set()
    last_frame = None
    hints_by_type = {
        ast.For: "반복문에서 다음 항목을 가져와 반복할지 확인합니다.",
        ast.While: "반복 조건을 검사합니다. 참이면 반복문 안으로 들어갑니다.",
        ast.If: "조건을 검사합니다. 결과에 따라 다음 실행 위치가 달라집니다.",
        ast.Assign: "오른쪽 식을 계산한 뒤 변수 또는 자료구조에 저장합니다.",
        ast.AugAssign: "기존 값으로 계산한 결과를 다시 저장합니다.",
        ast.Return: "계산한 값을 호출한 함수로 돌려줍니다.",
        ast.FunctionDef: "함수를 정의합니다. 함수 본문은 호출할 때 실행됩니다.",
        ast.Break: "현재 반복문을 빠져나갑니다.",
        ast.Continue: "현재 반복의 나머지를 건너뛰고 다음 반복으로 이동합니다.",
        ast.Import: "모듈을 불러옵니다.",
        ast.ImportFrom: "모듈에서 필요한 기능을 불러옵니다.",
    }

    class BoundedOutput(io.TextIOBase):
        def write(self, text):
            if output.tell() + len(text) > 16000:
                raise TraceLimit("출력이 16,000자를 넘어 실행을 중단했습니다.")
            output.write(text)
            return len(text)
        def flush(self):
            pass
        def writable(self):
            return True

    def snapshot(frame, event, value=None, error=None):
        nonlocal total_chars, next_id
        budget = [600]

        def pack(obj, depth=0, seen=None):
            budget[0] -= 1
            if budget[0] < 0 or depth > 4:
                warnings.add("복잡한 값은 깊이 4, 단계당 600개 값까지만 표시합니다.")
                return {"type": "truncated", "value": "…"}
            t = type(obj)
            if obj is None or t in (bool, str, int, float):
                if t is str and len(obj) > 240:
                    warnings.add("긴 문자열은 처음 240자까지만 표시합니다.")
                    return obj[:240] + "…"
                if t is int and abs(obj) > 9007199254740991:
                    return {"type": "int", "value": str(obj)[:240]}
                if t is float and not math.isfinite(obj):
                    return {"type": "float", "value": str(obj)}
                return obj
            seen = set() if seen is None else seen
            if id(obj) in seen:
                return {"type": "reference", "value": "↩ 순환 참조"}
            branch = seen | {id(obj)}
            if t in (list, tuple, set, frozenset, deque):
                items = []
                for index, item in enumerate(obj):
                    if index >= 80:
                        break
                    items.append(pack(item, depth + 1, branch))
                if len(obj) > 80:
                    warnings.add("컨테이너는 처음 80개 항목까지만 표시합니다.")
                return {"type": t.__name__, "items": items, "length": len(obj)}
            if t is dict:
                items = []
                for index, (k, v) in enumerate(obj.items()):
                    if index >= 80:
                        break
                    items.append([pack(k, depth + 1, branch), pack(v, depth + 1, branch)])
                if len(obj) > 80:
                    warnings.add("컨테이너는 처음 80개 항목까지만 표시합니다.")
                return {"type": "dict", "items": items, "length": len(obj)}
            return {"type": t.__name__, "value": "<" + t.__name__ + ">"}

        def variables(scope):
            result = {}
            for k, v in list(scope.items()):
                if k.startswith("__") or isinstance(v, (types.ModuleType, types.FunctionType, type)):
                    continue
                if len(result) >= 40:
                    warnings.add("각 범위의 변수는 처음 40개까지만 표시합니다.")
                    break
                result[k] = pack(v)
            return result

        frames, current = [], frame
        while current is not None:
            if current.f_code.co_filename == FILENAME:
                if id(current) not in frame_ids:
                    next_id += 1
                    frame_ids[id(current)] = next_id
                frames.append(current)
            current = current.f_back
        frames.reverse()
        if len(frames) > 20:
            warnings.add("호출 스택은 최근 20개 프레임까지만 표시합니다.")
        stack = [{"id": frame_ids[id(f)], "name": f.f_code.co_name, "line": f.f_lineno,
                  "locals": variables(f.f_locals)} for f in frames[-20:]]
        state = {"event": event, "line": frame.f_lineno if frame else None,
                 "globals": variables(namespace), "stack": stack,
                 "output": output.getvalue()}
        if event == "return":
            state["returnValue"] = pack(value)
        if error:
            state["error"] = error
        encoded_size = len(json.dumps(state, ensure_ascii=False))
        if total_chars + encoded_size > MAX_TRACE_CHARS and event not in ("error", "done"):
            raise TraceLimit("실행 기록이 너무 커져 중단했습니다. 입력 크기를 줄여주세요.")
        total_chars += encoded_size
        steps.append(state)

    def trace(frame, event, arg):
        nonlocal last_frame, next_id
        if frame.f_code.co_filename != FILENAME:
            return None
        last_frame = frame
        if event == "call":
            next_id += 1
            frame_ids[id(frame)] = next_id
        if event == "exception":
            pending_exceptions.add(id(frame))
        elif event == "line":
            pending_exceptions.discard(id(frame))
        if len(steps) >= MAX_STEPS:
            raise TraceLimit("1,200단계에 도달해 중단했습니다. 입력이나 반복 횟수를 줄여주세요.")
        if time.monotonic() - started > 8:
            raise TraceLimit("실행 시간이 8초를 넘어 중단했습니다.")
        if event == "line" and frame.f_lineno > 0:
            snapshot(frame, "line")
        elif event == "return" and frame.f_code.co_name != "<module>" and id(frame) not in pending_exceptions:
            snapshot(frame, "return", arg)
        return trace

    error = None
    try:
        tree = ast.parse(source, filename=FILENAME)
        source_lines = source.splitlines()
        comment_tokens = {tok.start[0]: tok.string.lstrip('# ').strip() for tok in tokenize.generate_tokens(io.StringIO(source).readline) if tok.type == tokenize.COMMENT}
        for index, source_line in enumerate(source_lines, 1):
            if index in comment_tokens:
                comments[str(index)] = comment_tokens[index]
            elif index - 1 in comment_tokens and source_lines[index - 2].lstrip().startswith('#'):
                comments[str(index)] = comment_tokens[index - 1]
        for node in ast.walk(tree):
            if isinstance(node, ast.stmt):
                hint = hints_by_type.get(type(node), "이 줄을 실행한 결과는 다음 단계에서 확인할 수 있습니다.")
                if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
                    fn = node.value.func
                    if isinstance(fn, ast.Name) and fn.id == "print":
                        hint = "값을 출력합니다. 다음 단계의 출력 창에서 결과를 확인하세요."
                    else:
                        hint = "함수 또는 메서드를 호출합니다. 자료구조가 바뀔 수 있습니다."
                segment = ast.get_source_segment(source, node) or ""
                if "input(" in segment.split("\n")[0] or "stdin." in segment.split("\n")[0]:
                    hint = "표준 입력에서 값을 읽습니다. 입력 창의 값을 순서대로 사용합니다."
                hints[str(node.lineno)] = hint
        compiled = compile(tree, FILENAME, "exec")
        sys.stdin = input_stream
        sys.stdout = sys.stderr = BoundedOutput()
        sys.settrace(trace)
        exec(compiled, namespace, namespace)
    except BaseException as exc:
        error_line = getattr(exc, "lineno", None)
        tb = exc.__traceback__
        while tb:
            if tb.tb_frame.f_code.co_filename == FILENAME:
                error_line = tb.tb_lineno
                last_frame = tb.tb_frame
            tb = tb.tb_next
        message = str(exc)
        if isinstance(exc, EOFError):
            message = "표준 입력이 부족합니다. input() 호출 횟수에 맞게 입력 창에 값을 추가해주세요."
        error = {"type": type(exc).__name__, "message": message[:1000], "line": error_line}
    finally:
        sys.settrace(None)
        sys.stdin, sys.stdout, sys.stderr = previous_streams
    snapshot(last_frame if error else None, "error" if error else "done", error=error)
    if not error:
        steps[-1]["line"] = None
    return {"steps": steps, "error": error, "warnings": sorted(warnings), "hints": hints, "comments": comments,
            "elapsedMs": round((time.monotonic() - started) * 1000), "pythonVersion": sys.version.split()[0]}
