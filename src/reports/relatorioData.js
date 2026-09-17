const FAIXAS = [
  { chave: 'muitoBaixo', descricao: 'Muito baixo', teste: valor => valor < 54 },
  { chave: 'baixo', descricao: 'Baixo', teste: valor => valor >= 54 && valor < 70 },
  { chave: 'alvo', descricao: 'Faixa alvo', teste: valor => valor >= 70 && valor <= 180 },
  { chave: 'alto', descricao: 'Alto', teste: valor => valor > 180 && valor <= 250 },
  { chave: 'muitoAlto', descricao: 'Muito alto', teste: valor => valor > 250 }
]

function arredondar(valor, casas = 1) {
  const fator = 10 ** casas
  return Math.round(valor * fator) / fator
}

function classificar(valor) {
  return FAIXAS.find(faixa => faixa.teste(valor))
}

function consolidarRegistros(rows) {
  const registros = new Map()

  for (const row of rows) {
    if (!registros.has(row.id_registro)) {
      registros.set(row.id_registro, {
        id: row.id_registro,
        glicose: Number(row.nivel_glicose),
        dataHora: row.data_hora,
        periodo: row.periodo || '-',
        observacao: row.observacao || '',
        insulinas: []
      })
    }

    if (row.id_registro_insulina) {
      registros.get(row.id_registro).insulinas.push({
        tipo: row.tipo_insulina || 'Nao informado',
        unidades: Number(row.unidade_insulina)
      })
    }
  }

  return [...registros.values()]
}

function calcularResumo(registros) {
  const valores = registros.map(registro => registro.glicose)
  const total = valores.length
  const media = valores.reduce((soma, valor) => soma + valor, 0) / total
  const variancia = valores.reduce((soma, valor) => soma + ((valor - media) ** 2), 0) / total
  const contagens = Object.fromEntries(FAIXAS.map(faixa => [faixa.chave, 0]))

  for (const valor of valores) {
    contagens[classificar(valor).chave] += 1
  }

  const totalInsulina = registros.reduce((totalAtual, registro) => {
    return totalAtual + registro.insulinas.reduce((soma, insulina) => soma + insulina.unidades, 0)
  }, 0)

  const dias = new Set(registros.map(registro => String(registro.dataHora).slice(0, 10))).size
  const diasNaFaixa = teste => new Set(registros.filter(registro => teste(registro.glicose))
    .map(registro => String(registro.dataHora).slice(0, 10))).size
  const percentual = teste => arredondar((valores.filter(teste).length / total) * 100)

  return {
    totalRegistros: total,
    totalDias: dias,
    media: arredondar(media),
    minimo: Math.min(...valores),
    maximo: Math.max(...valores),
    cv: media === 0 ? 0 : arredondar((Math.sqrt(variancia) / media) * 100),
    gmi: arredondar(3.31 + (0.02392 * media), 2),
    totalInsulina: arredondar(totalInsulina, 2),
    mediaDiariaInsulina: arredondar(totalInsulina / dias, 2),
    diasHipoglicemia: diasNaFaixa(valor => valor < 70),
    diasHiperglicemiaImportante: diasNaFaixa(valor => valor > 250),
    percentualAbaixoAlvo: percentual(valor => valor < 70),
    percentualAlvo: percentual(valor => valor >= 70 && valor <= 180),
    percentualAcimaAlvo: percentual(valor => valor > 180),
    faixas: FAIXAS.map(faixa => ({
      descricao: faixa.descricao,
      quantidade: contagens[faixa.chave],
      percentual: arredondar((contagens[faixa.chave] / total) * 100)
    }))
  }
}

function montarDadosRelatorio(dados, periodo) {
  const registros = consolidarRegistros(dados.registros)

  if (registros.length === 0) {
    const error = new Error('Nenhum registro encontrado no periodo informado')
    error.statusCode = 404
    throw error
  }

  return {
    usuario: dados.usuario,
    periodo,
    geradoEm: new Date(),
    resumo: calcularResumo(registros),
    registros: registros.map(registro => ({
      ...registro,
      classificacao: classificar(registro.glicose).descricao,
      totalInsulina: arredondar(
        registro.insulinas.reduce((soma, insulina) => soma + insulina.unidades, 0),
        2
      )
    }))
  }
}

module.exports = { montarDadosRelatorio }
