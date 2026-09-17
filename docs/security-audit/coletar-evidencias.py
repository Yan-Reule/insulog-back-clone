"""Inventário reproduzível de rotas, arquivos e busca de segredos no Git local.
Não abre rede, não lê credenciais do ambiente e não exibe valores candidatos.
"""
import csv
import hashlib
import json
import pathlib
import re
import subprocess

OUT = pathlib.Path(__file__).resolve().parent
ROOT = OUT.parent.parent
FRONT = ROOT.parent / 'insulog-mobile-front-clone'

def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args])

def functions(file):
    text = file.read_text()
    matches = list(re.finditer(r'^(?:async )?function (\w+)\([^\n]*', text, re.M))
    result = {}
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        block = text[m.start():end].split('\nmodule.exports')[0].rstrip()
        result[m[1]] = (text[:m.start()].count('\n') + 1, block)
    return result

rows = [dict(method='GET', route='/', route_file='src/app.js:90', controller='inline:90-94', service='—', repository='—', result='Público intencional; mensagem de saúde da API; sem dados de usuário.')]
app = (ROOT / 'src/app.js').read_text()
prefixes = dict((name, prefix) for prefix, name in re.findall(r"app.use\('([^']+)', (\w+)\)", app))
for f in sorted((ROOT / 'src/routes').glob('*.js')):
    prefix = prefixes.get(f.stem, '')
    for num, line in enumerate(f.read_text().splitlines(), 1):
        m = re.search(r"router\.(get|post|put|delete)\('([^']+)', (\w+)\.(\w+)\)", line)
        if not m:
            continue
        method, route, controller, handler = m.groups()
        cp = ROOT / 'src/controllers' / (controller + '.js')
        cl, block = functions(cp)[handler]
        service_refs, repo_refs = [], []
        for service, fn in re.findall(r'(\w+Service)\.(\w+)\(', block):
            sp = ROOT / 'src/services' / (service + '.js')
            sf = functions(sp)
            sl, sb = sf[fn]
            service_refs.append(f'{sp.relative_to(ROOT)}:{sl} ({fn})')
            # Reach intra-service helpers as well (e.g. normalization).
            todo, seen = [sb], set()
            while todo:
                b = todo.pop()
                for repo, rf in re.findall(r'(\w+Repository)\.(\w+)\(', b):
                    rp = ROOT / 'src/repositories' / (repo + '.js')
                    rl = functions(rp)[rf][0]
                    repo_refs.append(f'{rp.relative_to(ROOT)}:{rl} ({rf})')
                for local in re.findall(r'\b(\w+)\(', b):
                    if local in sf and local not in seen:
                        seen.add(local)
                        todo.append(sf[local][1])
        full = (prefix.rstrip('/') + '/' + route.lstrip('/')).rstrip('/') or '/'
        result = 'Sem autenticação e sem autorização/posse; '
        if f.stem == 'authRoutes':
            result = 'Público intencional; verifica senha; não emite token/sessão.'
        elif handler == 'showByType':
            result = 'Sombreado por GET /usuarios/:id; inspecionado, não alcançável no roteamento atual.'
        elif f.stem in ['periodoRoutes', 'typeInsuRoutes']:
            result = 'Leitura de catálogo global; sem dado privado identificado.' if method == 'get' else result + 'A05.'
        elif f.stem == 'userRoutes':
            result += 'A01.' if handler == 'index' else 'A06.' if handler == 'create' else 'A02/A06.' if handler == 'update' else 'A02.'
        elif handler == 'index':
            result += 'listagem global A01.'
        elif handler == 'gerarRelatorio':
            result += 'ID da query controla exportação A04.'
        else:
            result += 'ID do path/query/body controla dados A03.'
        rows.append(dict(method=method.upper(), route=full, route_file=f'{f.relative_to(ROOT)}:{num}', controller=f'{cp.relative_to(ROOT)}:{cl} ({handler})', service='; '.join(service_refs), repository='; '.join(sorted(set(repo_refs))), result=result))
with (OUT / 'cobertura-rotas.csv').open('w') as stream:
    writer = csv.DictWriter(stream, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

pattern = re.compile(r'(?i)(\b(?:password|passwd|senha|secret|api[_-]?key|access[_-]?token|private[_-]?key)\b|DB_(?:HOST|USER|PASSWORD)|BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20}|\$\{[^}]*:-|(?:mysql|postgres|mongodb)(?:\+srv)?://)')
repos, inventory = [], []
for root in [ROOT, FRONT]:
    commits = git(root, 'rev-list', '--all').decode().splitlines()
    seen, candidates = set(), []
    for commit in commits:
        for entry in git(root, 'ls-tree', '-r', commit).decode().splitlines():
            meta, file = entry.split('\t', 1)
            _, kind, oid = meta.split()
            if kind != 'blob' or oid in seen:
                continue
            seen.add(oid)
            data = git(root, 'cat-file', 'blob', oid)
            if b'\0' in data:
                continue
            for line, content in enumerate(data.decode('utf8', 'replace').splitlines(), 1):
                if pattern.search(content):
                    candidates.append(dict(commit=commit, file=file, line=line, third_party=file.startswith('node_modules/')))
    artifacts = [str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() and ('build' in p.parts) and p.suffix in ['.apk', '.aab', '.ipa', '.wasm', '.js']]
    repos.append(dict(name=root.name, head=git(root, 'rev-parse', 'HEAD').decode().strip(), commits=len(commits), unique_blobs=len(seen), shallow=git(root, 'rev-parse', '--is-shallow-repository').decode().strip(), candidates=candidates, build_artifacts=artifacts))
    for file in git(root, 'ls-files').decode().splitlines():
        p = root / file
        if not p.is_file() or file.startswith('node_modules/'):
            continue
        data = p.read_bytes()
        inventory.append(dict(repo=root.name, file=file, sha256=hashlib.sha256(data).hexdigest(), lines=None if b'\0' in data else len(data.splitlines())))
(OUT / 'inventario-e-varredura.json').write_text(json.dumps(dict(repositories=repos, files=inventory, route_count=len(rows), note='Candidatos são referências para triagem, não achados. Nenhum valor de segredo é persistido. Escopo histórico: commits alcançáveis nas refs locais; sem reflogs/objetos órfãos/servidores remotos.'), ensure_ascii=False, indent=2) + '\n')
print(json.dumps(dict(routes=len(rows), repositories=[{k: v for k, v in repo.items() if k != 'candidates'} for repo in repos], files=len(inventory)), ensure_ascii=False, indent=2))
