import unittest
from input_samples import suggest_inputs
from tracer import run_trace

class InputSampleTests(unittest.TestCase):
    def valid(self, code):
        r=suggest_inputs(code)
        self.assertEqual(r['status'],'inferred',r)
        self.assertGreater(len(r['samples']),0)
        for s in r['samples']:
            self.assertFalse(s['verified'])
            result=run_trace(code,s['stdin'])
            self.assertIsNone(result['error'],result['error'])
        return r['samples']

    def test_array_count(self):
        for s in self.valid('n=int(input())\na=list(map(int,input().split()))\nassert len(a)==n'):
            n,row=s['stdin'].splitlines()
            self.assertEqual(int(n),len(row.split()))

    def test_grid_dimensions(self):
        code='n,m=map(int,input().split())\na=[list(map(int,input().split())) for _ in range(n)]\nassert len(a)==n\nassert all(len(row)==m for row in a)'
        self.valid(code)

    def test_string_rows(self):
        self.valid('n,m=map(int,input().split())\na=[list(input().strip()) for _ in range(n)]\nassert all(len(row)==m for row in a)')

    def test_multiple_cases(self):
        self.valid('t=int(input())\nfor _ in range(t):\n    n=int(input())\n    a=list(map(int,input().split()))\n    assert len(a)==n')

    def test_readline_alias(self):
        self.valid('import sys\nread=sys.stdin.readline\nn=int(read())\na=list(map(int,read().split()))\nassert len(a)==n')

    def test_readline_qualified(self):
        self.valid('import sys\nn=int(sys.stdin.readline())\nprint(n)')

    def test_graph_edges(self):
        self.valid('n,m=map(int,input().split())\ng=[[] for _ in range(n+1)]\nfor _ in range(m):\n    a,b,w=map(int,input().split())\n    g[a].append((b,w))\n    assert 1<=a<=n and 1<=b<=n and w>0')

    def test_conditional_input_is_not_guessed(self):
        r=suggest_inputs('n=int(input())\nif n>2:\n    x=input()')
        self.assertEqual(r['status'],'unsupported')
        self.assertEqual(r['samples'],[])

    def test_bulk_token_reader_is_not_guessed(self):
        self.assertEqual(suggest_inputs('import sys\na=list(map(int,sys.stdin.read().split()))')['status'],'unsupported')

    def test_bulk_alias_is_not_guessed(self):
        self.assertEqual(suggest_inputs('import sys\nread=sys.stdin.read\na=list(map(int,read().split()))')['status'],'unsupported')

    def test_stdin_import_alias(self):
        self.valid('from sys import stdin as source\nn=int(source.readline())')

    def test_custom_separator_not_guessed(self):
        self.assertEqual(suggest_inputs('a=list(map(int,input().split(",")))')['status'],'unsupported')

    def test_indexed_cast_not_guessed(self):
        self.assertEqual(suggest_inputs('n=int(input().split()[2])')['status'],'unsupported')

    def test_huge_range_not_materialized(self):
        self.assertEqual(suggest_inputs('for _ in range(100000000000):\n    n=int(input())')['status'],'unsupported')

    def test_character_domain_from_comparisons(self):
        for s in self.valid('text=input()\nfor char in text:\n    if char=="(":\n        pass\nassert set(text)<=set("()")'):
            self.assertLessEqual(set(s['stdin']),set('()'))

    def test_invalid_code(self):
        self.assertEqual(suggest_inputs('if:')['status'],'invalid')

    def test_no_input(self):
        self.assertEqual(suggest_inputs('x="input()" # input()')['status'],'none')

    def test_analysis_does_not_execute_calls(self):
        r=suggest_inputs('raise RuntimeError("do not execute")\nn=int(input())')
        self.assertEqual(r['status'],'inferred')
