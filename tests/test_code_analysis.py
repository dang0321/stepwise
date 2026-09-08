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
        self.assertEqual(a.roles['<module>']['subset']['widthVariable'],'size')

    def test_countdown_in_bfs_not_topological(self):
        source='q.popleft()\ng[u].append(v)\nfor v in g[u]:\n    capacity[v]-=1\n    q.append(v)'
        self.assertNotIn('topological',self.ids(source))

class RuntimeRoleTests(unittest.TestCase):
    def trace(self,code):
        from tracer import run_trace
        r=run_trace(code)
        self.assertIsNone(r['error'],r['error'])
        return r

    def test_function_parameter_reaches_global_alias(self):
        r=self.trace('import heapq\ndata=[4,2,3]\ncopy=data\ndef prepare(bucket):\n    heapq.heapify(bucket)\nprepare(data)\nprint(copy)')
        last=r['steps'][-1]
        self.assertEqual(last['roles']['data']['view'],'heap')
        self.assertEqual(last['roles']['copy']['origin'],'shared')
        self.assertIn('copy',last['roles']['data']['aliases'])
        self.assertTrue(any(s['stack'] and s['stack'][-1]['name']=='prepare' and s['stack'][-1]['roles']['bucket']['view']=='heap' for s in r['steps']))

    def test_equal_copy_does_not_inherit_identity(self):
        r=self.trace('import heapq\ndata=[4,2,3]\ncopy=data.copy()\nheapq.heapify(data)')
        self.assertNotIn('copy',r['steps'][-1]['roles'])

    def test_rebinding_alias_breaks_link(self):
        r=self.trace('import heapq\ndata=[4,2,3]\nother=data\nheapq.heapify(data)\nother=[8,9]')
        self.assertNotIn('other',r['steps'][-1]['roles'])

    def test_returned_container_keeps_learned_role(self):
        r=self.trace('import heapq\ndef make():\n    items=[3,1,2]\n    heapq.heapify(items)\n    return items\nanswer=make()')
        self.assertEqual(r['steps'][-1]['roles']['answer']['view'],'heap')

    def test_alias_read_focus(self):
        r=self.trace('items=[2,3]\nalias=items\ni=1\nvalue=alias[i]')
        focus=next(s['focus'][0] for s in r['steps'] if s['line']==4 and s['event']=='line')
        self.assertEqual(focus['variable'],'alias')
        self.assertIn('items',focus['aliases'])

    def test_runtime_cache_is_bounded(self):
        from code_analysis import CodeAnalysis
        a=CodeAnalysis('import heapq\nheapq.heapify(items)')
        for _ in range(100):
            a.runtime_roles([('global','<module>',{'items':[]})])
        self.assertLessEqual(len(a.role_cache),64)

    def test_custom_object_is_not_inspected(self):
        class Trap:
            def __eq__(self,other):raise AssertionError('no equality calls')
            def __iter__(self):raise AssertionError('no iteration calls')
        a=CodeAnalysis('print(items)')
        self.assertEqual(a.runtime_roles([('global','<module>',{'items':Trap()})])['global'],{})

    def test_graph_function_parameter(self):
        r=self.trace('from collections import deque\ndef walk(links):\n    pending=deque([0])\n    seen=[False]*len(links)\n    while pending:\n        point=pending.popleft()\n        for other in links[point]:\n            if not seen[other]:\n                seen[other]=True\n                pending.append(other)\nconnections=[[1],[]]\nwalk(connections)')
        self.assertIn('bfs',{c['id'] for c in r['analysis']['candidates']})
        self.assertEqual(r['steps'][-1]['roles']['connections']['view'],'graph')

    def test_recursive_frames_keep_local_identity(self):
        r=self.trace('import heapq\ndef visit(n):\n    bucket=[n]\n    heapq.heapify(bucket)\n    if n: visit(n-1)\nvisit(2)')
        s=next(s for s in r['steps'] if len(s['stack'])==4 and 'bucket' in s['stack'][-1]['locals'])
        self.assertTrue(all(f['roles'].get('bucket',{}).get('aliases',[])==[] for f in s['stack'][1:]))

class UserCodePatterns(unittest.TestCase):
    def test_pop_zero_is_queue(self):
        a=CodeAnalysis('pending.append(1)\nvalue=pending.pop(0)')
        self.assertEqual(a.roles['<module>']['pending']['view'],'queue')

    def test_unrelated_custom_heappush_not_heap(self):
        a=CodeAnalysis('def heappush(items,x):\n    items.append(x)\nheappush(values,3)')
        self.assertNotIn('heap',{c['id'] for c in a.candidates})
        self.assertIn('heappush(values, 3)',a.hints['3'])

    def test_reversed_weighted_tuple(self):
        a=CodeAnalysis('links[u].append((weight,v))\nfor cost,destination in links[origin]:\n    if cost<distance[destination]:\n        distance[destination]=cost')
        r=a.roles['<module>']['links']
        self.assertEqual(r['neighborIndex'],1)
        self.assertEqual(r['bindings']['neighbor'],'destination')
        self.assertIn('distance',r['related'])

    def test_dict_of_dict_graph(self):
        a=CodeAnalysis('edges={"A":{"B":2},"B":{}}\nfor neighbor,cost in edges[point].items():\n    print(cost)')
        self.assertEqual(a.roles['<module>']['edges']['view'],'graph')

    def test_short_circuit_and(self):
        a=CodeAnalysis('if i<len(a) and a[i]>0:\n    pass')
        r=a.observe(1,{'i':0,'a':[]})
        self.assertEqual(r['focus'],[])
        self.assertIs(r['condition']['value'],False)

    def test_short_circuit_or(self):
        a=CodeAnalysis('if ready or a[i]>0:\n    pass')
        self.assertEqual(a.observe(1,{'ready':True,'a':[1],'i':0})['focus'],[])

    def test_conditional_expression(self):
        a=CodeAnalysis('x=a[i] if ok else b[j]')
        f=a.observe(1,{'ok':False,'i':0,'j':1})['focus']
        self.assertEqual([x['variable'] for x in f],['b'])

    def test_compound_call_stops_later_prediction(self):
        a=CodeAnalysis('x=advance()+items[i]')
        self.assertEqual(a.observe(1,{'i':0})['focus'],[])

    def test_comprehension_not_using_outer_index(self):
        a=CodeAnalysis('x=[data[i] for i in range(3)]')
        self.assertEqual(a.observe(1,{'i':9})['focus'],[])

    def test_chained_comparison_short_circuit(self):
        a=CodeAnalysis('if a[i]<0<b[j]:\n    pass')
        r=a.observe(1,{'a':[2],'b':[],'i':0,'j':0})
        f=r['focus']
        self.assertEqual([x['variable'] for x in f],['a'])
        self.assertIs(r['condition']['value'],False)

    def test_called_receiver_is_not_evaluated_twice(self):
        a=CodeAnalysis('factory().consume(items[i])')
        self.assertEqual(a.observe(1,{'i':0})['focus'],[])
