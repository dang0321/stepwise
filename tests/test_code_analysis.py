import unittest
from code_analysis import CodeAnalysis, safe_value, UNKNOWN
import ast

class AnalysisTests(unittest.TestCase):
    def ids(self, source):
        return {c['id'] for c in CodeAnalysis(source).public()['candidates']}

    def test_binary_search_renamed_variables(self):
        source='lo,hi=0,len(values)-1\nwhile lo<=hi:\n    pivot=(lo+hi)//2\n    if values[pivot]<target:\n        lo=pivot+1\n    else:\n        hi=pivot-1'
        a=CodeAnalysis(source)
        self.assertIn('binary_search', self.ids(source))
        self.assertEqual(a.bounds['<module>']['values'],{'left':'lo','right':'hi','mid':'pivot'})
        self.assertEqual(a.roles['<module>']['values']['view'],'interval')

    def test_arithmetic_average_is_not_binary_search(self):
        self.assertNotIn('binary_search',self.ids('while a<b:\n    avg=(a+b)//2\n    print(avg)\n    break'))

    def test_scope_collision_does_not_create_stack(self):
        self.assertNotIn('stack',self.ids('def f(items):\n    items.append(1)\ndef g(items):\n    items.pop()'))

    def test_unrelated_stack_not_backtracking(self):
        self.assertNotIn('backtracking',self.ids('items=[]\nitems.append(1)\nitems.pop()\ndef fact(n):\n    return n*fact(n-1) if n else 1'))

    def test_matrix_iteration_is_not_graph(self):
        source='from collections import deque\nq=deque([0])\nx=q.popleft()\na=[[1,2],[3,4]]\nfor row in a[x]:\n    print(row)'
        self.assertNotIn('bfs',self.ids(source))

    def test_grid_bfs_not_prefix_sum(self):
        ids=self.ids('from collections import deque\nq=deque([(0,0)])\nr,c=q.popleft()\nd[nr][nc]=d[r][c]+1')
        self.assertIn('grid_bfs',ids)
        self.assertNotIn('prefix_sum',ids)

    def test_counter_role(self):
        a=CodeAnalysis('from collections import Counter as C\ncounts=C(values)')
        self.assertEqual(a.roles['<module>']['counts']['view'],'frequency')

    def test_heap_alias(self):
        a=CodeAnalysis('import heapq as h\nh.heappush(frontier,(cost,node))')
        self.assertEqual(a.roles['<module>']['frontier']['view'],'heap')

    def test_graph_pointer_bindings(self):
        a=CodeAnalysis('edges[u].append(v)\nfor destination in edges[origin]:\n    print(destination)')
        self.assertEqual(a.roles['<module>']['edges']['bindings'],{'current':'origin','neighbor':'destination'})

    def test_table_recurrence(self):
        self.assertIn('dynamic_programming', self.ids('memo[i]=memo[i-1]+memo[i-2]'))

    def test_prefix_recurrence(self):
        self.assertIn('prefix_sum',self.ids('s[i]=s[i-1]+values[i]'))

    def test_focus_nested_indices(self):
        a=CodeAnalysis('grid[r][c] = grid[r-1][c] + 1')
        result=a.observe(1,{'r':2,'c':3})
        self.assertEqual({(f['kind'],tuple(f['indices'])) for f in result['focus']},{('read',(1,3)),('write',(2,3))})

    def test_condition_pre_execution(self):
        a=CodeAnalysis('if data[position] < goal:\n    position+=1')
        r=a.observe(1,{'data':[2,6],'position':1,'goal':8})
        self.assertEqual(r['condition']['value'],True)
        self.assertEqual(r['focus'][0]['indices'],[1])

    def test_child_statements_not_observed_early(self):
        a=CodeAnalysis('if flag:\n    data[i]=3')
        self.assertEqual(a.observe(1,{'flag':True,'i':0})['focus'],[])

    def test_side_effect_call_not_reexecuted(self):
        calls=[]
        def advance():
            calls.append(1)
            return 0
        a=CodeAnalysis('if values[advance()] == 1:\n    pass')
        r=a.observe(1,{'values':[1],'advance':advance})
        self.assertEqual(calls,[])
        self.assertEqual(r['focus'],[])
        self.assertNotIn('condition',r)

    def test_custom_getitem_not_reexecuted(self):
        class Trap:
            def __getitem__(self,key): raise AssertionError('must not execute')
        a=CodeAnalysis('if obj[i] == 1:\n    pass')
        self.assertNotIn('condition',a.observe(1,{'obj':Trap(),'i':0}))

    def test_shadowed_len_not_called(self):
        node=ast.parse('len(items)',mode='eval').body
        self.assertIs(safe_value(node,{'items':[1],'len':lambda x:9}),UNKNOWN)
        self.assertEqual(safe_value(node,{'items':[1]}),1)

    def test_negative_index_kept_for_renderer(self):
        a=CodeAnalysis('x=values[-1]')
        self.assertEqual(a.observe(1,{})['focus'][0]['indices'],[-1])

    def test_conditions_with_incompatible_values_are_unknown(self):
        node=ast.parse('a < b',mode='eval').body
        self.assertIs(safe_value(node,{'a':None,'b':2}),UNKNOWN)

    def test_bitmask_loop_role(self):
        a=CodeAnalysis('for subset in range(1<<size):\n    print(subset)')
        self.assertEqual(a.roles['<module>']['subset']['view'],'bits')

    def test_countdown_in_bfs_not_topological(self):
        source='q.popleft()\ng[u].append(v)\nfor v in g[u]:\n    capacity[v]-=1\n    q.append(v)'
        self.assertNotIn('topological',self.ids(source))
