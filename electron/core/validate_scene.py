"""Defense in depth: refuses to run anything except the narrow Manim program ManimBlocks generates.
Usage: python - <scene.py>   (this script is passed on stdin)"""
import ast, sys

COLORS = "WHITE RED GREEN BLUE YELLOW ORANGE PURPLE PINK TEAL GOLD GRAY BLACK".split()
GLOBALS = set(COLORS) | set("""Text MathTex Circle Square Rectangle Triangle Line Dot Arrow NumberPlane Write Create FadeIn FadeOut
GrowFromCenter ShrinkToCenter Rotate Transform Indicate Circumscribe RIGHT UP DEGREES range int config MovingCameraScene""".split())
ATTRS = set("play wait add animate move_to shift scale set_color set_opacity set_stroke set_fill camera frame set frame_width frame_rate".split())
KWARGS = set("color radius side_length width height point angle run_time opacity disable_ligatures".split())
errors = []

def bad(node, msg):
    errors.append(f"line {getattr(node, 'lineno', '?')}: {msg}")

def locals_of(fn):
    names = {"self", "_rt", "_"}
    for n in ast.walk(fn):
        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store):
            if n.id in GLOBALS or n.id == "self" or (n.id.startswith("_") and n.id not in ("_", "_rt")):
                bad(n, f"name '{n.id}' is not allowed")
            names.add(n.id)
    return names

def expr(n, names):
    if isinstance(n, ast.Constant):
        if not isinstance(n.value, (int, float, str)):
            bad(n, "unsupported constant")
    elif isinstance(n, ast.Name):
        if n.id not in names and n.id not in GLOBALS:
            bad(n, f"unknown name '{n.id}'")
    elif isinstance(n, ast.BinOp):
        if not isinstance(n.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod)): bad(n, "operator not allowed")
        expr(n.left, names); expr(n.right, names)
    elif isinstance(n, ast.UnaryOp):
        if not isinstance(n.op, (ast.USub, ast.UAdd)): bad(n, "operator not allowed")
        expr(n.operand, names)
    elif isinstance(n, ast.Compare):
        if not all(isinstance(o, (ast.Lt, ast.Gt, ast.Eq, ast.NotEq, ast.LtE, ast.GtE)) for o in n.ops): bad(n, "comparison not allowed")
        expr(n.left, names)
        for c in n.comparators: expr(c, names)
    elif isinstance(n, ast.Subscript):
        # Only name[a:b] with plain whole numbers: a part of a text object.
        sl = n.slice
        ok = isinstance(n.value, ast.Name) and n.value.id in names and n.value.id not in GLOBALS and n.value.id not in ("self", "_rt", "_") and isinstance(sl, ast.Slice) and sl.step is None \
            and all(isinstance(x, ast.Constant) and type(x.value) is int and x.value >= 0 for x in (sl.lower, sl.upper))
        if not ok: bad(n, "only name[number:number] is allowed")
        else: expr(n.value, names)
    elif isinstance(n, ast.Attribute):
        if n.attr not in ATTRS: bad(n, f"attribute '{n.attr}' is not allowed")
        expr(n.value, names)
    elif isinstance(n, ast.Call):
        if isinstance(n.func, ast.Name):
            if n.func.id not in GLOBALS or n.func.id in COLORS: bad(n, f"call to '{n.func.id}' is not allowed")
        elif isinstance(n.func, ast.Attribute):
            expr(n.func, names)
        else:
            bad(n, "this kind of call is not allowed")
        for a in n.args: expr(a, names)
        for k in n.keywords:
            if k.arg not in KWARGS: bad(n, f"argument '{k.arg}' is not allowed")
            expr(k.value, names)
    else:
        bad(n, f"{type(n).__name__} is not allowed")

def stmts(body, names):
    for s in body:
        if isinstance(s, ast.Pass): continue
        elif isinstance(s, ast.Assign):
            if len(s.targets) != 1 or not isinstance(s.targets[0], ast.Name): bad(s, "only simple assignments are allowed")
            expr(s.value, names)
        elif isinstance(s, ast.AugAssign):
            if not isinstance(s.target, ast.Name) or not isinstance(s.op, ast.Add): bad(s, "only += is allowed")
            expr(s.value, names)
        elif isinstance(s, ast.Expr):
            if not isinstance(s.value, ast.Call): bad(s, "only calls are allowed as statements")
            expr(s.value, names)
        elif isinstance(s, ast.For):
            if not isinstance(s.target, ast.Name) or s.orelse: bad(s, "unsupported loop")
            if not (isinstance(s.iter, ast.Call) and isinstance(s.iter.func, ast.Name) and s.iter.func.id == "range"): bad(s, "loops must use range()")
            expr(s.iter, names); stmts(s.body, names)
        elif isinstance(s, ast.If):
            expr(s.test, names); stmts(s.body, names); stmts(s.orelse, names)
        else:
            bad(s, f"{type(s).__name__} is not allowed")

def main(path):
    tree = ast.parse(open(path, encoding="utf-8").read())
    seen_class = False
    for i, s in enumerate(tree.body):
        if i == 0 and isinstance(s, ast.ImportFrom) and s.module == "manim" and s.level == 0 and [a.name for a in s.names] == ["*"]: continue
        if isinstance(s, ast.Assign) and len(s.targets) == 1 and isinstance(s.targets[0], ast.Attribute) \
           and isinstance(s.targets[0].value, ast.Name) and s.targets[0].value.id == "config" and s.targets[0].attr == "frame_rate" \
           and isinstance(s.value, ast.Constant) and isinstance(s.value.value, int): continue
        if isinstance(s, ast.ClassDef) and not seen_class and s.name == "GeneratedScene" and not s.decorator_list and not s.keywords \
           and [getattr(b, "id", None) for b in s.bases] == ["MovingCameraScene"] and len(s.body) == 1:
            fn = s.body[0]
            if isinstance(fn, ast.FunctionDef) and fn.name == "construct" and not fn.decorator_list and [a.arg for a in fn.args.args] == ["self"] \
               and not (fn.args.vararg or fn.args.kwarg or fn.args.kwonlyargs or fn.args.defaults):
                seen_class = True
                stmts(fn.body, locals_of(fn)); continue
        bad(s, "this top-level code is not allowed")
    if not seen_class: errors.append("no valid GeneratedScene class found")

try:
    main(sys.argv[1])
except SyntaxError as e:
    errors.append(f"syntax error: {e}")
if errors:
    print("\n".join(errors[:8])); sys.exit(1)
print("OK")
