const dataBase = require('../config/database')
const db = dataBase.pool

async function findAll() {
  const [rows] = await db.execute(
    'SELECT id_exportacao, id_usuario, data, descricao FROM exportacao ORDER BY id_exportacao ASC'
  )

  return rows
}

async function findById(id) {
  const [rows] = await db.execute(
    'SELECT id_exportacao, id_usuario, data, descricao FROM exportacao WHERE id_exportacao = ?',
    [id]
  )

  return rows[0]
}

async function create(exportacao) {
  const { id_usuario, data, descricao } = exportacao
  const conn = await db.getConnection()

  try {
    await conn.beginTransaction()

    const [result] = await conn.execute(
      'INSERT INTO exportacao (id_usuario, data, descricao) VALUES (?, ?, ?)',
      [id_usuario, data, descricao]
    )

    await conn.commit()

    return {
      id_exportacao: result.insertId,
      id_usuario,
      data,
      descricao
    }
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

async function update(id, exportacao) {
  const { id_usuario, data, descricao } = exportacao
  const conn = await db.getConnection()

  try {
    await conn.beginTransaction()

    await conn.execute(
      'UPDATE exportacao SET id_usuario = ?, data = ?, descricao = ? WHERE id_exportacao = ?',
      [id_usuario, data, descricao, id]
    )

    await conn.commit()

    return {
      id_exportacao: Number(id),
      id_usuario,
      data,
      descricao
    }
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

async function deleteById(id) {
  await db.execute(
    'DELETE FROM exportacao WHERE id_exportacao = ?',
    [id]
  )
}

async function findDadosRelatorio(idUsuario, dataInicio, dataFim) {
  const [usuarios] = await db.execute(
    'SELECT id_usuario, nome, email FROM usuario WHERE id_usuario = ?',
    [idUsuario]
  )

  if (!usuarios[0]) {
    return undefined
  }

  const [registros] = await db.execute(
    `SELECT
      rg.id_registro,
      rg.nivel_glicose,
      rg.data_hora,
      rg.observacao,
      p.descricao AS periodo,
      ri.id_registro_insulina,
      ri.unidade_insulina,
      ti.nome AS tipo_insulina
    FROM registroglicose rg
    LEFT JOIN periodo p ON p.id_periodo = rg.id_periodo
    LEFT JOIN registroinsulina ri ON ri.id_registro = rg.id_registro
    LEFT JOIN tipoinsulina ti ON ti.id_tipo_insulina = ri.id_tipo_insulina
    WHERE rg.id_usuario = ? AND rg.data_hora >= ?
      AND rg.data_hora < DATE_ADD(?, INTERVAL 1 DAY)
    ORDER BY rg.data_hora ASC, ri.id_registro_insulina ASC`,
    [idUsuario, dataInicio, dataFim]
  )

  return {
    usuario: usuarios[0],
    registros
  }
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  deleteById,
  findDadosRelatorio
}
