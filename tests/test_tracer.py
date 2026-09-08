import json
import unittest
from tracer import run_trace

class TracerTests(unittest.TestCase):
    def run_ok(self, code, stdin=""):
        r = run_trace(code, stdin)
        self.assertIsNone(r["error"], r["error"])
        self.assertEqual(r["steps"][-1]["event"], "done")
        json.dumps(r, allow_nan=False)
        return r

    def test_before_line_semantics(self):
        r = self.run_ok("x = 1\nx = 2\nprint(x)")
        self.assertNotIn("x", r["steps"][0]["globals"])
        self.assertEqual(r["steps"][1]["line"], 2)
        self.assertEqual(r["steps"][1]["globals"]["x"], 1)
        self.assertEqual(r["steps"][2]["globals"]["x"], 2)
        self.assertEqual(r["steps"][-1]["output"], "2\n")

    def test_input_without_final_newline(self):
        r = self.run_ok("n=int(input())\na=list(map(int,input().split()))\nprint(n,sum(a))", "3\n4 5 6")
        self.assertEqual(r["steps"][-1]["output"], "3 15\n")

    def test_stdin_readline_and_buffer(self):
        r = self.run_ok("import sys\na=sys.stdin.readline()\nb=sys.stdin.read()\nprint(a.strip(), b.strip())", "hello\nworld")
        self.assertEqual(r["steps"][-1]["output"], "hello world\n")
        r = self.run_ok("import sys\nprint(sys.stdin.buffer.readline().decode().strip())", "test")
        self.assertEqual(r["steps"][-1]["output"], "test\n")

    def test_blank_input_line_and_prompt(self):
        r = self.run_ok("a=input('name: ')\nb=input()\nprint(repr(a), b)", "\nhello")
        self.assertEqual(r["steps"][-1]["output"], "name: '' hello\n")

    def test_input_eof(self):
        r = run_trace("a=input()\nb=input()", "one")
        self.assertEqual(r["error"]["type"], "EOFError")
        self.assertEqual(r["error"]["line"], 2)
        self.assertEqual(r["steps"][-1]["globals"]["a"], "one")

    def test_syntax_error(self):
        r = run_trace("if True\n    pass")
        self.assertEqual(r["error"]["type"], "SyntaxError")
        self.assertEqual(r["error"]["line"], 1)

    def test_runtime_error_keeps_trace(self):
        r = run_trace("a=[1,2]\nx=a[3]")
        self.assertEqual(r["error"]["type"], "IndexError")
        self.assertEqual(r["error"]["line"], 2)
        self.assertEqual(r["steps"][-1]["globals"]["a"]["items"], [1,2])

    def test_recursion_stack_and_returns(self):
        r = self.run_ok("def f(n):\n    if n<=1:\n        return 1\n    return n*f(n-1)\na=f(5)\nprint(a)")
        self.assertEqual(r["steps"][-1]["output"], "120\n")
        self.assertEqual(max(len(s["stack"]) for s in r["steps"]), 6)
        returns=[s["returnValue"] for s in r["steps"] if s["event"]=="return"]
        self.assertEqual(returns, [1,2,6,24,120])

    def test_mutations_are_independent_snapshots(self):
        r = self.run_ok("a=[1,2]\nb=a\na[0]=9\nprint(b)")
        self.assertEqual(r["steps"][2]["globals"]["a"]["items"], [1,2])
        self.assertEqual(r["steps"][3]["globals"]["a"]["items"], [9,2])
        self.assertEqual(r["steps"][3]["globals"]["b"]["items"], [9,2])

    def test_nested_matrix(self):
        r = self.run_ok("a=[[0]*3 for _ in range(2)]\na[1][2]=7")
        self.assertEqual(r["steps"][-1]["globals"]["a"]["items"][1]["items"], [0,0,7])

    def test_deque_set_and_dict(self):
        r = self.run_ok("from collections import deque\nq=deque([1,2])\nq.popleft()\ns={3,4}\nd={1:[2]}")
        g=r["steps"][-1]["globals"]
        self.assertEqual(g["q"]["items"], [2])
        self.assertEqual(g["s"]["type"], "set")
        self.assertEqual(g["d"]["type"], "dict")

    def test_cycle_and_large_int(self):
        r = self.run_ok("a=[]\na.append(a)\nb=10**30\nc=float('inf')")
        g=r["steps"][-1]["globals"]
        self.assertEqual(g["a"]["items"][0]["type"], "reference")
        self.assertEqual(g["b"]["value"], "1000000000000000000000000000000")
        self.assertEqual(g["c"]["value"], "inf")

    def test_empty_program_and_deleted_variable(self):
        self.assertEqual(len(self.run_ok("")["steps"]), 1)
        r = self.run_ok("x=1\ndel x")
        self.assertNotIn("x",r["steps"][-1]["globals"])

    def test_loop_limit(self):
        r = run_trace("while True:\n    pass")
        self.assertEqual(r["error"]["type"], "TraceLimit")
        self.assertLessEqual(len(r["steps"]),1201)

    def test_output_limit(self):
        r = run_trace("print('x'*17000)")
        self.assertEqual(r["error"]["type"], "TraceLimit")

    def test_container_truncation(self):
        r = self.run_ok("a=list(range(100))")
        self.assertEqual(len(r["steps"][-1]["globals"]["a"]["items"]),80)
        self.assertEqual(r["steps"][-1]["globals"]["a"]["length"],100)
        self.assertTrue(r["warnings"])

    def test_comments_do_not_treat_hash_in_string_as_comment(self):
        r = self.run_ok("# count\nx=1\ns='# not a comment'")
        self.assertEqual(r["comments"]["2"], "count")
        self.assertNotIn("3",r["comments"])

    def test_caught_exception_continues(self):
        r = self.run_ok("try:\n    x=1/0\nexcept ZeroDivisionError:\n    x=10\nprint(x)")
        self.assertEqual(r["steps"][-1]["output"], "10\n")

    def test_namespaces_do_not_leak_between_runs(self):
        self.run_ok("private_value=12")
        r=run_trace("print(private_value)")
        self.assertEqual(r["error"]["type"], "NameError")

    def test_repeated_calls_have_distinct_frames(self):
        r=self.run_ok("def f(n):\n    return n+1\nfor i in range(5):\n    f(i)")
        ids=[s["stack"][-1]["id"] for s in r["steps"] if s["event"]=="return"]
        self.assertEqual(len(set(ids)),5)

    def test_unwinding_error_is_not_a_successful_return(self):
        r=run_trace("def f():\n    return 1/0\nf()")
        self.assertEqual(r["error"]["type"], "ZeroDivisionError")
        self.assertFalse(any(s["event"]=="return" for s in r["steps"]))

if __name__ == "__main__":
    unittest.main()
