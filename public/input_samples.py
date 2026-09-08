"""Static input planner. Never executes user code or evaluates arbitrary calls."""
import ast

class UnsupportedInput(Exception):
    pass

def call_name(node):
    if isinstance(node, ast.Name): return node.id
    if isinstance(node, ast.Attribute):
        return call_name(node.value) + "." + node.attr
    return ""

def input_aliases(tree):
    aliases = {"input", "sys.stdin.readline", "sys.stdin.read", "sys.stdin.buffer.readline", "sys.stdin.buffer.read"}
    for node in ast.walk(tree):
        if isinstance(node,ast.ImportFrom) and node.module=='sys':
            for imported in node.names:
                if imported.name=='stdin':
                    name=imported.asname or 'stdin'
                    aliases.update(name+suffix for suffix in ('.readline','.read','.buffer.readline','.buffer.read'))
        if isinstance(node, ast.Assign) and call_name(node.value) in aliases:
            aliases.update(t.id for t in node.targets if isinstance(t, ast.Name))
    return aliases

def bulk_aliases(tree):
    aliases = {name for name in input_aliases(tree) if name.endswith('.read')}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and call_name(node.value) in aliases:
            aliases.update(t.id for t in node.targets if isinstance(t, ast.Name))
    return aliases

def line_read(node, aliases):
    if isinstance(node, ast.Call):
        if call_name(node.func) in aliases: return True
        if isinstance(node.func, ast.Attribute) and node.func.attr in ('strip', 'rstrip') and not node.args:
            return line_read(node.func.value, aliases)
    return False

def has_input(node, aliases):
    return any(isinstance(x, ast.Call) and call_name(x.func) in aliases for x in ast.walk(node))

class Planner:
    def __init__(self, tree, small=False):
        self.tree, self.small = tree, small
        self.aliases = input_aliases(tree)
        self.env, self.lines, self.schema = {}, [], []
        self.tick, self.edge = 0, 0
        self.count_vars = {n.id for x in ast.walk(tree) if isinstance(x,ast.Call) and call_name(x.func)=='range' for a in x.args for n in ast.walk(a) if isinstance(n,ast.Name)}
        self.graph = any(isinstance(x, ast.Subscript) and isinstance(x.ctx, ast.Load)
                         and isinstance(x.value, ast.Name) and
                         any(isinstance(y, ast.Call) and isinstance(y.func, ast.Attribute)
                             and isinstance(y.func.value, ast.Subscript)
                             and isinstance(y.func.value.value, ast.Name)
                             and y.func.value.value.id == x.value.id and y.func.attr == "append"
                             for y in ast.walk(tree)) for x in ast.walk(tree))
        def plus_one(x):return isinstance(x,ast.BinOp) and isinstance(x.op,ast.Add) and isinstance(x.right,ast.Constant) and x.right.value==1
        self.one_based = any((isinstance(x,ast.Call) and call_name(x.func)=='range' and any(plus_one(a) for a in x.args)) or (isinstance(x,ast.BinOp) and isinstance(x.op,ast.Mult) and plus_one(x.right)) for x in ast.walk(tree))
        self.sorted_needed = any(isinstance(x, ast.BinOp) and isinstance(x.op, ast.FloorDiv)
                                 and isinstance(x.right, ast.Constant) and x.right.value == 2
                                 for x in ast.walk(tree))
        letters=[]
        for x in ast.walk(tree):
            tests=[x.left]+x.comparators if isinstance(x,ast.Compare) else []
            for item in tests:
                if isinstance(item,ast.Constant) and isinstance(item.value,str) and 1<=len(item.value)<=4 and not any(c.isspace() for c in item.value):
                    letters.extend(item.value)
        self.alphabet=''.join(dict.fromkeys(letters))

    def size(self, name):
        if name.lower() in ("t", "tc", "tests", "test_cases"): return 1 if self.small else 2
        if name.lower() in ("m", "cols", "columns", "w", "width"): return 1 if self.small else (5 if self.graph else 4)
        if name.lower() in ("k", "target"): return 1 if self.small else 3
        return 1 if self.small else 5

    def number(self, index):
        return ([3, 1, 4, 1, 5, 2, 6, 2][index % 8] if not self.small else 1)

    def read(self, kind, names, width=None, node=None):
        if len(self.lines) >= 60: raise UnsupportedInput("샘플 입력이 60줄을 넘습니다.")
        if kind == "scalar":
            value = self.size(names[0] if names else "n")
            text = str(value)
        elif kind == "string":
            length = width or next((self.env[k] for k in ("n","length","size") if type(self.env.get(k)) is int), 1 if self.small else 7)
            length = max(1, min(length, 12))
            alphabet=self.alphabet or 'abacaba'
            if set(alphabet)<=set('()'): alphabet='()'
            elif set(alphabet)<=set('01'): alphabet='01'
            text = (alphabet * (length+1))[:length]
            value = text
        else:
            width = width or (len(names) if len(names)>1 else None) or next((self.env[k] for k in ["n","size","length"]+sorted(self.count_vars) if type(self.env.get(k)) is int), 1 if self.small else 5)
            if not 1 <= width <= 15: raise UnsupportedInput("입력 한 줄의 길이를 작게 확정할 수 없습니다.")
            is_header = len(names) > 1 and (not self.lines or all(n in self.count_vars for n in names))
            if is_header:
                values = [self.size(k) for k in names]
                if self.graph and len(values)>=2: values[1] = 0 if self.small else 5
            elif self.graph and 2 <= width <= 3 and len(names) == width:
                n = next((self.env[k] for k in ("n","v","vertices") if type(self.env.get(k)) is int), 5)
                offset = 1 if self.one_based else 0
                pairs = [(0,1),(0,2),(1,3),(2,3),(3,4)]
                a,b = pairs[self.edge % len(pairs)]
                values = [a % n + offset, b % n + offset]
                if width == 3: values.append([2,5,1,3,2][self.edge % 5])
                self.edge += 1
            else:
                values = [self.number(i) for i in range(width)]
                if self.sorted_needed: values.sort()
            text = " ".join(map(str, values))
            value = values
        self.lines.append(text)
        if node is not None:
            signature = {"line": node.lineno, "targets": names, "kind": kind}
            if signature not in self.schema: self.schema.append(signature)
        return value

    def evaluate(self, node, names=None, width=None):
        self.tick += 1
        if self.tick > 1800: raise UnsupportedInput("입력 구조가 복잡하여 자동 생성을 보류합니다.")
        names = names or []
        if isinstance(node, ast.Constant) and type(node.value) in (int,str,bool,type(None)):
            return node.value
        if isinstance(node, ast.Name):
            if node.id in self.env: return self.env[node.id]
            raise UnsupportedInput("입력 개수에 쓰인 " + node.id + " 값을 확인해야 합니다.")
        if isinstance(node, (ast.Tuple, ast.List)):
            return [self.evaluate(x) for x in node.elts]
        if isinstance(node, ast.BinOp):
            a,b=self.evaluate(node.left),self.evaluate(node.right)
            if type(a) is not int or type(b) is not int: raise UnsupportedInput("입력 크기 계산이 지원 범위를 벗어납니다.")
            if isinstance(node.op, ast.Add): return a+b
            if isinstance(node.op, ast.Sub): return a-b
            if isinstance(node.op, ast.Mult) and abs(a*b)<1000: return a*b
            if isinstance(node.op, ast.FloorDiv) and b: return a//b
            raise UnsupportedInput("입력 크기 계산을 확인해주세요.")
        if isinstance(node, ast.Call):
            fn = call_name(node.func)
            if fn in ("int","float") and len(node.args)==1 and line_read(node.args[0],self.aliases):
                return self.read("scalar",names,node=node)
            if fn in ("list","tuple") and node.args:
                return self.evaluate(node.args[0],names,width)
            if fn == "map" and len(node.args)==2 and call_name(node.args[0]) in ("int","float") and isinstance(node.args[1],ast.Call) and isinstance(node.args[1].func,ast.Attribute) and node.args[1].func.attr=='split' and not node.args[1].args and line_read(node.args[1].func.value,self.aliases):
                return self.read("numbers",names,width,node)
            if fn in self.aliases:
                if fn.endswith(".read"): raise UnsupportedInput("전체 입력을 한 번에 읽는 코드는 토큰 구조를 확인해야 합니다.")
                return self.read("string",names,width,node=node)
            if isinstance(node.func,ast.Attribute) and node.func.attr in ("strip","rstrip"):
                return self.evaluate(node.func.value,names,width)
            if fn == "range":
                args=[self.evaluate(a) for a in node.args]
                r=range(*args)
                if len(r)>15: raise UnsupportedInput("반복 입력 수가 너무 큽니다.")
                return list(r)
            if fn == "len" and len(node.args)==1:
                return len(self.evaluate(node.args[0]))
            raise UnsupportedInput("함수 호출로 구성된 입력 형식은 자동 생성하지 않습니다.")
        if isinstance(node,ast.ListComp):
            if len(node.generators)!=1 or node.generators[0].ifs: raise UnsupportedInput("조건이 붙은 입력 반복은 직접 확인해주세요.")
            gen=node.generators[0]
            results=[]
            cols=next((self.env[k] for k in ("m","cols","columns","width") if type(self.env.get(k)) is int),width)
            for v in self.evaluate(gen.iter):
                self.assign(gen.target,v)
                results.append(self.evaluate(node.elt,names,cols))
            return results
        raise UnsupportedInput("지원되지 않는 입력 표현식이 있습니다.")

    def assign(self,target,value):
        if isinstance(target,ast.Name): self.env[target.id]=value
        elif isinstance(target,(ast.Tuple,ast.List)):
            if not isinstance(value,list) or len(value)!=len(target.elts): raise UnsupportedInput("한 줄에서 나눠 받는 값의 개수를 확인해주세요.")
            for t,v in zip(target.elts,value): self.assign(t,v)
        else: raise UnsupportedInput("자료구조 위치에 직접 입력하는 코드는 확인이 필요합니다.")

    def statements(self,nodes):
        for node in nodes:
            if isinstance(node,(ast.Import,ast.ImportFrom)): continue
            if isinstance(node,ast.Assign):
                if len(node.targets)!=1 and has_input(node,self.aliases): raise UnsupportedInput("연쇄 입력 대입은 직접 확인해주세요.")
                names=[x.id for x in ast.walk(node.targets[0]) if isinstance(x,ast.Name)]
                if has_input(node.value,self.aliases):
                    # Only assignment/comprehension read patterns are supported.
                    self.assign(node.targets[0],self.evaluate(node.value,names,len(names) if len(names)>1 else None))
                else:
                    try: self.assign(node.targets[0],self.evaluate(node.value,names))
                    except UnsupportedInput: pass
            elif isinstance(node,ast.For) and any(has_input(x,self.aliases) for x in node.body):
                for v in self.evaluate(node.iter):
                    self.assign(node.target,v)
                    self.statements(node.body)
                if any(has_input(x,self.aliases) for x in node.orelse):
                    raise UnsupportedInput("for-else의 입력은 직접 확인해주세요.")
            elif has_input(node,self.aliases):
                raise UnsupportedInput("조건문·함수·while 또는 직접 소비하는 입력은 문제 조건을 확인한 후 작성해주세요.")

def suggest_inputs(source):
    if len(source)>30000:
        return {"status":"unsupported","samples":[],"reason":"코드가 너무 커서 입력 분석을 보류합니다.","schema":[]}
    try: tree=ast.parse(source)
    except SyntaxError as e:
        return {"status":"invalid","samples":[],"reason":"먼저 "+str(e.lineno)+"번째 줄의 문법을 확인해주세요.","schema":[]}
    if len(list(ast.walk(tree)))>8000:
        return {"status":"unsupported","samples":[],"reason":"코드가 너무 커서 입력 분석을 보류합니다.","schema":[]}
    if not has_input(tree,input_aliases(tree)):
        return {"status":"none","samples":[],"reason":"표준 입력을 읽는 구문을 찾지 못했습니다.","schema":[]}
    if has_input(tree,bulk_aliases(tree)):
        return {"status":"unsupported","samples":[],"reason":"전체 입력을 한 번에 읽는 코드는 토큰 구조를 확인해야 합니다.","schema":[]}
    candidates=[]
    try:
        for small in (False,True):
            planner=Planner(tree,small)
            planner.statements(tree.body)
            text="\n".join(planner.lines)
            if text and all(s["stdin"]!=text for s in candidates):
                candidates.append({"label":"작은 크기" if small else "기본 흐름","stdin":text,
                                   "reason":"입력 읽기 순서와 반복 횟수에서 구성한 후보입니다. 문제의 값 범위·정렬 여부·특수 조건은 확인해주세요.",
                                   "verified":False})
        return {"status":"inferred","samples":candidates,"schema":planner.schema,
                "reason":"정적 분석으로 제안한 입력입니다. 정답·문제 제약을 보장하지 않으며 자동 실행하지 않습니다."}
    except (UnsupportedInput,ValueError,TypeError,ZeroDivisionError,OverflowError) as e:
        return {"status":"unsupported","samples":[],"schema":[],"reason":str(e)}
