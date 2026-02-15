import re

def rename_in_function(code, func_name, var_map):
    pattern = rf'function {func_name}\s*\((.*?)\)\s*\{{(.*?)\n\}}'

    def repl(match):
        args = match.group(1)
        body = match.group(2)

        # Rename in args
        for old, new in var_map.items():
            args = re.sub(rf'\b{old}\b', new, args)

        # Rename in body
        for old, new in var_map.items():
            body = re.sub(rf'\b{old}\b', new, body)

        return f'function {func_name}({args}) {{{body}\n}}'

    # This simple regex might fail with nested braces.
    # Let's use a more robust one for the body that matches balanced braces.

    # Balanced braces regex is hard in re. Let's use a simpler approach:
    # Find the start of the function and then find the matching closing brace.

    start_match = re.search(rf'function {func_name}\s*\((.*?)\)\s*\{{', code)
    if not start_match:
        return code

    start_idx = start_match.end()
    brace_count = 1
    end_idx = start_idx
    while brace_count > 0 and end_idx < len(code):
        if code[end_idx] == '{':
            brace_count += 1
        elif code[end_idx] == '}':
            brace_count -= 1
        end_idx += 1

    if brace_count == 0:
        func_body = code[start_idx:end_idx-1]
        args = start_match.group(1)

        for old, new in var_map.items():
            args = re.sub(rf'\b{old}\b', new, args)
            func_body = re.sub(rf'\b{old}\b', new, func_body)

        new_func = f'function {func_name}({args}) {{{func_body}}}'
        return code[:start_match.start()] + new_func + code[end_idx:]

    return code

with open('grid-combat/grid-combat.js', 'r') as f:
    js = f.read()

# Rename resolveCombat
js = rename_in_function(js, 'resolveCombat', {
    't': 'attacker',
    'e': 'defender',
    'n': 'attackerData',
    'a': 'defenderData',
    'i': 'baseDamage',
    'r': 'terrainTile',
    'o': 'defenseMod',
    's': 'attackerHpRatio',
    'y': 'damageDealt',
    'c': 'combatLog',
    'm': 'dist'
})

# Rename getMovableTiles
js = rename_in_function(js, 'getMovableTiles', {
    't': 'unit',
    'e': 'allowFriendlyPass',
    'n': 'tiles',
    'a': 'visited',
    'i': 'queue',
    'r': 'current',
    'o': 'neighbors',
    's': 'neighbor',
    'y': 'terrain',
    'c': 'moveCost',
    'm': 'blockingUnit',
    'l': 'totalCost'
})

# Rename runAITurn - this one has a nested function t()
# Let's just do it manually or via a string replace of the whole function if it's too complex.
# Actually, let's just do the top level of runAITurn.

js = rename_in_function(js, 'runAITurn', {
    't': 'availableUnits',
    'e': 'rangedUnits',
    'n': 'capturingUnits',
    'a': 'otherUnits',
    'i': 'unitQueue'
})

with open('grid-combat/grid-combat.js', 'w') as f:
    f.write(js)
