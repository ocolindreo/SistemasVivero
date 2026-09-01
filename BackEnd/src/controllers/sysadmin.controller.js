const bcrypt = require('bcrypt');
const pool = require('../config/database');

const MODULOS = {
  USUARIO: {
    table: 'usu_usuarios',
    idColumn: 'usu_id',
    auditTable: 'usu_usuarios',
    select: `SELECT u.usu_id AS id, u.usu_username AS username, u.usu_email AS email, u.usu_nombres AS nombres, u.usu_apellidos AS apellidos, u.usu_telefono AS telefono, u.usu_estado AS estado, u.usu_fecha_ultimo_login AS fecha_ultimo_login, r.rol_codigo AS rol_codigo, r.rol_nombre AS rol_nombre, COALESCE(adm.adm_visible, 1) AS visible
             FROM usu_usuarios u
             INNER JOIN rol_roles r ON r.rol_id = u.usu_id_rol
             LEFT JOIN adm_visibilidad_registros adm ON adm.adm_modulo = 'USUARIO' AND adm.adm_id_registro = u.usu_id
             ORDER BY u.usu_apellidos, u.usu_nombres`,
  },
  ESPECIE: {
    table: 'esp_especies',
    idColumn: 'esp_id',
    auditTable: 'esp_especies',
    select: `SELECT esp.esp_id AS id, esp.esp_codigo AS codigo, esp.esp_nombre_comun AS nombre_comun, esp.esp_nombre_cientifico AS nombre_cientifico, esp.esp_descripcion AS descripcion, esp.esp_estado AS estado, COALESCE(adm.adm_visible, 1) AS visible
             FROM esp_especies esp
             LEFT JOIN adm_visibilidad_registros adm ON adm.adm_modulo = 'ESPECIE' AND adm.adm_id_registro = esp.esp_id
             ORDER BY esp.esp_nombre_comun, esp.esp_codigo`,
  },
  AREA: {
    table: 'are_areas_vivero',
    idColumn: 'are_id',
    auditTable: 'are_areas_vivero',
    select: `SELECT are.are_id AS id, are.are_codigo AS codigo, are.are_nombre AS nombre, are.are_descripcion AS descripcion, are.are_ubicacion AS ubicacion, are.are_estado AS estado, COALESCE(adm.adm_visible, 1) AS visible
             FROM are_areas_vivero are
             LEFT JOIN adm_visibilidad_registros adm ON adm.adm_modulo = 'AREA' AND adm.adm_id_registro = are.are_id
             ORDER BY are.are_nombre, are.are_codigo`,
  },
  BENEFICIARIO: {
    table: 'ben_beneficiarios',
    idColumn: 'ben_id',
    auditTable: 'ben_beneficiarios',
    select: `SELECT ben.ben_id AS id, ben.ben_codigo AS codigo, ben.ben_tipo AS tipo, ben.ben_nombre AS nombre, ben.ben_nit AS nit, ben.ben_dpi AS dpi, ben.ben_responsable AS responsable, ben.ben_departamento AS departamento, ben.ben_municipio AS municipio, ben.ben_descripcion AS descripcion, ben.ben_telefono AS telefono, ben.ben_email AS email, ben.ben_direccion AS direccion, ben.ben_estado AS estado, COALESCE(adm.adm_visible, 1) AS visible
             FROM ben_beneficiarios ben
             LEFT JOIN adm_visibilidad_registros adm ON adm.adm_modulo = 'BENEFICIARIO' AND adm.adm_id_registro = ben.ben_id
             ORDER BY ben.ben_nombre, ben.ben_codigo`,
  },
};

function esIdValido(value) {
  const parsed = Number(value);
  return /^\d+$/.test(String(value)) && Number.isSafeInteger(parsed) && parsed > 0;
}

async function registrarAuditoria({ connection, userId, action, table, recordId, previousData, newData, request, observation }) {
  await connection.execute(
    `INSERT INTO aud_auditorias (aud_id_usuario, aud_accion, aud_tabla, aud_id_registro, aud_datos_anteriores, aud_datos_nuevos, aud_ip, aud_navegador, aud_observacion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, action, table, recordId, previousData ? JSON.stringify(previousData) : null, newData ? JSON.stringify(newData) : null, request.ip || null, request.get('user-agent') || null, observation || null]
  );
}

function obtenerModulo(value) {
  return MODULOS[String(value || '').trim().toUpperCase()] || null;
}

async function listarRegistros(req, res, moduloCodigo) {
  const modulo = MODULOS[moduloCodigo];
  try {
    const [rows] = await pool.execute(modulo.select);
    return res.status(200).json({ ok: true, registros: rows.map((row) => ({ ...row, estado: Number(row.estado), visible: Number(row.visible) === 1 })) });
  } catch (error) {
    console.error(`Error al listar ${moduloCodigo} en SYSADMIN:`, error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

const listarUsuarios = (req, res) => listarRegistros(req, res, 'USUARIO');
const listarEspecies = (req, res) => listarRegistros(req, res, 'ESPECIE');
const listarAreas = (req, res) => listarRegistros(req, res, 'AREA');
const listarBeneficiarios = (req, res) => listarRegistros(req, res, 'BENEFICIARIO');

async function actualizarVisibilidad(req, res) {
  const moduloCodigo = String(req.params.modulo || '').trim().toUpperCase();
  const modulo = obtenerModulo(moduloCodigo);
  const { id } = req.params;
  const visible = req.body?.visible;

  if (!modulo) return res.status(400).json({ ok: false, mensaje: 'Módulo de visibilidad no válido' });
  if (!esIdValido(id)) return res.status(400).json({ ok: false, mensaje: 'El id debe ser un entero positivo' });
  if (typeof visible !== 'boolean') return res.status(400).json({ ok: false, mensaje: 'visible debe ser booleano' });
  if (moduloCodigo === 'USUARIO' && Number(id) === req.usuario.usu_id && !visible) {
    return res.status(409).json({ ok: false, mensaje: 'No puede ocultar su propio usuario' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [registros] = await connection.execute(`SELECT ${modulo.idColumn} AS id FROM ${modulo.table} WHERE ${modulo.idColumn} = ? LIMIT 1 FOR UPDATE`, [Number(id)]);
    if (registros.length === 0) {
      await connection.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Registro no encontrado' });
    }

    const [visibilidadRows] = await connection.execute(
      `SELECT adm_visible FROM adm_visibilidad_registros WHERE adm_modulo = ? AND adm_id_registro = ? LIMIT 1 FOR UPDATE`,
      [moduloCodigo, Number(id)]
    );
    const visibleAnterior = visibilidadRows.length === 0 ? true : Number(visibilidadRows[0].adm_visible) === 1;

    await connection.execute(
      `INSERT INTO adm_visibilidad_registros (adm_modulo, adm_id_registro, adm_visible, adm_id_usuario_creacion)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE adm_visible = VALUES(adm_visible), adm_id_usuario_modificacion = VALUES(adm_id_usuario_creacion), adm_fecha_modificacion = CURRENT_TIMESTAMP`,
      [moduloCodigo, Number(id), visible ? 1 : 0, req.usuario.usu_id]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: visible ? 'MOSTRAR_REGISTRO' : 'OCULTAR_REGISTRO',
      table: modulo.auditTable,
      recordId: Number(id),
      previousData: { visible: visibleAnterior },
      newData: { visible },
      request: req,
      observation: `${visible ? 'Registro mostrado' : 'Registro ocultado'} mediante SYSADMIN`,
    });

    await connection.commit();
    return res.status(200).json({ ok: true, mensaje: visible ? 'Registro mostrado correctamente' : 'Registro ocultado correctamente', visible });
  } catch (error) {
    await connection.rollback();
    console.error('Error al actualizar visibilidad:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  } finally {
    connection.release();
  }
}

async function restablecerPassword(req, res) {
  const { id } = req.params;
  const password = req.body?.password;
  const confirmacionPassword = req.body?.confirmacion_password;

  if (!esIdValido(id)) return res.status(400).json({ ok: false, mensaje: 'El id debe ser un entero positivo' });
  if (typeof password !== 'string' || typeof confirmacionPassword !== 'string' || !password || !confirmacionPassword) {
    return res.status(400).json({ ok: false, mensaje: 'La contraseña y su confirmación son obligatorias' });
  }
  if (password.length < 8) return res.status(400).json({ ok: false, mensaje: 'La contraseña debe tener al menos 8 caracteres' });
  if (password !== confirmacionPassword) return res.status(400).json({ ok: false, mensaje: 'Las contraseñas no coinciden' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [usuarios] = await connection.execute('SELECT usu_id FROM usu_usuarios WHERE usu_id = ? LIMIT 1 FOR UPDATE', [Number(id)]);
    if (usuarios.length === 0) {
      await connection.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await connection.execute(
      `UPDATE usu_usuarios
       SET usu_password = ?, usu_fecha_modificacion = CURRENT_TIMESTAMP, usu_id_usuario_modificacion = ?
       WHERE usu_id = ?`,
      [passwordHash, req.usuario.usu_id, Number(id)]
    );
    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'RESET_PASSWORD',
      table: 'usu_usuarios',
      recordId: Number(id),
      previousData: null,
      newData: null,
      request: req,
      observation: 'Restablecimiento de contraseña realizado mediante SYSADMIN',
    });
    await connection.commit();
    return res.status(200).json({ ok: true, mensaje: 'Contraseña restablecida correctamente' });
  } catch (error) {
    await connection.rollback();
    console.error('Error al restablecer contraseña:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  } finally {
    connection.release();
  }
}

module.exports = {
  listarUsuarios,
  listarEspecies,
  listarAreas,
  listarBeneficiarios,
  actualizarVisibilidad,
  restablecerPassword,
};
