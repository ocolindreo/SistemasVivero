const pool = require('../config/database');

const TIPOS_BENEFICIARIO = new Set(['PERSONA', 'ESCUELA', 'COMUNIDAD', 'INSTITUCION']);

function esIdValido(value) {
  const parsed = Number(value);
  return /^\d+$/.test(String(value)) && Number.isSafeInteger(parsed) && parsed > 0;
}

function requiereRolEscritura(req, res) {
  if (!['ADMIN', 'GESTION'].includes(req.usuario.rol_codigo)) {
    res.status(403).json({
      ok: false,
      mensaje: 'No tiene permisos para realizar esta operación'
    });
    return true;
  }

  return false;
}

function normalizarTextoOpcional(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
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
      'ben_beneficiarios',
      recordId,
      previousData ? JSON.stringify(previousData) : null,
      newData ? JSON.stringify(newData) : null,
      request.ip || null,
      request.get('user-agent') || null,
      observation
    ]
  );
}

async function listarBeneficiarios(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT
        ben_id,
        ben_codigo,
        ben_tipo,
        ben_nombre,
        ben_nit,
        ben_dpi,
        ben_responsable,
        ben_departamento,
        ben_municipio,
        ben_descripcion,
        ben_telefono,
        ben_email,
        ben_direccion,
        ben_estado
       FROM ben_beneficiarios
       ORDER BY ben_nombre, ben_codigo`
    );

    return res.status(200).json({
      ok: true,
      beneficiarios: rows.map((row) => ({
        id: row.ben_id,
        codigo: row.ben_codigo,
        tipo: row.ben_tipo,
        nombre: row.ben_nombre,
        nit: row.ben_nit,
        dpi: row.ben_dpi,
        responsable: row.ben_responsable,
        departamento: row.ben_departamento,
        municipio: row.ben_municipio,
        descripcion: row.ben_descripcion,
        telefono: row.ben_telefono,
        email: row.ben_email,
        direccion: row.ben_direccion,
        estado: row.ben_estado
      }))
    });
  } catch (error) {
    console.error('Error al listar beneficiarios:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  }
}

async function obtenerBeneficiarioPorId(req, res) {
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
        ben_id,
        ben_codigo,
        ben_tipo,
        ben_nombre,
        ben_nit,
        ben_dpi,
        ben_responsable,
        ben_departamento,
        ben_municipio,
        ben_descripcion,
        ben_telefono,
        ben_email,
        ben_direccion,
        ben_estado,
        ben_fecha_creacion,
        ben_fecha_modificacion
       FROM ben_beneficiarios
       WHERE ben_id = ?
       LIMIT 1`,
      [Number(id)]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: 'Beneficiario no encontrado'
      });
    }

    const row = rows[0];

    return res.status(200).json({
      ok: true,
      beneficiario: {
        id: row.ben_id,
        codigo: row.ben_codigo,
        tipo: row.ben_tipo,
        nombre: row.ben_nombre,
        nit: row.ben_nit,
        dpi: row.ben_dpi,
        responsable: row.ben_responsable,
        departamento: row.ben_departamento,
        municipio: row.ben_municipio,
        descripcion: row.ben_descripcion,
        telefono: row.ben_telefono,
        email: row.ben_email,
        direccion: row.ben_direccion,
        estado: row.ben_estado,
        fecha_creacion: row.ben_fecha_creacion,
        fecha_modificacion: row.ben_fecha_modificacion
      }
    });
  } catch (error) {
    console.error('Error al consultar beneficiario:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  }
}

async function crearBeneficiario(req, res) {
  if (requiereRolEscritura(req, res)) {
    return;
  }

  const body = req.body || {};
  const codigo = typeof body.codigo === 'string' ? body.codigo.trim().toUpperCase() : '';
  const tipo = typeof body.tipo === 'string' ? body.tipo.trim().toUpperCase() : '';
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';

  if (!codigo || !tipo || !nombre || !TIPOS_BENEFICIARIO.has(tipo)) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Los datos requeridos son inválidos'
    });
  }

  const email = normalizarTextoOpcional(body.email);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (email && !emailPattern.test(email)) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El correo electrónico no es válido'
    });
  }

  const nit = normalizarTextoOpcional(body.nit);
  const dpi = normalizarTextoOpcional(body.dpi);
  const responsable = normalizarTextoOpcional(body.responsable);
  const departamento = normalizarTextoOpcional(body.departamento);
  const municipio = normalizarTextoOpcional(body.municipio);
  const descripcion = normalizarTextoOpcional(body.descripcion);
  const telefono = normalizarTextoOpcional(body.telefono);
  const direccion = normalizarTextoOpcional(body.direccion);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [duplicates] = await connection.execute(
      `SELECT ben_id
       FROM ben_beneficiarios
       WHERE ben_codigo = ?
       LIMIT 1`,
      [codigo]
    );

    if (duplicates.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        ok: false,
        mensaje: 'El código de beneficiario ya se encuentra registrado'
      });
    }

    const [result] = await connection.execute(
      `INSERT INTO ben_beneficiarios (
        ben_codigo,
        ben_tipo,
        ben_nombre,
        ben_nit,
        ben_dpi,
        ben_responsable,
        ben_departamento,
        ben_municipio,
        ben_descripcion,
        ben_telefono,
        ben_email,
        ben_direccion,
        ben_estado,
        ben_id_usuario_creacion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        codigo,
        tipo,
        nombre,
        nit,
        dpi,
        responsable,
        departamento,
        municipio,
        descripcion,
        telefono,
        email,
        direccion,
        req.usuario.usu_id
      ]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'CREATE',
      recordId: result.insertId,
      previousData: null,
      newData: {
        ben_codigo: codigo,
        ben_tipo: tipo,
        ben_nombre: nombre,
        ben_nit: nit,
        ben_dpi: dpi,
        ben_responsable: responsable,
        ben_departamento: departamento,
        ben_municipio: municipio,
        ben_descripcion: descripcion,
        ben_telefono: telefono,
        ben_email: email,
        ben_direccion: direccion,
        ben_estado: 1
      },
      request: req,
      observation: 'Beneficiario creado'
    });

    await connection.commit();

    return res.status(201).json({
      ok: true,
      mensaje: 'Beneficiario creado correctamente',
      beneficiario: {
        id: result.insertId,
        codigo,
        tipo,
        nombre,
        nit,
        dpi,
        responsable,
        departamento,
        municipio,
        descripcion,
        telefono,
        email,
        direccion,
        estado: 1
      }
    });
  } catch (error) {
    await connection.rollback();

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        ok: false,
        mensaje: 'El código de beneficiario ya se encuentra registrado'
      });
    }

    console.error('Error al crear beneficiario:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

async function actualizarBeneficiario(req, res) {
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
  const tipo = typeof body.tipo === 'string' ? body.tipo.trim().toUpperCase() : '';
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';

  if (!codigo || !tipo || !nombre || !TIPOS_BENEFICIARIO.has(tipo)) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Los datos requeridos son inválidos'
    });
  }

  const email = normalizarTextoOpcional(body.email);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (email && !emailPattern.test(email)) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El correo electrónico no es válido'
    });
  }

  const nit = normalizarTextoOpcional(body.nit);
  const dpi = normalizarTextoOpcional(body.dpi);
  const responsable = normalizarTextoOpcional(body.responsable);
  const departamento = normalizarTextoOpcional(body.departamento);
  const municipio = normalizarTextoOpcional(body.municipio);
  const descripcion = normalizarTextoOpcional(body.descripcion);
  const telefono = normalizarTextoOpcional(body.telefono);
  const direccion = normalizarTextoOpcional(body.direccion);

  const parsedId = Number(id);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT
        ben_id,
        ben_codigo,
        ben_tipo,
        ben_nombre,
        ben_nit,
        ben_dpi,
        ben_responsable,
        ben_departamento,
        ben_municipio,
        ben_descripcion,
        ben_telefono,
        ben_email,
        ben_direccion,
        ben_estado
       FROM ben_beneficiarios
       WHERE ben_id = ?
       LIMIT 1`,
      [parsedId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: 'Beneficiario no encontrado'
      });
    }

    const current = rows[0];

    const [duplicates] = await connection.execute(
      `SELECT ben_id
       FROM ben_beneficiarios
       WHERE ben_codigo = ?
         AND ben_id <> ?
       LIMIT 1`,
      [codigo, parsedId]
    );

    if (duplicates.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        ok: false,
        mensaje: 'El código de beneficiario ya se encuentra registrado'
      });
    }

    await connection.execute(
      `UPDATE ben_beneficiarios
       SET
        ben_codigo = ?,
        ben_tipo = ?,
        ben_nombre = ?,
        ben_nit = ?,
        ben_dpi = ?,
        ben_responsable = ?,
        ben_departamento = ?,
        ben_municipio = ?,
        ben_descripcion = ?,
        ben_telefono = ?,
        ben_email = ?,
        ben_direccion = ?,
        ben_fecha_modificacion = CURRENT_TIMESTAMP,
        ben_id_usuario_modificacion = ?
       WHERE ben_id = ?`,
      [
        codigo,
        tipo,
        nombre,
        nit,
        dpi,
        responsable,
        departamento,
        municipio,
        descripcion,
        telefono,
        email,
        direccion,
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
        ben_codigo: current.ben_codigo,
        ben_tipo: current.ben_tipo,
        ben_nombre: current.ben_nombre,
        ben_nit: current.ben_nit,
        ben_dpi: current.ben_dpi,
        ben_responsable: current.ben_responsable,
        ben_departamento: current.ben_departamento,
        ben_municipio: current.ben_municipio,
        ben_descripcion: current.ben_descripcion,
        ben_telefono: current.ben_telefono,
        ben_email: current.ben_email,
        ben_direccion: current.ben_direccion,
        ben_estado: current.ben_estado
      },
      newData: {
        ben_codigo: codigo,
        ben_tipo: tipo,
        ben_nombre: nombre,
        ben_nit: nit,
        ben_dpi: dpi,
        ben_responsable: responsable,
        ben_departamento: departamento,
        ben_municipio: municipio,
        ben_descripcion: descripcion,
        ben_telefono: telefono,
        ben_email: email,
        ben_direccion: direccion,
        ben_estado: current.ben_estado
      },
      request: req,
      observation: 'Beneficiario actualizado'
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Beneficiario actualizado correctamente',
      beneficiario: {
        id: parsedId,
        codigo,
        tipo,
        nombre,
        nit,
        dpi,
        responsable,
        departamento,
        municipio,
        descripcion,
        telefono,
        email,
        direccion,
        estado: current.ben_estado
      }
    });
  } catch (error) {
    await connection.rollback();

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        ok: false,
        mensaje: 'El código de beneficiario ya se encuentra registrado'
      });
    }

    console.error('Error al actualizar beneficiario:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

async function inactivarBeneficiario(req, res) {
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
      `SELECT ben_id, ben_estado
       FROM ben_beneficiarios
       WHERE ben_id = ?
       LIMIT 1`,
      [parsedId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: 'Beneficiario no encontrado'
      });
    }

    if (rows[0].ben_estado === 0) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'El beneficiario ya se encuentra inactivo'
      });
    }

    await connection.execute(
      `UPDATE ben_beneficiarios
       SET
        ben_estado = 0,
        ben_fecha_modificacion = CURRENT_TIMESTAMP,
        ben_id_usuario_modificacion = ?
       WHERE ben_id = ?`,
      [req.usuario.usu_id, parsedId]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'INACTIVAR',
      recordId: parsedId,
      previousData: { ben_estado: 1 },
      newData: { ben_estado: 0 },
      request: req,
      observation: 'Beneficiario inactivado'
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Beneficiario inactivado correctamente',
      beneficiario: {
        id: parsedId,
        estado: 0
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al inactivar beneficiario:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

async function reactivarBeneficiario(req, res) {
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
      `SELECT ben_id, ben_estado
       FROM ben_beneficiarios
       WHERE ben_id = ?
       LIMIT 1`,
      [parsedId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: 'Beneficiario no encontrado'
      });
    }

    if (rows[0].ben_estado === 1) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'El beneficiario ya se encuentra activo'
      });
    }

    await connection.execute(
      `UPDATE ben_beneficiarios
       SET
        ben_estado = 1,
        ben_fecha_modificacion = CURRENT_TIMESTAMP,
        ben_id_usuario_modificacion = ?
       WHERE ben_id = ?`,
      [req.usuario.usu_id, parsedId]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'REACTIVAR',
      recordId: parsedId,
      previousData: { ben_estado: 0 },
      newData: { ben_estado: 1 },
      request: req,
      observation: 'Beneficiario reactivado'
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Beneficiario reactivado correctamente',
      beneficiario: {
        id: parsedId,
        estado: 1
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al reactivar beneficiario:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

module.exports = {
  listarBeneficiarios,
  obtenerBeneficiarioPorId,
  crearBeneficiario,
  actualizarBeneficiario,
  inactivarBeneficiario,
  reactivarBeneficiario
};