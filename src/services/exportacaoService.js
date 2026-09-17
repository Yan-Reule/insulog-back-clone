const exportacaoRepository = require('../repositories/exportacaoRepository')
const { montarDadosRelatorio } = require('../reports/relatorioData')
const { gerarPdf } = require('../reports/pdfReport')
const { gerarXlsx } = require('../reports/xlsxReport')

async function listExportacoes() {
  return await exportacaoRepository.findAll()
}

async function getExportacaoById(id) {
  const exportacao = await exportacaoRepository.findById(id)

  if (!exportacao) {
    const error = new Error('Exportação não encontrada')
    error.statusCode = 404
    throw error
  }

  return exportacao
}

async function createExportacao(data) {
  const { id_usuario, data: dataExportacao, descricao } = data

  if (!id_usuario || !dataExportacao || !descricao) {
    const error = new Error('Todos os campos são obrigatórios')
    error.statusCode = 400
    throw error
  }

  return await exportacaoRepository.create({
    id_usuario,
    data: dataExportacao,
    descricao
  })
}

async function updateExportacao(id, data) {
  const exportacao = await exportacaoRepository.findById(id)

  if (!exportacao) {
    const error = new Error('Exportação não encontrada')
    error.statusCode = 404
    throw error
  }

  const { id_usuario, data: dataExportacao, descricao } = data

  if (!id_usuario || !dataExportacao || !descricao) {
    const error = new Error('Todos os campos são obrigatórios')
    error.statusCode = 400
    throw error
  }

  return await exportacaoRepository.update(id, {
    id_usuario,
    data: dataExportacao,
    descricao
  })
}

async function deleteById(id) {
  const exportacao = await exportacaoRepository.findById(id)

  if (!exportacao) {
    const error = new Error('Exportação não encontrada')
    error.statusCode = 404
    throw error
  }

  await exportacaoRepository.deleteById(id)
}

function validarData(data, campo) {
  const formato = /^\d{4}-\d{2}-\d{2}$/
  const objeto = new Date(`${data}T00:00:00Z`)

  if (typeof data !== 'string' || !formato.test(data) || Number.isNaN(objeto.getTime()) || objeto.toISOString().slice(0, 10) !== data || data < '1000-01-01') {
    const error = new Error(`${campo} deve estar no formato YYYY-MM-DD e ser uma data valida`)
    error.statusCode = 400
    throw error
  }
}

async function gerarRelatorio({ idUsuario, dataInicio, dataFim, formato }) {
  if (!idUsuario || !dataInicio || !dataFim) {
    const error = new Error('Usuario, data inicial e data final sao obrigatorios')
    error.statusCode = 400
    throw error
  }

  if (!['string', 'number'].includes(typeof idUsuario) || !/^[1-9]\d*$/.test(String(idUsuario)) || !Number.isSafeInteger(Number(idUsuario))) {
    const error = new Error('Usuario deve ser um identificador inteiro positivo')
    error.statusCode = 400
    throw error
  }

  validarData(dataInicio, 'Data inicial')
  validarData(dataFim, 'Data final')

  if (dataInicio > dataFim) {
    const error = new Error('Data inicial nao pode ser posterior a data final')
    error.statusCode = 400
    throw error
  }

  const formatoNormalizado = formato === undefined ? 'pdf' : (typeof formato === 'string' ? formato.toLowerCase() : '')
  if (!['pdf', 'xlsx'].includes(formatoNormalizado)) {
    const error = new Error('Formato deve ser pdf ou xlsx')
    error.statusCode = 400
    throw error
  }

  const dados = await exportacaoRepository.findDadosRelatorio(
    Number(idUsuario),
    `${dataInicio} 00:00:00`,
    dataFim
  )

  if (!dados) {
    const error = new Error('Usuario nao encontrado')
    error.statusCode = 404
    throw error
  }

  const relatorio = montarDadosRelatorio(dados, { dataInicio, dataFim })
  const buffer = formatoNormalizado === 'pdf'
    ? await gerarPdf(relatorio)
    : await gerarXlsx(relatorio)

  return {
    buffer,
    nomeArquivo: `relatorio-insulog-${idUsuario}-${dataInicio}-${dataFim}.${formatoNormalizado}`,
    contentType: formatoNormalizado === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
}

module.exports = {
  listExportacoes,
  getExportacaoById,
  createExportacao,
  updateExportacao,
  deleteById,
  gerarRelatorio
}
