import re

with open('src/engines/geometry.ts', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace mark(buildSlotSinkRectPart(detail, name, w, h, parent), x, y, aliases)
# with markRect(name, w, h, parent, x, y, aliases)
pattern1 = r'mark\(\s*buildSlotSinkRectPart\(\s*detail,\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\s*\),\s*([^,]+),\s*([^,]+)(?:,\s*({[^}]+}))?\s*\)'

def repl1(m):
    name, w, h, parent, x, y, aliases = m.groups()
    if aliases:
        return f'markRect({name}, {w}, {h}, {parent}, {x}, {y}, {aliases})'
    else:
        return f'markRect({name}, {w}, {h}, {parent}, {x}, {y})'

code = re.sub(pattern1, repl1, code)

# Replace mark(buildAllowanceLPart(detail, name, w, h, innerW, innerH, orient, parent), x, y, aliases)
# with markL(name, w, h, innerW, innerH, orient, parent, x, y, aliases)
pattern2 = r'mark\(\s*buildAllowanceLPart\(\s*detail,\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\s*\),\s*([^,]+),\s*([^,]+)(?:,\s*({[^}]+}))?\s*\)'

def repl2(m):
    name, w, h, innerW, innerH, orient, parent, x, y, aliases = m.groups()
    if aliases:
        return f'markL({name}, {w}, {h}, {innerW}, {innerH}, {orient}, {parent}, {x}, {y}, {aliases})'
    else:
        return f'markL({name}, {w}, {h}, {innerW}, {innerH}, {orient}, {parent}, {x}, {y})'

code = re.sub(pattern2, repl2, code)

with open('src/engines/geometry.ts', 'w', encoding='utf-8') as f:
    f.write(code)

print("Fixed geometry.ts")
