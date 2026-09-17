const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const ExcelJS = require('exceljs')
const fixture = require('./fixtures/relatorio-exemplo.json')
const { montarDadosRelatorio } = require('../src/reports/relatorioData')
const { gerarPdf } = require('../src/reports/pdfReport')
const { gerarXlsx } = require('../src/reports/xlsxReport')
const periodo = { dataInicio: '2026-08-01', dataFim: '2026-08-31' }

test('consolida glicose uma vez por registro e soma todas as aplicações', () => {
  const report = montarDadosRelatorio(fixture, periodo)
  assert.equal(report.resumo.totalRegistros, 10)
  assert.equal(report.resumo.totalDias, 8)
  assert.equal(report.resumo.media, 152.2)
  assert.equal(report.resumo.totalInsulina, 48.5)
  assert.equal(report.resumo.mediaDiariaInsulina, 6.06)
  assert.equal(report.resumo.diasHipoglicemia, 2)
  assert.equal(report.resumo.diasHiperglicemiaImportante, 2)
  assert.equal(report.resumo.percentualAbaixoAlvo, 20)
  assert.equal(report.resumo.percentualAlvo, 50)
  assert.equal(report.resumo.percentualAcimaAlvo, 30)
  const registro = report.registros.find(row => row.id === 1004)
  assert.equal(registro.insulinas.length, 2)
  assert.equal(registro.totalInsulina, 22)
})

test('faixas incluem corretamente os limites e contam dias distintos', () => {
  const registros = [53, 54, 69, 70, 180, 181, 250, 251].map((valor, id) => ({
    id_registro: id, nivel_glicose: valor, data_hora: '2026-08-01 12:00:00'
  }))
  const { resumo } = montarDadosRelatorio({ usuario: fixture.usuario, registros }, periodo)
  assert.deepEqual(resumo.faixas.map(faixa => faixa.quantidade), [1, 2, 2, 2, 1])
  assert.equal(resumo.diasHipoglicemia, 1)
  assert.equal(resumo.diasHiperglicemiaImportante, 1)
  assert.equal(resumo.totalInsulina, 0)
})

test('gera PDF e Excel com os mesmos registros e indicadores', async () => {
  const report = montarDadosRelatorio(fixture, periodo)
  const pdf = await gerarPdf(report)
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.match(pdf.subarray(-30).toString(), /%%EOF/)
  assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 3,
    'capa, resumo e registros devem ocupar três páginas, sem páginas extras de rodapé')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await gerarXlsx(report))
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Resumo', 'Registros'])
  const resumo = workbook.getWorksheet('Resumo')
  const values = new Map()
  resumo.eachRow(row => values.set(row.getCell(1).value, row.getCell(2).value))
  assert.equal(values.get('Paciente'), fixture.usuario.nome)
  assert.equal(values.get('Total de registros'), 10)
  assert.equal(values.get('Dias com hipoglicemia'), 2)
  assert.equal(values.get('Insulina total (UI)'), 48.5)
  const registros = workbook.getWorksheet('Registros')
  assert.equal(registros.rowCount, 11)
  assert.equal(registros.getCell('E5').value, 22)
  assert.match(registros.getCell('F5').value, /Rápida: 4 UI, Basal: 18 UI/)
  assert.equal(registros.getCell('G2').value, fixture.registros[0].observacao)
  resumo.eachRow(row => {
    if (row.getCell(1).value === 'Faixa alvo') {
      assert.equal(row.getCell(3).value, 0.5)
      assert.equal(row.getCell(3).numFmt, '0.0%')
    }
  })
})

test('rota HTTP consulta o repository e entrega arquivos ou erros JSON', async t => {
  const { pool } = require('../src/config/database')
  const chamadas = []
  t.mock.method(pool, 'execute', async (sql, params) => {
    chamadas.push({ sql, params })
    if (sql.includes('FROM usuario')) {
      return [params[0] === 19 ? [fixture.usuario] : []]
    }
    assert.match(sql, /rg\.id_usuario = \? AND rg\.data_hora >= \?/)
    assert.match(sql, /rg\.data_hora < DATE_ADD\(\?, INTERVAL 1 DAY\)/)
    return [fixture.registros.filter(row => row.data_hora >= params[1] && row.data_hora.slice(0, 10) <= params[2])]
  })
  const app = require('../src/app')
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}/exportacoes/relatorio`
  const query = { id_usuario: '19', ...periodo }

  for (const formato of ['pdf', 'xlsx']) {
    await t.test(`download ${formato}`, async () => {
      const response = await fetch(`${url}?${new URLSearchParams({ ...query, formato })}`)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.equal(response.headers.get('content-type'), formato === 'pdf'
        ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      assert.equal(response.headers.get('content-disposition'), `attachment; filename="relatorio-insulog-19-2026-08-01-2026-08-31.${formato}"`)
      const bytes = Buffer.from(await response.arrayBuffer())
      assert.equal(Number(response.headers.get('content-length')), bytes.length)
      assert.equal(bytes.subarray(0, formato === 'pdf' ? 4 : 2).toString(), formato === 'pdf' ? '%PDF' : 'PK')
      assert.deepEqual(chamadas.at(-1).params, [19, '2026-08-01 00:00:00', '2026-08-31'])
    })
  }

  await t.test('PDF é o formato padrão', async () => {
    const response = await fetch(`${url}?${new URLSearchParams(query)}`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'application/pdf')
    await response.arrayBuffer()
  })

  for (const overrides of [
    { id_usuario: '' }, { id_usuario: '-1' }, { id_usuario: '1.5' },
    { id_usuario: '9007199254740993' }, { dataInicio: '2026-02-30' },
    { dataInicio: '2026-09-01' }, { dataFim: '' }, { dataFim: '31/08/2026' },
    { formato: 'csv' }, { formato: '' }
  ]) {
    await t.test(`rejeita ${JSON.stringify(overrides)}`, async () => {
      const antes = chamadas.length
      const response = await fetch(`${url}?${new URLSearchParams({ ...query, ...overrides })}`)
      assert.equal(response.status, 400)
      assert.equal(typeof (await response.json()).error, 'string')
      assert.equal(chamadas.length, antes)
    })
  }

  for (const campo of ['id_usuario', 'dataInicio', 'formato']) {
    await t.test(`rejeita parâmetro repetido ${campo}`, async () => {
      const params = new URLSearchParams({ ...query, formato: 'pdf' })
      params.append(campo, params.get(campo))
      const response = await fetch(`${url}?${params}`)
      assert.equal(response.status, 400)
      await response.json()
    })
  }

  for (const [overrides, mensagem] of [
    [{ id_usuario: '20' }, /Usuario nao encontrado/],
    [{ dataInicio: '2025-01-01', dataFim: '2025-01-31' }, /Nenhum registro/]
  ]) {
    const response = await fetch(`${url}?${new URLSearchParams({ ...query, ...overrides })}`)
    assert.equal(response.status, 404)
    assert.match((await response.json()).error, mensagem)
    assert.equal(response.headers.get('content-disposition'), null)
  }
})
