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
      'are_areas_vivero',
      recordId,
      previousData ? JSON.stringify(previousData) : null,
      newData ? JSON.stringify(newData) : null,
      request.ip || null,
      request.get('user-agent') || null,
      observation
    ]
  );
}

async function listarAreas(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT
        are_id,
        are_codigo,
        are_nombre,
        are_descripcion,
        are_ubicacion,
        are_estado
      FROM are_areas_vivero are
      LEFT JOIN adm_visibilidad_registros adm ON adm.adm_modulo = 'AREA' AND adm.adm_id_registro = are.are_id
      WHERE COALESCE(adm.adm_visible, 1) = 1
       ORDER BY are_nombre, are_codigo`
    );

    return res.status(200).json({
      ok: true,
      areas: rows.map((row) => ({
        id: row.are_id,
        codigo: row.are_codigo,
        nombre: row.are_nombre,
        descripcion: row.are_descripcion,
        ubicacion: row.are_ubicacion,
        estado: row.are_estado
      }))
    });
  } catch (error) {
    console.error('Error al listar áreas:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  }
}

async function obtenerAreaPorId(req, res) {
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
        are_id,
        are_codigo,
        are_nombre,
        are_descripcion,
        are_ubicacion,
        are_estado,
        are_fecha_creacion,
        are_fecha_modificacion
       FROM are_areas_vivero
       WHERE are_id = ?
       LIMIT 1`,
      [Number(id)]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: 'Área no encontrada'
      });
    }

    const row = rows[0];

    return res.status(200).json({
      ok: true,
      area: {
        id: row.are_id,
        codigo: row.are_codigo,
        nombre: row.are_nombre,
        descripcion: row.are_descripcion,
        ubicacion: row.are_ubicacion,
        estado: row.are_estado,
        fecha_creacion: row.are_fecha_creacion,
        fecha_modificacion: row.are_fecha_modificacion
      }
    });
  } catch (error) {
    console.error('Error al consultar área:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  }
}

async function crearArea(req, res) {
  if (requiereRolEscritura(req, res)) {
    return;
  }

  const body = req.body || {};
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : null;
  const ubicacion = typeof body.ubicacion === 'string' ? body.ubicacion.trim() : null;

  if (!nombre) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Los datos requeridos son inválidos'
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `INSERT INTO are_areas_vivero (
        are_codigo,
        are_nombre,
        are_descripcion,
        are_ubicacion,
        are_estado,
        are_id_usuario_creacion
      ) VALUES (UUID(), ?, ?, ?, 1, ?)`,
      [nombre, descripcion || null, ubicacion || null, req.usuario.usu_id]
    );

    const codigo = `ARE-${String(result.insertId).padStart(6, '0')}`;

    await connection.execute(
      `UPDATE are_areas_vivero
       SET are_codigo = ?
       WHERE are_id = ?`,
      [codigo, result.insertId]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'CREATE',
      recordId: result.insertId,
      previousData: null,
      newData: {
        are_codigo: codigo,
        are_nombre: nombre,
        are_descripcion: descripcion || null,
        are_ubicacion: ubicacion || null,
        are_estado: 1
      },
      request: req,
      observation: 'Área creada'
    });

    await connection.commit();

    return res.status(201).json({
      ok: true,
      mensaje: 'Área creada correctamente',
      area: {
        id: result.insertId,
        codigo,
        nombre,
        descripcion: descripcion || null,
        ubicacion: ubicacion || null,
        estado: 1
      }
    });
  } catch (error) {
    await connection.rollback();

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        ok: false,
        mensaje: 'El código de área ya se encuentra registrado'
      });
    }

    console.error('Error al crear área:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

async function actualizarArea(req, res) {
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

  if (Object.prototype.hasOwnProperty.call(body, 'codigo')) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El código no puede modificarse desde este endpoint'
    });
  }

  if (Object.prototype.hasOwnProperty.call(body, 'estado')) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El estado no puede modificarse desde este endpoint'
    });
  }

  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : null;
  const ubicacion = typeof body.ubicacion === 'string' ? body.ubicacion.trim() : null;

  if (!nombre) {
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
        are_id,
        are_codigo,
        are_nombre,
        are_descripcion,
        are_ubicacion,
        are_estado
       FROM are_areas_vivero
       WHERE are_id = ?
       LIMIT 1`,
      [parsedId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: 'Área no encontrada'
      });
    }

    const current = rows[0];

    await connection.execute(
      `UPDATE are_areas_vivero
       SET
         are_nombre = ?,
         are_descripcion = ?,
         are_ubicacion = ?,
         are_fecha_modificacion = CURRENT_TIMESTAMP,
         are_id_usuario_modificacion = ?
       WHERE are_id = ?`,
      [nombre, descripcion || null, ubicacion || null, req.usuario.usu_id, parsedId]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'UPDATE',
      recordId: parsedId,
      previousData: {
        are_codigo: current.are_codigo,
        are_nombre: current.are_nombre,
        are_descripcion: current.are_descripcion,
        are_ubicacion: current.are_ubicacion,
        are_estado: current.are_estado
      },
      newData: {
        are_codigo: current.are_codigo,
        are_nombre: nombre,
        are_descripcion: descripcion || null,
        are_ubicacion: ubicacion || null,
        are_estado: current.are_estado
      },
      request: req,
      observation: 'Área actualizada'
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Área actualizada correctamente',
      area: {
        id: parsedId,
        codigo: current.are_codigo,
        nombre,
        descripcion: descripcion || null,
        ubicacion: ubicacion || null,
        estado: current.are_estado
      }
    });
  } catch (error) {
    await connection.rollback();

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        ok: false,
        mensaje: 'El código de área ya se encuentra registrado'
      });
    }

    console.error('Error al actualizar área:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

async function inactivarArea(req, res) {
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
      `SELECT are_id, are_estado
       FROM are_areas_vivero
       WHERE are_id = ?
       LIMIT 1`,
      [parsedId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: 'Área no encontrada'
      });
    }

    if (rows[0].are_estado === 0) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'El área ya se encuentra inactiva'
      });
    }

    await connection.execute(
      `UPDATE are_areas_vivero
       SET
         are_estado = 0,
         are_fecha_modificacion = CURRENT_TIMESTAMP,
         are_id_usuario_modificacion = ?
       WHERE are_id = ?`,
      [req.usuario.usu_id, parsedId]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'INACTIVAR',
      recordId: parsedId,
      previousData: { are_estado: 1 },
      newData: { are_estado: 0 },
      request: req,
      observation: 'Área inactivada'
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Área inactivada correctamente',
      area: {
        id: parsedId,
        estado: 0
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al inactivar área:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

async function reactivarArea(req, res) {
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
      `SELECT are_id, are_estado
       FROM are_areas_vivero
       WHERE are_id = ?
       LIMIT 1`,
      [parsedId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: 'Área no encontrada'
      });
    }

    if (rows[0].are_estado === 1) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'El área ya se encuentra activa'
      });
    }

    await connection.execute(
      `UPDATE are_areas_vivero
       SET
         are_estado = 1,
         are_fecha_modificacion = CURRENT_TIMESTAMP,
         are_id_usuario_modificacion = ?
       WHERE are_id = ?`,
      [req.usuario.usu_id, parsedId]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'REACTIVAR',
      recordId: parsedId,
      previousData: { are_estado: 0 },
      newData: { are_estado: 1 },
      request: req,
      observation: 'Área reactivada'
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Área reactivada correctamente',
      area: {
        id: parsedId,
        estado: 1
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al reactivar área:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

module.exports = {
  listarAreas,
  obtenerAreaPorId,
  crearArea,
  actualizarArea,
  inactivarArea,
  reactivarArea
};