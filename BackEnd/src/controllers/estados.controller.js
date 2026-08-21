const pool = require('../config/database');

function esIdValido(value) {
  const parsed = Number(value);
  return /^\d+$/.test(String(value)) && Number.isSafeInteger(parsed) && parsed > 0;
}

function requiereAdmin(req, res) {
  if (req.usuario.rol_codigo !== 'ADMIN') {
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
      'est_estados',
      recordId,
      previousData ? JSON.stringify(previousData) : null,
      newData ? JSON.stringify(newData) : null,
      request.ip || null,
      request.get('user-agent') || null,
      observation
    ]
  );
}

async function listarEstados(req, res) {
  try {
    const modulo = typeof req.query.modulo === 'string' ? req.query.modulo.trim().toUpperCase() : '';

    const sqlBase = `SELECT
      est_id,
      est_codigo,
      est_descripcion,
      est_modulo,
      est_orden,
      est_estado
    FROM est_estados`;

    const sql = modulo
      ? `${sqlBase} WHERE est_modulo = ? ORDER BY est_modulo, est_orden, est_codigo`
      : `${sqlBase} ORDER BY est_modulo, est_orden, est_codigo`;

    const [rows] = modulo
      ? await pool.execute(sql, [modulo])
      : await pool.execute(sql);

    return res.status(200).json({
      ok: true,
      estados: rows.map((row) => ({
        id: row.est_id,
        codigo: row.est_codigo,
        descripcion: row.est_descripcion,
        modulo: row.est_modulo,
        orden: row.est_orden,
        estado: row.est_estado
      }))
    });
  } catch (error) {
    console.error('Error al listar estados:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  }
}

async function obtenerEstadoPorId(req, res) {
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
        est_id,
        est_codigo,
        est_descripcion,
        est_modulo,
        est_orden,
        est_estado,
        est_fecha_creacion,
        est_fecha_modificacion
      FROM est_estados
      WHERE est_id = ?
      LIMIT 1`,
      [Number(id)]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: 'Estado no encontrado'
      });
    }

    const row = rows[0];

    return res.status(200).json({
      ok: true,
      estado: {
        id: row.est_id,
        codigo: row.est_codigo,
        descripcion: row.est_descripcion,
        modulo: row.est_modulo,
        orden: row.est_orden,
        estado: row.est_estado,
        fecha_creacion: row.est_fecha_creacion,
        fecha_modificacion: row.est_fecha_modificacion
      }
    });
  } catch (error) {
    console.error('Error al consultar estado:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  }
}

async function crearEstado(req, res) {
  if (requiereAdmin(req, res)) {
    return;
  }

  const body = req.body || {};
  const codigo = typeof body.codigo === 'string' ? body.codigo.trim().toUpperCase() : '';
  const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : '';
  const modulo = typeof body.modulo === 'string' ? body.modulo.trim().toUpperCase() : '';
  const orden = Number(body.orden);

  if (!codigo || !descripcion || !modulo || !Number.isInteger(orden) || orden < 0) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Los datos requeridos son inválidos'
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [duplicates] = await connection.execute(
      `SELECT est_id
       FROM est_estados
       WHERE est_modulo = ? AND est_codigo = ?
       LIMIT 1`,
      [modulo, codigo]
    );

    if (duplicates.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        ok: false,
        mensaje: 'Ya existe un estado con ese código en el módulo indicado'
      });
    }

    const [result] = await connection.execute(
      `INSERT INTO est_estados (
        est_codigo,
        est_descripcion,
        est_modulo,
        est_orden,
        est_estado,
        est_id_usuario_creacion
      ) VALUES (?, ?, ?, ?, 1, ?)`,
      [codigo, descripcion, modulo, orden, req.usuario.usu_id]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'INSERT',
      recordId: result.insertId,
      previousData: null,
      newData: {
        est_codigo: codigo,
        est_descripcion: descripcion,
        est_modulo: modulo,
        est_orden: orden,
        est_estado: 1
      },
      request: req,
      observation: 'Estado creado'
    });

    await connection.commit();

    return res.status(201).json({
      ok: true,
      mensaje: 'Estado creado correctamente',
      estado: {
        id: result.insertId,
        codigo,
        descripcion,
        modulo,
        orden,
        estado: 1
      }
    });
  } catch (error) {
    await connection.rollback();

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        ok: false,
        mensaje: 'Ya existe un estado con ese código en el módulo indicado'
      });
    }

    console.error('Error al crear estado:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

async function actualizarEstado(req, res) {
  if (requiereAdmin(req, res)) {
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
  const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : '';
  const modulo = typeof body.modulo === 'string' ? body.modulo.trim().toUpperCase() : '';
  const orden = Number(body.orden);

  if (!codigo || !descripcion || !modulo || !Number.isInteger(orden) || orden < 0) {
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
        est_id,
        est_codigo,
        est_descripcion,
        est_modulo,
        est_orden,
        est_estado
      FROM est_estados
      WHERE est_id = ?
      LIMIT 1`,
      [parsedId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: 'Estado no encontrado'
      });
    }

    const current = rows[0];

    const [duplicates] = await connection.execute(
      `SELECT est_id
       FROM est_estados
       WHERE est_modulo = ?
         AND est_codigo = ?
         AND est_id <> ?
       LIMIT 1`,
      [modulo, codigo, parsedId]
    );

    if (duplicates.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        ok: false,
        mensaje: 'Ya existe un estado con ese código en el módulo indicado'
      });
    }

    await connection.execute(
      `UPDATE est_estados
       SET
         est_codigo = ?,
         est_descripcion = ?,
         est_modulo = ?,
         est_orden = ?,
         est_fecha_modificacion = CURRENT_TIMESTAMP,
         est_id_usuario_modificacion = ?
       WHERE est_id = ?`,
      [codigo, descripcion, modulo, orden, req.usuario.usu_id, parsedId]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'UPDATE',
      recordId: parsedId,
      previousData: {
        est_codigo: current.est_codigo,
        est_descripcion: current.est_descripcion,
        est_modulo: current.est_modulo,
        est_orden: current.est_orden,
        est_estado: current.est_estado
      },
      newData: {
        est_codigo: codigo,
        est_descripcion: descripcion,
        est_modulo: modulo,
        est_orden: orden,
        est_estado: current.est_estado
      },
      request: req,
      observation: 'Estado actualizado'
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Estado actualizado correctamente',
      estado: {
        id: parsedId,
        codigo,
        descripcion,
        modulo,
        orden,
        estado: current.est_estado
      }
    });
  } catch (error) {
    await connection.rollback();

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        ok: false,
        mensaje: 'Ya existe un estado con ese código en el módulo indicado'
      });
    }

    console.error('Error al actualizar estado:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

async function inactivarEstado(req, res) {
  if (requiereAdmin(req, res)) {
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
      `SELECT est_id, est_estado
       FROM est_estados
       WHERE est_id = ?
       LIMIT 1`,
      [parsedId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: 'Estado no encontrado'
      });
    }

    if (rows[0].est_estado === 0) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'El estado ya se encuentra inactivo'
      });
    }

    await connection.execute(
      `UPDATE est_estados
       SET
         est_estado = 0,
         est_fecha_modificacion = CURRENT_TIMESTAMP,
         est_id_usuario_modificacion = ?
       WHERE est_id = ?`,
      [req.usuario.usu_id, parsedId]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'INACTIVAR',
      recordId: parsedId,
      previousData: { est_estado: 1 },
      newData: { est_estado: 0 },
      request: req,
      observation: 'Estado inactivado'
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Estado inactivado correctamente',
      estado: {
        id: parsedId,
        estado: 0
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al inactivar estado:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

async function reactivarEstado(req, res) {
  if (requiereAdmin(req, res)) {
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
      `SELECT est_id, est_estado
       FROM est_estados
       WHERE est_id = ?
       LIMIT 1`,
      [parsedId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: 'Estado no encontrado'
      });
    }

    if (rows[0].est_estado === 1) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'El estado ya se encuentra activo'
      });
    }

    await connection.execute(
      `UPDATE est_estados
       SET
         est_estado = 1,
         est_fecha_modificacion = CURRENT_TIMESTAMP,
         est_id_usuario_modificacion = ?
       WHERE est_id = ?`,
      [req.usuario.usu_id, parsedId]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'REACTIVAR',
      recordId: parsedId,
      previousData: { est_estado: 0 },
      newData: { est_estado: 1 },
      request: req,
      observation: 'Estado reactivado'
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Estado reactivado correctamente',
      estado: {
        id: parsedId,
        estado: 1
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al reactivar estado:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

module.exports = {
  listarEstados,
  obtenerEstadoPorId,
  crearEstado,
  actualizarEstado,
  inactivarEstado,
  reactivarEstado
};