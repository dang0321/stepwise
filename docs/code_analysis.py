"""Explain supported Python AST patterns; no eval/exec, probabilistic scores or AI claims."""
import ast
import operator
from collections import deque, Counter, defaultdict

UNKNOWN = object()

def dotted(node):
    if isinstance(node, ast.Name): return node.id
    if isinstance(node, ast.Attribute): return dotted(node.value)+"."+node.attr
    return ""

def root_access(node):
    indices=[]
    while isinstance(node,ast.Subscript):
        indices.insert(0,node.slice)
        node=node.value
    return (node.id,indices) if isinstance(node,ast.Name) else (None,[])

def safe_value(node, values, budget=None):
    budget=[35] if budget is None else budget
    budget[0]-=1
    if budget[0]<0:return UNKNOWN
    def get(n):return safe_value(n,values,budget)
    primitive=(int,float,str,bool,type(None))
    if isinstance(node,ast.Constant) and type(node.value) in primitive:return node.value
    if isinstance(node,ast.Name):return values.get(node.id,UNKNOWN)
    if isinstance(node,ast.BoolOp):
        for child in node.values:
            value=get(child)
            if type(value) not in primitive:return UNKNOWN
            if isinstance(node.op,ast.And) and not value:return value
            if isinstance(node.op,ast.Or) and value:return value
        return value
    if isinstance(node,ast.IfExp):
        test=get(node.test)
        if type(test) not in primitive:return UNKNOWN
        return get(node.body if test else node.orelse)
    if isinstance(node,ast.Subscript):
        obj,key=get(node.value),get(node.slice)
        if type(obj) not in (list,tuple,dict,str,deque) or type(key) not in (int,str):return UNKNOWN
        try:return obj[key]
        except (KeyError,IndexError,TypeError):return UNKNOWN
    if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id=='len' and len(node.args)==1 and not node.keywords and 'len' not in values:
        obj=get(node.args[0])
        return len(obj) if type(obj) in (list,tuple,dict,str,set,deque) else UNKNOWN
    if isinstance(node,ast.BinOp):
        a,b=get(node.left),get(node.right)
        ops={ast.Add:operator.add,ast.Sub:operator.sub,ast.Mult:operator.mul,ast.FloorDiv:operator.floordiv,ast.Mod:operator.mod,ast.BitAnd:operator.and_,ast.BitOr:operator.or_,ast.BitXor:operator.xor,ast.LShift:operator.lshift,ast.RShift:operator.rshift}
        if type(a) not in (int,float) or type(b) not in (int,float) or type(node.op) not in ops:return UNKNOWN
        if isinstance(node.op,(ast.LShift,ast.RShift)) and not 0<=b<=64:return UNKNOWN
        try:return ops[type(node.op)](a,b)
        except (ArithmeticError,ValueError,TypeError):return UNKNOWN
    if isinstance(node,ast.UnaryOp):
        v=get(node.operand)
        if type(v) not in primitive:return UNKNOWN
        try:
            if isinstance(node.op,ast.Not):return not v
            if isinstance(node.op,ast.USub) and type(v) in (int,float):return -v
            if isinstance(node.op,ast.Invert) and type(v) is int:return ~v
        except (TypeError,ValueError):pass
    if isinstance(node,ast.Compare):
        ops={ast.Eq:operator.eq,ast.NotEq:operator.ne,ast.Lt:operator.lt,ast.LtE:operator.le,ast.Gt:operator.gt,ast.GtE:operator.ge,ast.Is:operator.is_,ast.IsNot:operator.is_not}
        left=get(node.left)
        try:
            for op,expression in zip(node.ops,node.comparators):
                right=get(expression)
                if type(left) not in primitive or type(right) not in primitive:return UNKNOWN
                if not ops[type(op)](left,right):return False
                left=right
            return True
        except (KeyError,TypeError):return UNKNOWN
    return UNKNOWN


def planned_accesses(node, values):
    """Follow expression order and short-circuiting; stop after unknown side effects."""
    accesses=[]
    def visit(current, prefix=False):
        if isinstance(current,(ast.ListComp,ast.SetComp,ast.DictComp,ast.GeneratorExp,ast.Lambda,ast.NamedExpr)):
            return True
        if isinstance(current,ast.BoolOp):
            for child in current.values:
                if visit(child):return True
                value=safe_value(child,values)
                if type(value) not in (int,float,str,bool,type(None)):return True
                if isinstance(current.op,ast.And) and not value:return False
                if isinstance(current.op,ast.Or) and value:return False
            return False
        if isinstance(current,ast.IfExp):
            if visit(current.test):return True
            test=safe_value(current.test,values)
            if type(test) not in (int,float,str,bool,type(None)):return True
            return visit(current.body if test else current.orelse)
        if isinstance(current,ast.Compare):
            left=current.left
            if visit(left):return True
            for op,right in zip(current.ops,current.comparators):
                if visit(right):return True
                result=safe_value(ast.Compare(left=left,ops=[op],comparators=[right]),values)
                if result is False:return False
                if result is UNKNOWN:return True
                left=right
            return False
        if isinstance(current,ast.Subscript):
            if visit(current.value,True) or visit(current.slice):return True
            if not prefix:accesses.append(current)
            return False
        if isinstance(current,ast.Call):
            if visit(current.func):return True
            for arg in [*current.args,*(k.value for k in current.keywords)]:
                if visit(arg):return True
            return not (isinstance(current.func,ast.Name) and current.func.id=='len' and 'len' not in values)
        for child in ast.iter_child_nodes(current):
            if visit(child):return True
        return False
    uncertain=visit(node)
    return accesses,uncertain

class CodeAnalysis:
    def __init__(self,source):
        self.source=source
        self.tree=ast.parse(source)
        self.roles={}
        self.candidates=[]
        self.line_nodes={}
        self.scopes={}
        self.aliases={}
        self.bounds={}
        self.role_cache={}
        self._walk(self.tree,'<module>')
        self._detect()
        self.hints={}
        for line,node in self.line_nodes.items():
            text=ast.unparse(node).splitlines()[0][:160]
            if isinstance(node,ast.Assign):hint="대입: "+", ".join(ast.unparse(t) for t in node.targets)+" ← "+ast.unparse(node.value)[:140]
            elif isinstance(node,ast.AugAssign):hint="누적 갱신: "+text
            elif isinstance(node,ast.For):hint=ast.unparse(node.iter)+"에서 값을 가져와 "+ast.unparse(node.target)+"에 배정합니다."
            elif isinstance(node,(ast.If,ast.While)):hint="조건 검사: "+ast.unparse(node.test)
            elif isinstance(node,ast.Return):hint="반환할 식: "+(ast.unparse(node.value) if node.value else "None")
            elif isinstance(node,ast.Expr) and isinstance(node.value,ast.Call):
                call=node.value;name=self.canonical(call.func)
                hint={"heappush":"힙에 원소를 넣고 힙 순서를 복구합니다.","heappop":"힙의 최솟값을 꺼내고 힙 순서를 복구합니다.","popleft":"큐의 앞에서 원소를 꺼냅니다.","append":"자료구조의 뒤에 원소를 추가합니다.","pop":"지정 위치의 원소를 꺼냅니다.","print":"현재 값을 출력합니다."}.get(name.split('.')[-1],"호출: "+ast.unparse(call))
                if name.split('.')[-1] in ('heappush','heappop') and not name.startswith('heapq.'):
                    hint='호출: '+ast.unparse(call)
            else:hint=text
            self.hints[str(line)]=hint

    def canonical(self,node):
        name=dotted(node)
        first,*rest=name.split('.')
        return '.'.join([self.aliases.get(first,first)]+rest)

    def _walk(self,node,scope):
        self.scopes[id(node)]=scope
        if isinstance(node,ast.stmt):self.line_nodes.setdefault(node.lineno,node)
        if isinstance(node,ast.Import):
            for n in node.names:self.aliases[n.asname or n.name]=n.name
        if isinstance(node,ast.ImportFrom):
            for n in node.names:self.aliases[n.asname or n.name]=(node.module or '')+'.'+n.name
        if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):
            scope=node.name+'@'+str(node.lineno)
        for child in ast.iter_child_nodes(node):self._walk(child,scope)

    def role(self,node,name,kind,reason,priority=1):
        if not name:return
        scope=self.scopes.get(id(node),'<module>')
        record=self.roles.setdefault(scope,{})
        if priority>=record.get(name,{}).get('priority',0):
            record[name]={"view":kind,"reason":reason,"priority":priority,"line":node.lineno}

    def candidate(self,kind,label,nodes,reason,rank=1,confidence='pattern'):
        if not nodes:return
        if any(c['id']==kind for c in self.candidates):return
        lines=sorted(set(n.lineno for n in nodes if hasattr(n,'lineno')))[:5]
        self.candidates.append({"id":kind,"label":label,"evidence":reason,"lines":lines,"rank":rank,"confidence":confidence})

    def _detect(self):
        nodes=list(ast.walk(self.tree))
        calls=[n for n in nodes if isinstance(n,ast.Call)]
        assignments=[n for n in nodes if isinstance(n,(ast.Assign,ast.AugAssign))]
        rec=[]
        for fn in [n for n in nodes if isinstance(n,ast.FunctionDef)]:
            if any(isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id==fn.name for n in ast.walk(fn)):
                rec.append(fn)
        methods={}
        for c in calls:
            if isinstance(c.func,ast.Attribute) and isinstance(c.func.value,ast.Name):
                methods.setdefault((self.scopes[id(c)],c.func.value.id),{}).setdefault(c.func.attr,[]).append(c)
        adjacency=[]
        for c in calls:
            if isinstance(c.func,ast.Attribute) and c.func.attr=='append' and isinstance(c.func.value,ast.Subscript):
                name,_=root_access(c.func.value)
                adjacency.append(c)
                self.role(c,name,'graph','정점별 컨테이너에 이웃을 추가하는 구문',4)
        graph_names={(self.scopes[id(c)],root_access(c.func.value)[0]) for c in adjacency}
        for a in assignments:
            if isinstance(a,ast.Assign) and isinstance(a.value,ast.Dict) and all(isinstance(v,(ast.List,ast.Tuple,ast.Dict)) for v in a.value.values):
                graph_names.update((self.scopes[id(a)],t.id) for t in a.targets if isinstance(t,ast.Name))
        traversal_scopes={scope for (scope,_),ops in methods.items() if 'popleft' in ops or any(len(c.args)==1 and isinstance(c.args[0],ast.Constant) and c.args[0].value==0 for c in ops.get('pop',[]))}|{fn.name+'@'+str(fn.lineno) for fn in rec}
        for n in nodes:
            if isinstance(n,ast.For):
                iterator=n.iter.func.value if isinstance(n.iter,ast.Call) and isinstance(n.iter.func,ast.Attribute) and n.iter.func.attr=='items' else n.iter
                name,indices=root_access(iterator)
                targets=n.target.elts if isinstance(n.target,(ast.Tuple,ast.List)) else [n.target]
                if not targets:continue
                index_names=[x.slice.id for b in n.body for x in ast.walk(b) if isinstance(x,ast.Subscript) and isinstance(x.slice,ast.Name)]
                uses_neighbors=any(isinstance(t,ast.Name) and t.id in index_names for t in targets)
                known=(self.scopes[id(n)],name) in graph_names or ('<module>',name) in graph_names
                if len(indices)==1 and (known or self.scopes[id(n)] in traversal_scopes and uses_neighbors):
                    self.role(n,name,'graph','정점의 이웃 목록을 순회하는 구문',3)
                    bindings={}
                    if isinstance(indices[0],ast.Name):bindings['current']=indices[0].id
                    neighbor_index=max(range(len(targets)),key=lambda i:index_names.count(targets[i].id) if isinstance(targets[i],ast.Name) else 0)
                    target=targets[neighbor_index]
                    if isinstance(target,ast.Name):bindings['neighbor']=target.id
                    entry=self.roles.setdefault(self.scopes[id(n)],{}).get(name)
                    if entry:
                        entry['bindings']=bindings
                        if len(targets)==2:entry['neighborIndex']=neighbor_index
                        entry['related'] = list(dict.fromkeys(root_access(x)[0] for b in n.body for x in ast.walk(b) if isinstance(x,ast.Subscript) and isinstance(x.slice,ast.Name) and isinstance(target,ast.Name) and x.slice.id==target.id and root_access(x)[0] not in (None,name)))[:3]
                    adjacency.append(n)
        queues=[]
        stacks=[]
        for (scope,name),ops in methods.items():
            front_pops=ops.get('popleft',[])+[c for c in ops.get('pop',[]) if len(c.args)==1 and isinstance(c.args[0],ast.Constant) and c.args[0].value==0]
            if front_pops:
                queues.extend(front_pops);self.role(front_pops[0],name,'queue','앞에서 꺼내는 FIFO 동작 (popleft 또는 pop(0))',5)
            elif 'append' in ops and 'pop' in ops and all(not c.args for c in ops['pop']):
                stacks.extend(ops['pop']);self.role(ops['pop'][0],name,'stack','append()와 인자 없는 pop()의 LIFO 동작',5)
        heaps=[c for c in calls if self.canonical(c.func) in ('heapq.heappush','heapq.heappop','heapq.heapify')]
        for c in heaps:
            if c.args and isinstance(c.args[0],ast.Name):self.role(c,c.args[0].id,'heap','heapq 연산이 이 컨테이너를 사용',7)
        dp=[];prefix=[];parents=[];frequencies=[];sorts=[];grid=[];relax=[];indeg=[]
        for n in assignments:
            targets=n.targets if isinstance(n,ast.Assign) else [n.target]
            reads=[x for x in ast.walk(n.value) if isinstance(x,ast.Subscript)]
            for t in targets:
                name,indices=root_access(t)
                if len(indices)>=2:grid.append(n);self.role(n,name,'grid','행과 열로 접근하는 중첩 인덱스',2)
                same=[x for x in reads if root_access(x)[0]==name] if name else []
                if same:
                    is_opt=any(isinstance(x,ast.Call) and dotted(x.func) in ('min','max') for x in ast.walk(n.value))
                    if len(same)>=2 or is_opt:
                        dp.append(n);self.role(n,name,'table','같은 테이블의 이전 상태를 참조하는 점화식',6)
                    elif len(indices)==1 and isinstance(n.value,ast.BinOp) and isinstance(n.value.op,ast.Add) and any(isinstance(x,ast.BinOp) and isinstance(x.op,ast.Sub) for read in same for x in root_access(read)[1]):
                        prefix.append(n);self.role(n,name,'prefix','이전 누적 값에 새 값을 더하는 식',5)
                if name and isinstance(n,ast.AugAssign) and isinstance(n.op,ast.Sub) and isinstance(n.value,ast.Constant) and n.value.value==1:
                    indeg.append(n)
                if name and any(isinstance(x,ast.Subscript) and root_access(x)[0]==name for idx in indices for x in ast.walk(idx)):
                    parents.append(n);self.role(n,name,'forest','부모의 부모를 참조하는 경로 압축 형태',8)
                if isinstance(t,(ast.Tuple,ast.List)):
                    roots=[root_access(x)[0] for x in t.elts]
                    if len(roots)==2 and roots[0] and roots[0]==roots[1] and isinstance(n.value,(ast.Tuple,ast.List)):
                        sorts.append(n);self.role(n,roots[0],'array','두 위치의 값을 교환하는 연산',3)
                if name and any(isinstance(x,ast.Call) and isinstance(x.func,ast.Attribute) and x.func.attr=='get' and dotted(x.func.value)==name for x in ast.walk(n.value)):
                    frequencies.append(n);self.role(n,name,'frequency','기존 키의 값을 읽어 갱신하는 매핑',3)
            # Nested subscript loads also identify grids when no writes occur.
        for n in nodes:
            if isinstance(n,ast.Subscript) and isinstance(n.value,ast.Subscript):
                name,idx=root_access(n)
                if len(idx)==2:self.role(n,name,'grid','두 인덱스로 접근하는 자료구조',2);grid.append(n)
            if isinstance(n,ast.If) and isinstance(n.test,ast.Compare):
                for x in ast.walk(n.test):
                    if isinstance(x,ast.Subscript):
                        name,_=root_access(x)
                        if heaps and any(isinstance(y,ast.Subscript) and isinstance(y.ctx,ast.Store) and root_access(y)[0]==name for b in n.body for y in ast.walk(b)):
                            relax.append(n);self.role(n,name,'distance','비교 후 더 나은 비용으로 갱신하는 배열',7)
        for fn in rec:
            for call in [c for c in ast.walk(fn) if isinstance(c,ast.Call) and dotted(c.func)==fn.name]:
                for arg in call.args:
                    if isinstance(arg,ast.Subscript):
                        name,idx=root_access(arg)
                        if len(idx)==1 and isinstance(idx[0],ast.Name) and any(isinstance(x,ast.Compare) and isinstance(x.left,ast.Subscript) and root_access(x.left)[0]==name for x in ast.walk(fn)):
                            parents.append(call);self.role(call,name,'forest','부모 배열을 따라 재귀 호출하는 find 형태',8)
                            # A parameter-free parent lookup commonly reads a module variable.
                            self.roles.setdefault('<module>',{}).setdefault(name,self.roles[self.scopes[id(call)]][name])
        # Read offsets infer pointers independently of variable spelling.
        binary=[];two=[];windows=[]
        for loop in [n for n in nodes if isinstance(n,ast.While)]:
            local=list(ast.walk(loop))
            for n in local:
                if isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name) and isinstance(n.value,ast.BinOp) and isinstance(n.value.op,ast.FloorDiv) and isinstance(n.value.right,ast.Constant) and n.value.right.value==2 and isinstance(n.value.left,ast.BinOp) and isinstance(n.value.left.op,ast.Add):
                    ends=[x.id for x in ast.walk(n.value.left) if isinstance(x,ast.Name)]
                    mid=n.targets[0].id
                    changed_ends=[a for a in local if isinstance(a,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ends for t in a.targets) and any(isinstance(x,ast.Name) and x.id==mid for x in ast.walk(a.value))]
                    if len(ends)==2 and changed_ends:
                        binary.append(n)
                        for x in local:
                            if isinstance(x,ast.Subscript) and isinstance(x.slice,ast.Name) and x.slice.id==mid:
                                name,_=root_access(x)
                                self.role(n,name,'interval','중간 인덱스로 조회하고 경계를 갱신하는 구문',8)
                                self.bounds.setdefault(self.scopes[id(n)],{})[name]={"left":ends[0],"right":ends[1],"mid":mid}
            if isinstance(loop.test,ast.Compare) and isinstance(loop.test.left,ast.Name) and len(loop.test.comparators)==1 and isinstance(loop.test.comparators[0],ast.Name):
                left,right=loop.test.left.id,loop.test.comparators[0].id
                accesses={}
                for n in local:
                    if isinstance(n,ast.Subscript) and isinstance(n.slice,ast.Name) and n.slice.id in (left,right):
                        name,_=root_access(n);accesses.setdefault(name,set()).add(n.slice.id)
                for name,indices in accesses.items():
                    if len(indices)==2 and not binary:
                        two.append(loop);self.role(loop,name,'interval','두 인덱스를 비교하면서 같은 배열을 조회',7)
                        self.bounds.setdefault(self.scopes[id(loop)],{})[name]={"left":left,"right":right}
        additions={};subtractions={}
        for n in assignments:
            if isinstance(n,ast.AugAssign) and isinstance(n.target,ast.Name):
                for x in ast.walk(n.value):
                    if isinstance(x,ast.Subscript):
                        name,idx=root_access(x)
                        if isinstance(n.op,ast.Add):additions[(n.target.id,name)]=n
                        if isinstance(n.op,ast.Sub):subtractions[(n.target.id,name)]=n
        for key in additions.keys() & subtractions.keys():
            n=additions[key];windows.append(n);self.role(n,key[1],'interval','같은 누적값에 배열 원소를 더하고 빼는 이동 구간',8)
        for c in calls:
            name=self.canonical(c.func).split('.')[-1]
            if name in ('sort','sorted'):
                sorts.append(c)
                if isinstance(c.func,ast.Attribute):self.role(c,dotted(c.func.value),'array','정렬 메서드가 사용하는 자료구조',3)
            if name=='Counter':
                frequencies.append(c)
            if isinstance(c.func,ast.Attribute) and c.func.attr=='append' and c.args and isinstance(c.args[0],ast.Name):
                acc=c.args[0].id
                if any(isinstance(a,ast.AugAssign) and isinstance(a.target,ast.Name) and a.target.id==acc and isinstance(a.op,ast.Add) for a in assignments) and not windows:
                    prefix.append(c);self.role(c,dotted(c.func.value),'prefix','누적 합을 순서대로 저장하는 배열',5)
        bits=[n for n in nodes if isinstance(n,ast.BinOp) and isinstance(n.op,(ast.BitAnd,ast.BitOr,ast.BitXor,ast.LShift,ast.RShift))]
        for n in assignments:
            if any(x in bits for x in ast.walk(n.value)):
                for t in (n.targets if isinstance(n,ast.Assign) else [n.target]):
                    if isinstance(t,ast.Name):self.role(n,t.id,'bits','비트 연산 결과를 저장하는 변수',6)
            if isinstance(n,ast.Assign) and isinstance(n.value,ast.Call) and self.canonical(n.value.func).split('.')[-1]=='Counter':
                for t in n.targets:
                    if isinstance(t,ast.Name):self.role(n,t.id,'frequency','Counter로 생성한 빈도 매핑',6)
        for loop in [n for n in nodes if isinstance(n,ast.For) and isinstance(n.target,ast.Name)]:
            if any(isinstance(x,ast.BinOp) and isinstance(x.op,ast.LShift) for x in ast.walk(loop.iter)):
                self.role(loop,loop.target.id,'bits','비트 이동으로 정한 범위의 마스크를 순회',6)
                widths=[x.right.id for x in ast.walk(loop.iter) if isinstance(x,ast.BinOp) and isinstance(x.op,ast.LShift) and isinstance(x.right,ast.Name)]
                if widths:self.roles[self.scopes[id(loop)]][loop.target.id]['widthVariable']=widths[0]
        # String values are recognized by runtime as well; KMP fallback links have a distinctive subscript recurrence.
        string_matching=[]
        for n in assignments:
            if isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name) and isinstance(n.value,ast.Subscript):
                name,idx=root_access(n.value);target=n.targets[0].id
                if idx and any(isinstance(x,ast.Name) and x.id==target for x in ast.walk(idx[0])) and isinstance(idx[0],ast.BinOp) and isinstance(idx[0].op,ast.Sub):
                    string_matching.append(n);self.role(n,name,'table','일치 길이를 줄이는 실패 함수 참조 패턴',6)
        self.candidate('dijkstra','힙 기반 최단경로',heaps+relax if heaps and relax else [],'힙 연산과 비용 비교·완화가 함께 나타납니다.',12)
        zero_enqueues=[]
        for decrease in indeg:
            target=ast.unparse(decrease.target)
            for condition in nodes:
                if not isinstance(condition,ast.If) or self.scopes[id(condition)]!=self.scopes[id(decrease)]:continue
                test=condition.test
                checks_zero=isinstance(test,ast.Compare) and len(test.ops)==1 and isinstance(test.ops[0],ast.Eq) and ast.unparse(test.left)==target and isinstance(test.comparators[0],ast.Constant) and test.comparators[0].value==0
                if checks_zero and any(isinstance(c,ast.Call) and isinstance(c.func,ast.Attribute) and c.func.attr=='append' and (self.scopes[id(c)],dotted(c.func.value)) in methods and 'popleft' in methods[(self.scopes[id(c)],dotted(c.func.value))] for b in condition.body for c in ast.walk(b)):
                    zero_enqueues.append(condition)
        self.candidate('topological','위상 정렬',queues+zero_enqueues if queues and zero_enqueues and adjacency else [],'차수를 줄인 뒤 0인지 검사하고 큐에 넣는 형태가 나타납니다.',12)
        self.candidate('union_find','유니온 파인드',parents,'부모 배열을 따라가거나 경로를 압축합니다.',12)
        self.candidate('binary_search','이진 탐색',binary,'중간값 계산과 탐색 경계 갱신을 찾았습니다.',11)
        self.candidate('sliding_window','슬라이딩 윈도우',windows,'같은 합에 원소를 더하고 빼며 구간을 이동합니다.',11)
        recursive_scopes={fn.name+'@'+str(fn.lineno) for fn in rec}
        recursive_stacks=[s for s in stacks if self.scopes[id(s)] in recursive_scopes]
        recursive_adjacency=[s for s in adjacency if self.scopes[id(s)] in recursive_scopes]
        self.candidate('backtracking','백트래킹',rec+recursive_stacks if recursive_stacks else [],'같은 재귀 함수에서 선택 추가·복구가 나타납니다.',10)
        bfs_scopes={self.scopes[id(q)] for q in queues}&{self.scopes[id(a)] for a in adjacency}
        self.candidate('bfs','너비 우선 탐색',[x for x in queues+adjacency if self.scopes[id(x)] in bfs_scopes],'같은 범위에서 FIFO 큐와 이웃 순회가 나타납니다.',9)
        self.candidate('dfs','깊이 우선 탐색',rec+recursive_adjacency if recursive_adjacency and not parents else [],'재귀 함수에서 이웃을 순회합니다.',9)
        self.candidate('grid_bfs','격자 너비 우선 탐색',queues+grid if queues and grid and not adjacency else [],'FIFO 큐와 행·열 좌표 접근이 함께 나타납니다.',10)
        self.candidate('dynamic_programming','동적 계획법',dp,'이전 상태를 참조하는 테이블 갱신식을 찾았습니다.',9)
        self.candidate('string_matching','문자열 매칭 · 실패 함수',string_matching if not parents else [],'이전 일치 길이로 되돌아가는 참조를 찾았습니다.',9)
        self.candidate('two_pointers','투 포인터',two,'두 경계 인덱스로 같은 배열을 조회합니다.',8)
        self.candidate('prefix_sum','누적 합',prefix,'이전 합 또는 누적값을 저장하는 연산을 찾았습니다.',8)
        self.candidate('sorting','정렬 · 교환',sorts,'정렬 호출 또는 같은 배열의 위치 교환이 있습니다.',5)
        self.candidate('heap','우선순위 큐 · 힙',heaps,'heapq 연산을 찾았습니다.',4)
        self.candidate('stack','스택',stacks,'뒤에 넣고 뒤에서 꺼내는 동작을 찾았습니다.',3)
        self.candidate('queue','큐',queues,'앞에서 꺼내는 FIFO 동작을 찾았습니다.',3)
        self.candidate('grid','격자 · 2차원 배열',grid,'행과 열을 사용하는 인덱스 접근이 있습니다.',2)
        self.candidate('frequency','키별 집계',frequencies,'키별 값 누적 또는 Counter 생성이 있습니다.',4)
        self.candidate('bitmask','비트 연산 · 비트마스크',bits,'AND/OR/XOR 또는 비트 이동을 찾았습니다.',4)
        self.candidate('recursion','재귀',rec,'함수가 자신을 다시 호출합니다.',1)
        self.candidates.sort(key=lambda c:-c['rank'])

    def public(self):
        return {"candidates":self.candidates,"roles":self.roles,"bounds":self.bounds,
                "note":"구문과 연산을 근거로 한 패턴 추정입니다. 알고리즘의 정당성이나 문제 의도를 증명하지 않습니다."}

    def observe(self,line,values):
        node=self.line_nodes.get(line)
        if node is None:return {"focus":[]}
        # Only inspect this statement's own expression, not unexecuted child statements.
        exprs=[]
        if isinstance(node,(ast.Assign,ast.AugAssign)):
            exprs=[node.value]+(node.targets if isinstance(node,ast.Assign) else [node.target])
        elif isinstance(node,(ast.If,ast.While)):exprs=[node.test]
        elif isinstance(node,ast.For):exprs=[node.iter]
        elif isinstance(node,(ast.Expr,ast.Return)) and node.value is not None:exprs=[node.value]
        result={"focus":[]}
        for expr in exprs:
            accesses,uncertain=planned_accesses(expr,values)
            for access in accesses:
                name,indices=root_access(access)
                resolved=[safe_value(i,values) for i in indices]
                if name and resolved and all(type(v) in (int,str) for v in resolved):
                    item={"variable":name,"indices":resolved,"kind":"write" if isinstance(access.ctx,ast.Store) else "read","expression":ast.unparse(access)}
                    if item not in result["focus"]:result["focus"].append(item)
            if uncertain:break
        result["focus"]=result["focus"][:12]
        if isinstance(node,(ast.If,ast.While)):
            value=safe_value(node.test,values)
            if type(value) is bool:result["condition"]={"expression":ast.unparse(node.test),"value":value}
        return result

    def runtime_roles(self, contexts):
        """Associate exact builtin container identities, without inspecting user objects."""
        shared_types=(list,tuple,dict,set,frozenset,deque,Counter,defaultdict)
        records=[]
        for key,scope,values in contexts:
            visible=[(n,v) for n,v in values.items() if not n.startswith('__')][:40]
            for name,obj in visible:
                direct=self.roles.get(scope,{}).get(name)
                if direct and type(obj) in shared_types:
                    cached=self.role_cache.get(id(obj))
                    if cached is None or cached[0] is not obj or direct['priority']>=cached[1]['priority']:
                        transferable={k:v for k,v in direct.items() if k not in ('bindings','related')}
                        self.role_cache[id(obj)]=(obj,transferable,name)
                records.append((key,scope,name,obj,direct))
        # Keep references to prevent object-id reuse; bound retained metadata and objects.
        while len(self.role_cache)>64:
            del self.role_cache[next(iter(self.role_cache))]
        resolved={key:{} for key,_,_ in contexts}
        for key,scope,name,obj,direct in records:
            cached=self.role_cache.get(id(obj)) if type(obj) in shared_types else None
            inherited=cached[1] if cached and cached[0] is obj else None
            if direct and (inherited is None or direct['priority']>=inherited['priority']):
                role={**direct,'origin':'code'}
            elif inherited:
                role={**inherited,'origin':'shared','reason':inherited['reason']+' · '+cached[2]+'와 같은 자료구조를 참조'}
            else:
                continue
            if type(obj) in shared_types:
                role['aliases']=[other for k,_,other,value,_ in records if k==key and other!=name and value is obj][:8]
            resolved[key][name]=role
        return resolved
