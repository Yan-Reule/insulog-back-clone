const exportacaoService = require('../services/exportacaoService')

async function index(req, res, next) {
  try {
    const exportacoes = await exportacaoService.listExportacoes()
    return res.status(200).json(exportacoes)
  } catch (error) {
    next(error)
  }
}

async function show(req, res, next) {
  try {
    const { id } = req.params
    const exportacao = await exportacaoService.getExportacaoById(id)
    return res.status(200).json(exportacao)
  } catch (error) {
    next(error)
  }
}

async function create(req, res, next) {
  try {
    const exportacao = await exportacaoService.createExportacao(req.body)
    return res.status(201).json(exportacao)
  } catch (error) {
    next(error)
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.params
    const exportacao = await exportacaoService.updateExportacao(id, req.body)
    return res.status(200).json(exportacao)
  } catch (error) {
    next(error)
  }
}

async function deleteById(req, res, next) {
  try {
    const { id } = req.params
    await exportacaoService.deleteById(id)
    return res.status(204).send()
  } catch (error) {
    next(error)
  }
}

async function gerarRelatorio(req, res, next) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { id_usuario, dataInicio, dataFim, formato } = req.query
    const arquivo = await exportacaoService.gerarRelatorio({
      idUsuario: id_usuario,
      dataInicio,
      dataFim,
      formato
    })

    res.status(200)
    res.setHeader('Content-Type', arquivo.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${arquivo.nomeArquivo}"`)
    res.setHeader('Content-Length', arquivo.buffer.length)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    return res.end(arquivo.buffer)
  } catch (error) {
    next(error)
  }
}

module.exports = {
  index,
  show,
  create,
  update,
  deleteById,
  gerarRelatorio
}
