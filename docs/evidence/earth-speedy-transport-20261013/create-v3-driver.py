from pathlib import Path
root=Path('docs/evidence/earth-speedy-transport-20261013')
sources={
    'run-v3.jl': ('run-v2.jl',[('include("transport-v2-model.jl")','include("transport-v3-model.jl")')]),
    'audit-v3-candidate.jl': ('audit-v2-candidate.jl',[('include("transport-v2-model.jl")','include("transport-v3-model.jl")')]),
    'run-v3-julia.mjs': ('run-v2-julia.mjs',[
        ('`${folder}/v2-protocol.md`,`${folder}/run-v2-julia.mjs`','`${folder}/v2-protocol.md`,`${folder}/v3-protocol.md`,`${folder}/run-v3-julia.mjs`')])
}
for name,(source,replacements) in sources.items():
    path=root/name
    if path.exists(): raise RuntimeError(f'Refusing to overwrite {path}')
    text=(root/source).read_text(encoding='utf8')
    for old,new in replacements:
        if text.count(old)!=1: raise RuntimeError(f'Expected single match: {old}')
        text=text.replace(old,new)
    path.write_text(text,encoding='utf8',newline='\n')
    print(path)
