const fs = require('node:fs')
const path = require('node:path')
const PDFDocument = require('pdfkit')
const SVGtoPDF = require('svg-to-pdfkit')

const logoSvgPath = path.resolve(__dirname, '../../assets/images/insulogLogoSVG.svg')
const logoSvg = fs.readFileSync(logoSvgPath, 'utf8')
let sequenciaLogo = 0

function desenharLogo(doc, x, y, largura) {
  const altura = largura * (62 / 264)
  const id = `logo_${sequenciaLogo += 1}`
  const svgDimensionado = logoSvg
    .replace('<svg width="264" height="62"', `<svg width="${largura}" height="${altura}"`)
    .replaceAll('_2518_2837', `_2518_2837_${id}`)

  SVGtoPDF(doc, svgDimensionado, x, y, { width: largura, height: altura })
}

function formatarData(data) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Araguaina'
  }).format(new Date(typeof data === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(data)
    ? `${data.replace(' ', 'T')}-03:00`
    : data))
}

function formatarDataCurta(data) {
  const [ano, mes, dia] = String(data).slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

function formatarNumero(valor, casas = 1) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  }).format(valor)
}

function contarAplicacoes(relatorio) {
  return relatorio.registros.reduce((total, registro) => total + registro.insulinas.length, 0)
}

function descreverTratamento(relatorio) {
  const tipos = new Set(
    relatorio.registros.flatMap(registro => registro.insulinas.map(insulina => insulina.tipo))
  )
  if (tipos.size === 0) return 'Sem aplicações registradas no período'
  return [...tipos].join(' + ')
}

function desenharCampo(doc, rotulo, valor, x, y, largura) {
  doc.font('Helvetica').fontSize(8).fillColor('#66879a').text(rotulo, x, y, { width: largura })
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#27353d').text(String(valor), x, y + 15, {
    width: largura,
    height: 27,
    ellipsis: true
  })
}

function desenharCapa(doc, relatorio) {
  const larguraPagina = doc.page.width
  const margem = 45
  const larguraConteudo = larguraPagina - (margem * 2)
  const resumo = relatorio.resumo
  const aplicacoes = contarAplicacoes(relatorio)
  const mediaDiariaRegistros = resumo.totalRegistros / resumo.totalDias
  const inicio = formatarDataCurta(relatorio.periodo.dataInicio)
  const fim = formatarDataCurta(relatorio.periodo.dataFim)

  doc.save()
  doc.rect(0, 0, larguraPagina, 8).fill('#21c979')
  desenharLogo(doc, (larguraPagina - 215) / 2, 28, 215)

  doc.font('Helvetica-Bold').fontSize(19).fillColor('#27353d').text(
    'Relatório de Controle Glicêmico e Insulina',
    margem,
    111,
    { width: larguraConteudo, align: 'center' }
  )
  doc.font('Helvetica').fontSize(9).fillColor('#547589').text(
    'Resumo clínico baseado nos registros informados para acompanhamento endocrinológico',
    margem,
    139,
    { width: larguraConteudo, align: 'center' }
  )

  doc.roundedRect(margem, 182, larguraConteudo, 390, 14).lineWidth(0.8).strokeColor('#d5e1e5').stroke()
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#27353d').text('Dados do relatório', margem + 23, 201)
  doc.roundedRect(margem + 23, 229, 104, 4, 2).fill('#21c979')

  const colunaEsquerda = margem + 23
  const colunaDireita = margem + 280
  const larguraCampo = 205
  const linhas = [255, 310, 365, 420, 475, 530]
  const tipoDiabetes = relatorio.usuario.tipo_diabetes || relatorio.usuario.tipoDiabetes || 'Não informado'

  desenharCampo(doc, 'Paciente:', relatorio.usuario.nome, colunaEsquerda, linhas[0], larguraCampo)
  desenharCampo(doc, 'Dias com registros:', `${resumo.totalDias} dia(s)`, colunaDireita, linhas[0], larguraCampo)
  desenharCampo(doc, 'Tipo de diabetes:', tipoDiabetes, colunaEsquerda, linhas[1], larguraCampo)
  desenharCampo(doc, 'Total de registros de glicose:', resumo.totalRegistros, colunaDireita, linhas[1], larguraCampo)
  desenharCampo(doc, 'Tratamento registrado:', descreverTratamento(relatorio), colunaEsquerda, linhas[2], larguraCampo)
  desenharCampo(doc, 'Média por dia com registros:', formatarNumero(mediaDiariaRegistros), colunaDireita, linhas[2], larguraCampo)
  desenharCampo(doc, 'Período analisado:', `${inicio} a ${fim}`, colunaEsquerda, linhas[3], larguraCampo)
  desenharCampo(doc, 'Aplicações de insulina registradas:', aplicacoes, colunaDireita, linhas[3], larguraCampo)
  desenharCampo(doc, 'Tipo de relatório:', 'Relatório do período', colunaEsquerda, linhas[4], larguraCampo)
  desenharCampo(doc, 'Base das informações:', `Mesmo conjunto de ${resumo.totalRegistros} registros`, colunaDireita, linhas[4], larguraCampo)
  desenharCampo(doc, 'Gerado em:', formatarData(relatorio.geradoEm), colunaEsquerda, linhas[5], larguraCampo)
  desenharCampo(doc, 'Aplicativo:', 'Insulog', colunaDireita, linhas[5], larguraCampo)

  doc.roundedRect(margem, 596, larguraConteudo, 112, 13).fillAndStroke('#e9f8f0', '#c8ead8')
  doc.circle(margem + 28, 631, 10).lineWidth(2).strokeColor('#21c979').stroke()
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#27353d').text(
    'Documento gerado automaticamente pelo Insulog',
    margem + 52,
    615,
    { width: larguraConteudo - 72 }
  )
  doc.font('Helvetica').fontSize(8.5).fillColor('#547589').text(
    `As informações deste relatório foram consolidadas a partir dos mesmos ${resumo.totalRegistros} registros do período de ${inicio} a ${fim}. Use este documento como apoio para acompanhar tendências e compartilhe-o com o profissional de saúde responsável pela sua avaliação.`,
    margem + 52,
    636,
    { width: larguraConteudo - 75, lineGap: 2 }
  )

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#129052').text(
    'Insulog - Gestão inteligente de glicose e insulina',
    margem,
    739,
    { width: larguraConteudo, align: 'center' }
  )
  doc.strokeColor('#dbe5e9').lineWidth(0.7).moveTo(margem, 764).lineTo(larguraPagina - margem, 764).stroke()
  doc.font('Helvetica').fontSize(6.5).fillColor('#66879a').text(
    'Insulog - Relatório gerado automaticamente | Dados informados pelo paciente | Página 1',
    margem,
    773,
    { width: larguraConteudo, lineBreak: false }
  )
  doc.text('Este documento não substitui consulta, diagnóstico ou prescrição médica.', margem, 784, {
    width: larguraConteudo,
    lineBreak: false
  })
  doc.restore()
}

function desenharIconeIndicador(doc, x, y, cor, tipo) {
  doc.circle(x + 14, y + 18, 12).fill('#ffffff')
  doc.save().strokeColor(cor).fillColor(cor).lineWidth(1.5)
  if (tipo === 'gota') {
    doc.moveTo(x + 14, y + 9).bezierCurveTo(x + 7, y + 18, x + 9, y + 25, x + 14, y + 26)
      .bezierCurveTo(x + 19, y + 25, x + 21, y + 18, x + 14, y + 9).stroke()
  } else if (tipo === 'calendario') {
    doc.roundedRect(x + 7, y + 12, 14, 13, 2).stroke()
    doc.moveTo(x + 7, y + 16).lineTo(x + 21, y + 16).stroke()
    doc.moveTo(x + 11, y + 9).lineTo(x + 11, y + 13).moveTo(x + 18, y + 9).lineTo(x + 18, y + 13).stroke()
  } else if (tipo === 'insulina') {
    doc.moveTo(x + 9, y + 24).lineTo(x + 20, y + 13).stroke()
    doc.moveTo(x + 17, y + 10).lineTo(x + 23, y + 16).stroke()
    doc.moveTo(x + 19, y + 9).lineTo(x + 24, y + 14).stroke()
    doc.moveTo(x + 8, y + 25).lineTo(x + 6, y + 27).stroke()
  } else {
    doc.moveTo(x + 7, y + 24).lineTo(x + 7, y + 11).stroke()
    doc.moveTo(x + 7, y + 24).lineTo(x + 22, y + 24).stroke()
    doc.moveTo(x + 9, y + 20).lineTo(x + 13, y + 17).lineTo(x + 17, y + 18).lineTo(x + 21, y + 13).stroke()
  }
  doc.restore()
}

function desenharCardIndicador(doc, card, x, y, largura, altura) {
  doc.roundedRect(x, y, largura, altura, 10).fillAndStroke('#e9f8f0', '#c8ead8')
  desenharIconeIndicador(doc, x + 5, y + 2, card.cor, card.icone)
  doc.font('Helvetica').fontSize(7.5).fillColor('#66879a').text(card.rotulo, x + 39, y + 10, {
    width: largura - 47,
    height: 25,
    ellipsis: true
  })
  doc.font('Helvetica-Bold').fontSize(14).fillColor(card.cor).text(card.valor, x + 13, y + 36, {
    width: largura - 26,
    lineBreak: false
  })
}


function desenharRodape(doc, pagina) {
  const margemInferior = doc.page.margins.bottom
  doc.page.margins.bottom = 0
  const margem = 45
  const larguraConteudo = doc.page.width - (margem * 2)
  doc.strokeColor('#dbe5e9').lineWidth(0.7).moveTo(margem, 764).lineTo(doc.page.width - margem, 764).stroke()
  doc.font('Helvetica').fontSize(6.5).fillColor('#66879a').text(
    `Insulog - Relatório gerado automaticamente | Dados informados pelo paciente | Página ${pagina}`,
    margem, 773, { width: larguraConteudo, lineBreak: false }
  )
  doc.text('Este documento não substitui consulta, diagnóstico ou prescrição médica.', margem, 784, {
    width: larguraConteudo, lineBreak: false
  })
  doc.page.margins.bottom = margemInferior
}

function desenharCabecalhoInterno(doc) {
  const margem = 45
  const larguraLogo = 85

  doc.save()
  doc.rect(0, 0, doc.page.width, 8).fill('#21c979')
  desenharLogo(doc, (doc.page.width - larguraLogo) / 2, 22, larguraLogo)
  doc.strokeColor('#dbe5e9').lineWidth(0.7)
    .moveTo(margem, 58)
    .lineTo(doc.page.width - margem, 58)
    .stroke()
  doc.restore()
}

function desenharResumoClinico(doc, relatorio) {
  const margem = 45
  const larguraConteudo = doc.page.width - (margem * 2)
  const resumo = relatorio.resumo
  const verde = '#159257'
  const vermelho = '#ef4e55'
  const laranja = '#ff8a1f'
  const amarelo = '#f4bb25'

  desenharCabecalhoInterno(doc)

  doc.font('Helvetica-Bold').fontSize(20).fillColor('#27353d').text('Resumo clínico do período', margem, 74)
  doc.roundedRect(margem, 102, 62, 4, 2).fill('#21c979')
  doc.font('Helvetica').fontSize(8.5).fillColor('#547589').text(
    `Esta seção apresenta uma visão consolidada dos registros de glicose e insulina informados pelo paciente durante o período selecionado. Todos os indicadores foram calculados a partir dos mesmos ${resumo.totalRegistros} registros.`,
    margem, 120, { width: larguraConteudo, lineGap: 2 }
  )

  const cards = [
    { rotulo: 'Glicose média', valor: `${formatarNumero(resumo.media)} mg/dL`, cor: verde, icone: 'gota' },
    { rotulo: 'Menor glicose registrada', valor: `${resumo.minimo} mg/dL`, cor: vermelho, icone: 'gota' },
    { rotulo: 'Maior glicose registrada', valor: `${resumo.maximo} mg/dL`, cor: laranja, icone: 'gota' },
    { rotulo: 'Percentual de registros na faixa alvo', valor: `${formatarNumero(resumo.percentualAlvo)}%`, cor: verde, icone: 'grafico' },
    { rotulo: 'Registros abaixo de 70 mg/dL', valor: `${formatarNumero(resumo.percentualAbaixoAlvo)}%`, cor: vermelho, icone: 'grafico' },
    { rotulo: 'Registros acima de 180 mg/dL', valor: `${formatarNumero(resumo.percentualAcimaAlvo)}%`, cor: amarelo, icone: 'grafico' },
    { rotulo: 'Dias com hipoglicemia', valor: `${resumo.diasHipoglicemia} dia(s)`, cor: vermelho, icone: 'calendario' },
    { rotulo: 'Dias com hiperglicemia importante', valor: `${resumo.diasHiperglicemiaImportante} dia(s)`, cor: laranja, icone: 'calendario' },
    { rotulo: 'Insulina por dia com registros', valor: `${formatarNumero(resumo.mediaDiariaInsulina)} UI/dia`, cor: verde, icone: 'insulina' },
    { rotulo: 'Total de insulina no período', valor: `${formatarNumero(resumo.totalInsulina)} UI`, cor: verde, icone: 'insulina' },
    { rotulo: 'CV% - variabilidade glicêmica', valor: `${formatarNumero(resumo.cv)}%`, cor: amarelo, icone: 'grafico' },
    { rotulo: 'GMI estimado', valor: `${formatarNumero(resumo.gmi)}%`, cor: verde, icone: 'grafico' }
  ]
  const gap = 10
  const cardWidth = (larguraConteudo - (gap * 2)) / 3
  const cardHeight = 61
  const cardStartY = 166
  cards.forEach((card, index) => {
    const column = index % 3
    const row = Math.floor(index / 3)
    desenharCardIndicador(doc, card, margem + column * (cardWidth + gap), cardStartY + row * 70, cardWidth, cardHeight)
  })


  doc.font('Helvetica-Bold').fontSize(14).fillColor('#27353d').text('Principais pontos observados', margem, 531)
  const observacoes = [
    `${formatarNumero(resumo.percentualAlvo)}% dos registros permaneceram na faixa alvo de 70 a 180 mg/dL.`,
    `Foram identificados ${resumo.diasHipoglicemia} dia(s) com glicose abaixo de 70 mg/dL.`,
    `Foram identificados ${resumo.diasHiperglicemiaImportante} dia(s) com hiperglicemia importante, acima de 250 mg/dL.`,
    `A média por dia com registros foi de ${formatarNumero(resumo.mediaDiariaInsulina)} UI de insulina.`
  ]
  let observationY = 557
  for (const texto of observacoes) {
    doc.circle(margem + 7, observationY + 4, 2).fill('#21c979')
    doc.font('Helvetica').fontSize(8.2).fillColor('#27353d').text(texto, margem + 18, observationY, {
      width: larguraConteudo - 18,
      lineGap: 1
    })
    observationY += 21
  }

  doc.roundedRect(margem, 660, larguraConteudo, 82, 10).fillAndStroke('#e9f8f0', '#c8ead8')
  doc.rect(margem, 660, 5, 82).fill('#21c979')
  desenharIconeIndicador(doc, margem + 8, 670, verde, 'grafico')
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#27353d').text('Nota técnica', margem + 42, 674)
  doc.font('Helvetica').fontSize(8.2).fillColor('#547589').text(
    'Como os dados são inseridos manualmente, os percentuais apresentados representam a proporção de registros em cada faixa glicêmica, e não o tempo contínuo em faixa.',
    margem + 42, 698, { width: larguraConteudo - 62, lineGap: 2 }
  )
  desenharRodape(doc, 2)
}

function gerarPdf(relatorio) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 45, bufferPages: true })
    const partes = []
    doc.on('data', parte => partes.push(parte))
    doc.on('end', () => resolve(Buffer.concat(partes)))
    doc.on('error', reject)

    desenharCapa(doc, relatorio)

    doc.addPage()
    desenharResumoClinico(doc, relatorio)

    let primeiraPaginaRegistros = true
    doc.on('pageAdded', () => {
      doc.page.margins.top = 108
      doc.page.margins.bottom = 90
      desenharCabecalhoInterno(doc)
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#27353d').text(
        primeiraPaginaRegistros ? 'Registros completos' : 'Registros completos (continuação)', 45, 74
      )
      primeiraPaginaRegistros = false
      doc.font('Helvetica').fontSize(8).fillColor('#222')
      doc.x = 45
      doc.y = 108
    })
    doc.addPage()
    for (const registro of relatorio.registros) {
      const insulina = registro.insulinas.length ? registro.insulinas.map(item => `${item.tipo}: ${item.unidades} UI`).join(', ') : '-'
      doc.text(`${formatarData(registro.dataHora)} | ${registro.glicose} mg/dL | ${registro.classificacao}`)
      doc.text(`Periodo: ${registro.periodo} | Insulina: ${insulina}`)
      if (registro.observacao) doc.text(`Observacao: ${registro.observacao}`)
      doc.moveDown(0.5)
    }

    const paginas = doc.bufferedPageRange()
    for (let indice = 2; indice < paginas.start + paginas.count; indice += 1) {
      doc.switchToPage(indice)
      desenharRodape(doc, indice + 1)
    }
    doc.end()
  })
}

module.exports = { gerarPdf }
