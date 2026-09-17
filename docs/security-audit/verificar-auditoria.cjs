// Reproduções locais: banco inteiramente simulado; nenhuma conexão MySQL.
// Executar: node docs/security-audit/verificar-auditoria.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { once } = require('node:events')
const util = require('node:util')
const root = path.resolve(__dirname, '../..')
const calls = [], logs = [], results = []
const originalLog = console.log
console.log = (...args) => logs.push(util.format(...args))
const passwords = require('../../src/services/passwordService')
let secret = passwords.hashPassword('synthetic-original-password')
const row = {
  id_usuario: 19, nome: 'Paciente fictício', email: 'audit@example.invalid',
  tipo_login: 'email', tipo_usuario: 'paciente',
  id_registro: 1004, nivel_glicose: 100, data_hora: '2026-08-01 12:00:00',
  id_periodo: 1, periodo: 'Manhã', periodo_descricao: 'Manhã', observacao: 'Dado fictício',
  id_registro_insulina: 22, id_tipo_insulina: 1, unidade_insulina: 2, tipo_insulina: 'Teste',
  id_alarme: 23, dias_semana: 'SEG', ativo: 1, tem_som: 1, tem_vibracao: 1,
  id_configuracao: 24, idioma: 'pt', tema: 'claro', notificacoes: 1,
  id_exportacao: 25, data: '2026-08-01', descricao: 'Teste'
}
async function execute(sql, params = []) {
  calls.push({ sql, params })
  if (/UPDATE usuario SET/.test(sql)) secret = params[2]
  if (/SELECT/.test(sql)) {
    if (/WHERE email = \?$/.test(sql)) return [[]]
    return [[{ ...row, senha: secret }]]
  }
  return [{ insertId: 1004, affectedRows: 1 }]
}
const connection = { execute, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} }
const config = require.resolve('../../src/config/database')
require.cache[config] = { id: config, filename: config, loaded: true, exports: { pool: { execute, getConnection: async () => connection } } }
const app = require('../../src/app')
async function main() {
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  async function request(method, url, body, expected = 200) {
    const before = calls.length
    const response = await fetch(base + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
    const bytes = Buffer.from(await response.arrayBuffer())
    assert.equal(response.status, expected, `${method} ${url}: ${bytes}`)
    results.push({ method, url, status: response.status, authentication: 'nenhuma', sqlCalls: calls.length - before })
    return response.headers.get('content-type')?.includes('json') ? JSON.parse(bytes.toString()) : bytes
  }
  try {
    await request('GET', '/')
    const users = await request('GET', '/usuarios')
    assert.equal(users[0].senha, secret, 'A listagem serializa o hash de senha')
    await request('GET', '/usuarios/19')
    const userBody = { nome: row.nome, email: row.email, senha: 'synthetic-replaced-password', tipo_login: 'email', tipo_usuario: 'medico', crm: 'TESTE', id_medico: 16 }
    await request('POST', '/usuarios', userBody, 201)
    await request('PUT', '/usuarios/19', userBody)
    assert(passwords.verifyPassword(userBody.senha, secret), 'A senha foi substituída sem credencial anterior')
    await request('POST', '/login', { username: row.email, password: userBody.senha })
    await request('DELETE', '/usuarios/19', undefined, 204)
    // A rota /:tipo_usuario é sombreada por /:id; confirmar o SQL efetivamente usado.
    const before = calls.length
    await request('GET', '/usuarios/medico')
    assert.match(calls[before].sql, /WHERE id_usuario = \?/)
    const bodies = {
      'periodos': { descricao: 'Catálogo alterado' },
      'tipos-insulina': { nome: 'Catálogo alterado' },
      'registros-glicose': { id_usuario: 19, nivel_glicose: 150, id_periodo: 1, data_hora: row.data_hora },
      'registros-insulina': { id_registro: 1004, id_tipo_insulina: 1, unidade_insulina: 99 },
      'alarmes': { id_usuario: 19, data_hora: row.data_hora, dias_semana: ['SEG'], ativo: false },
      'configuracoes': { id_usuario: 19, idioma: 'pt', tema: 'claro', notificacoes: false },
      'exportacoes': { id_usuario: 19, data: '2026-08-01', descricao: 'Teste' }
    }
    for (const [route, body] of Object.entries(bodies)) {
      await request('GET', `/${route}`)
      await request('GET', `/${route}/1004`)
      await request('POST', `/${route}`, body, 201)
      await request('PUT', `/${route}/1004`, body)
      await request('DELETE', `/${route}/1004`, undefined, 204)
    }
    await request('GET', '/alarmes/usuario/19')
    await request('GET', '/registros-insulina/usuario/19')
    await request('GET', '/registros-glicose/usuario/19')
    const dates = 'dataInicio=2026-08-01&dataFim=2026-08-31'
    await request('GET', '/registros-glicose/usuario/19/historico?' + dates)
    await request('GET', '/registros-glicose/dashboard?id_usuario=19&' + dates)
    const pdf = await request('GET', '/exportacoes/relatorio?id_usuario=19&' + dates)
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
    assert(logs.some(line => line.includes(userBody.senha)), 'Senha fictícia presente nos logs')
    assert(logs.some(line => line.includes('scrypt:')), 'Hash presente nos logs de resposta')
    assert.equal(results.length, 49)
    const output = { explanation: '49 requisições locais: 48 registros de rota alcançáveis e uma verificação de sombreamento; banco simulado, sem dados reais. Isto confirma o fluxo HTTP/serviço/SQL, não constraints do banco de produção.', requests: results, assertions: ['listagem expõe senha', 'troca anônima de senha aceita no login', 'escritas anônimas alcançam SQL', 'relatório anônimo PDF', 'logs contêm credenciais', 'rota por tipo sombreada'], pass: true }
    fs.writeFileSync(path.join(__dirname, 'validacao-http.json'), JSON.stringify(output, null, 2) + '\n')
    originalLog(JSON.stringify({ pass: true, requests: results.length, assertions: output.assertions }, null, 2))
  } finally {
    console.log = originalLog
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.log = originalLog; console.error(error); process.exitCode = 1 })
