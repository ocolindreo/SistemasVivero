const pool = require('../config/database');

function esIdValido(value) {
  const parsed = Number(value);
  return /^\d+$/.test(String(value)) && Number.isSafeInteger(parsed) && parsed > 0;
}

function requiereRolEscritura(req, res) {
  if (!['ADMIN', 'VIVERO'].includes(req.usuario.rol_codigo)) {
    res.status(403).json({
      ok: false,
      mensaje: 'No tiene permisos para realizar esta operación'
    });
    return true;
  }

  return false;
}

async function registrarAuditoria({ connection, userId, action, recordId, previousData, newData, request, observation }) {
  await connection.execute(
    `INSERT INTO aud_auditorias (
      aud_id_usuario,
      aud_accion,
      aud_tabla,
      aud_id_registro,
      aud_datos_anteriores,
      aud_datos_nuevos,
      aud_ip,
      aud_navegador,
      aud_observacion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      action,
      'esp_especies',
      recordId,
      previousData ? JSON.stringify(previousData) : null,
      newData ? JSON.stringify(newData) : null,
      request.ip || null,
      request.get('user-agent') || null,
      observation
    ]
  );
}

async function listarEspecies(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT
        esp_id,
        esp_codigo,
        esp_nombre_comun,
        esp_nombre_cientifico,
        esp_descripcion,
        esp_estado
       FROM esp_especies
       ORDER BY esp_nombre_comun, esp_codigo`
    );

    return res.status(200).json({
      ok: true,
      especies: rows.map((row) => ({
        id: row.esp_id,
        codigo: row.esp_codigo,
        nombre_comun: row.esp_nombre_comun,
        nombre_cientifico: row.esp_nombre_cientifico,
        descripcion: row.esp_descripcion,
        estado: row.esp_estado
      }))
    });
  } catch (error) {
    console.error('Error al listar especies:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  }
}

async function obtenerEspeciePorId(req, res) {
  const { id } = req.params;

  if (!esIdValido(id)) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El id debe ser un entero positivo'
    });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
        esp_id,
        esp_codigo,
        esp_nombre_comun,
        esp_nombre_cientifico,
        esp_descripcion,
        esp_estado,
        esp_fecha_creacion,
        esp_fecha_modificacion
       FROM esp_especies
       WHERE esp_id = ?
       LIMIT 1`,
      [Number(id)]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: 'Especie no encontrada'
      });
    }

    const row = rows[0];

    return res.status(200).json({
      ok: true,
      especie: {
        id: row.esp_id,
        codigo: row.esp_codigo,
        nombre_comun: row.esp_nombre_comun,
        nombre_cientifico: row.esp_nombre_cientifico,
        descripcion: row.esp_descripcion,
        estado: row.esp_estado,
        fecha_creacion: row.esp_fecha_creacion,
        fecha_modificacion: row.esp_fecha_modificacion
      }
    });
  } catch (error) {
    console.error('Error al consultar especie:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  }
}

async function crearEspecie(req, res) {
  if (requiereRolEscritura(req, res)) {
    return;
  }

  const body = req.body || {};
  const codigo = typeof body.codigo === 'string' ? body.codigo.trim().toUpperCase() : '';
  const nombreComun = typeof body.nombre_comun === 'string' ? body.nombre_comun.trim() : '';
  const nombreCientifico = typeof body.nombre_cientifico === 'string' ? body.nombre_cientifico.trim() : null;
  const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : null;

  if (!codigo || !nombreComun) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Los datos requeridos son inválidos'
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [duplicates] = await connection.execute(
      `SELECT esp_id
       FROM esp_especies
       WHERE esp_codigo = ?
       LIMIT 1`,
      [codigo]
    );

    if (duplicates.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        ok: false,
        mensaje: 'El código de especie ya se encuentra registrado'
      });
    }

    const [result] = await connection.execute(
      `INSERT INTO esp_especies (
        esp_codigo,
        esp_nombre_comun,
        esp_nombre_cientifico,
        esp_descripcion,
        esp_estado,
        esp_id_usuario_creacion
      ) VALUES (?, ?, ?, ?, 1, ?)`,
      [codigo, nombreComun, nombreCientifico || null, descripcion || null, req.usuario.usu_id]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'CREATE',
      recordId: result.insertId,
      previousData: null,
      newData: {
        esp_codigo: codigo,
        esp_nombre_comun: nombreComun,
        esp_nombre_cientifico: nombreCientifico || null,
        esp_descripcion: descripcion || null,
        esp_estado: 1
      },
      request: req,
      observation: 'Especie creada'
    });

    await connection.commit();

    return res.status(201).json({
      ok: true,
      mensaje: 'Especie creada correctamente',
      especie: {
        id: result.insertId,
        codigo,
        nombre_comun: nombreComun,
        nombre_cientifico: nombreCientifico || null,
        descripcion: descripcion || null,
        estado: 1
      }
    });
  } catch (error) {
    await connection.rollback();

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        ok: false,
        mensaje: 'El código de especie ya se encuentra registrado'
      });
    }

    console.error('Error al crear especie:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

async function actualizarEspecie(req, res) {
  if (requiereRolEscritura(req, res)) {
    return;
  }

  const { id } = req.params;

  if (!esIdValido(id)) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El id debe ser un entero positivo'
    });
  }

  const body = req.body || {};

  if (Object.prototype.hasOwnProperty.call(body, 'estado')) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El estado no puede modificarse desde este endpoint'
    });
  }

  const codigo = typeof body.codigo === 'string' ? body.codigo.trim().toUpperCase() : '';
  const nombreComun = typeof body.nombre_comun === 'string' ? body.nombre_comun.trim() : '';
  const nombreCientifico = typeof body.nombre_cientifico === 'string' ? body.nombre_cientifico.trim() : null;
  const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : null;

  if (!codigo || !nombreComun) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Los datos requeridos son inválidos'
    });
  }

  const parsedId = Number(id);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT
        esp_id,
        esp_codigo,
        esp_nombre_comun,
        esp_nombre_cientifico,
        esp_descripcion,
        esp_estado
       FROM esp_especies
       WHERE esp_id = ?
       LIMIT 1`,
      [parsedId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: 'Especie no encontrada'
      });
    }

    const current = rows[0];

    const [duplicates] = await connection.execute(
      `SELECT esp_id
       FROM esp_especies
       WHERE esp_codigo = ?
         AND esp_id <> ?
       LIMIT 1`,
      [codigo, parsedId]
    );

    if (duplicates.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        ok: false,
        mensaje: 'El código de especie ya se encuentra registrado'
      });
    }

    await connection.execute(
      `UPDATE esp_especies
       SET
         esp_codigo = ?,
         esp_nombre_comun = ?,
         esp_nombre_cientifico = ?,
         esp_descripcion = ?,
         esp_fecha_modificacion = CURRENT_TIMESTAMP,
         esp_id_usuario_modificacion = ?
       WHERE esp_id = ?`,
      [
        codigo,
        nombreComun,
        nombreCientifico || null,
        descripcion || null,
        req.usuario.usu_id,
        parsedId
      ]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'UPDATE',
      recordId: parsedId,
      previousData: {
        esp_codigo: current.esp_codigo,
        esp_nombre_comun: current.esp_nombre_comun,
        esp_nombre_cientifico: current.esp_nombre_cientifico,
        esp_descripcion: current.esp_descripcion,
        esp_estado: current.esp_estado
      },
      newData: {
        esp_codigo: codigo,
        esp_nombre_comun: nombreComun,
        esp_nombre_cientifico: nombreCientifico || null,
        esp_descripcion: descripcion || null,
        esp_estado: current.esp_estado
      },
      request: req,
      observation: 'Especie actualizada'
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Especie actualizada correctamente',
      especie: {
        id: parsedId,
        codigo,
        nombre_comun: nombreComun,
        nombre_cientifico: nombreCientifico || null,
        descripcion: descripcion || null,
        estado: current.esp_estado
      }
    });
  } catch (error) {
    await connection.rollback();

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        ok: false,
        mensaje: 'El código de especie ya se encuentra registrado'
      });
    }

    console.error('Error al actualizar especie:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

async function inactivarEspecie(req, res) {
  if (requiereRolEscritura(req, res)) {
    return;
  }

  const { id } = req.params;

  if (!esIdValido(id)) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El id debe ser un entero positivo'
    });
  }

  const parsedId = Number(id);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT esp_id, esp_estado
       FROM esp_especies
       WHERE esp_id = ?
       LIMIT 1`,
      [parsedId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: 'Especie no encontrada'
      });
    }

    if (rows[0].esp_estado === 0) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'La especie ya se encuentra inactiva'
      });
    }

    await connection.execute(
      `UPDATE esp_especies
       SET
         esp_estado = 0,
         esp_fecha_modificacion = CURRENT_TIMESTAMP,
         esp_id_usuario_modificacion = ?
       WHERE esp_id = ?`,
      [req.usuario.usu_id, parsedId]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'INACTIVAR',
      recordId: parsedId,
      previousData: { esp_estado: 1 },
      newData: { esp_estado: 0 },
      request: req,
      observation: 'Especie inactivada'
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Especie inactivada correctamente',
      especie: {
        id: parsedId,
        estado: 0
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al inactivar especie:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

async function reactivarEspecie(req, res) {
  if (requiereRolEscritura(req, res)) {
    return;
  }

  const { id } = req.params;

  if (!esIdValido(id)) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El id debe ser un entero positivo'
    });
  }

  const parsedId = Number(id);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT esp_id, esp_estado
       FROM esp_especies
       WHERE esp_id = ?
       LIMIT 1`,
      [parsedId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: 'Especie no encontrada'
      });
    }

    if (rows[0].esp_estado === 1) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'La especie ya se encuentra activa'
      });
    }

    await connection.execute(
      `UPDATE esp_especies
       SET
         esp_estado = 1,
         esp_fecha_modificacion = CURRENT_TIMESTAMP,
         esp_id_usuario_modificacion = ?
       WHERE esp_id = ?`,
      [req.usuario.usu_id, parsedId]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'REACTIVAR',
      recordId: parsedId,
      previousData: { esp_estado: 0 },
      newData: { esp_estado: 1 },
      request: req,
      observation: 'Especie reactivada'
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Especie reactivada correctamente',
      especie: {
        id: parsedId,
        estado: 1
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al reactivar especie:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

module.exports = {
  listarEspecies,
  obtenerEspeciePorId,
  crearEspecie,
  actualizarEspecie,
  inactivarEspecie,
  reactivarEspecie
};