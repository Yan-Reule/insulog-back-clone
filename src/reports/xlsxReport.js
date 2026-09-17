const ExcelJS = require('exceljs')

async function gerarXlsx(relatorio) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Insulog'
  workbook.created = relatorio.geradoEm

  const resumo = workbook.addWorksheet('Resumo')
  resumo.columns = [{ width: 42 }, { width: 26 }, { width: 18 }]
  resumo.addRows([
    ['Relatorio de controle glicemico e insulina'],
    ['Paciente', relatorio.usuario.nome],
    ['Data inicial', relatorio.periodo.dataInicio],
    ['Data final', relatorio.periodo.dataFim],
    ['Total de registros', relatorio.resumo.totalRegistros],
    ['Dias com registros', relatorio.resumo.totalDias],
    ['Glicose media (mg/dL)', relatorio.resumo.media],
    ['Menor glicose (mg/dL)', relatorio.resumo.minimo],
    ['Maior glicose (mg/dL)', relatorio.resumo.maximo],
    ['CV (%)', relatorio.resumo.cv],
    ['GMI estimado (%)', relatorio.resumo.gmi],
    ['Insulina total (UI)', relatorio.resumo.totalInsulina],
    ['Media de insulina por dia com registros (UI)', relatorio.resumo.mediaDiariaInsulina],
    ['Dias com hipoglicemia', relatorio.resumo.diasHipoglicemia],
    ['Dias com glicose acima de 250 mg/dL', relatorio.resumo.diasHiperglicemiaImportante],
    ['Registros abaixo de 70 mg/dL (%)', relatorio.resumo.percentualAbaixoAlvo],
    ['Registros na faixa alvo (%)', relatorio.resumo.percentualAlvo],
    ['Registros acima de 180 mg/dL (%)', relatorio.resumo.percentualAcimaAlvo]
  ])
  resumo.getRow(1).font = { bold: true, size: 16, color: { argb: 'FF176B87' } }

  resumo.addRow([])
  resumo.addRow(['Faixa glicemica', 'Quantidade', 'Percentual'])
  for (const faixa of relatorio.resumo.faixas) {
    const linha = resumo.addRow([faixa.descricao, faixa.quantidade, faixa.percentual / 100])
    linha.getCell(3).numFmt = '0.0%'
  }

  const registros = workbook.addWorksheet('Registros')
  registros.columns = [
    { header: 'Data/hora', key: 'dataHora', width: 22 },
    { header: 'Glicose (mg/dL)', key: 'glicose', width: 18 },
    { header: 'Classificacao', key: 'classificacao', width: 18 },
    { header: 'Periodo', key: 'periodo', width: 22 },
    { header: 'Insulina (UI)', key: 'totalInsulina', width: 16 },
    { header: 'Tipos de insulina', key: 'tipos', width: 34 },
    { header: 'Observacao', key: 'observacao', width: 45 }
  ]
  registros.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  registros.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176B87' } }
  registros.views = [{ state: 'frozen', ySplit: 1 }]
  registros.autoFilter = 'A1:G1'

  for (const registro of relatorio.registros) {
    registros.addRow({
      dataHora: registro.dataHora,
      glicose: registro.glicose,
      classificacao: registro.classificacao,
      periodo: registro.periodo,
      totalInsulina: registro.totalInsulina,
      tipos: registro.insulinas.map(item => `${item.tipo}: ${item.unidades} UI`).join(', '),
      observacao: registro.observacao
    })
  }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

module.exports = { gerarXlsx }
