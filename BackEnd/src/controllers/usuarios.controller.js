const bcrypt = require('bcrypt');
const pool = require('../config/database');

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
      'usu_usuarios',
      recordId,
      previousData ? JSON.stringify(previousData) : null,
      newData ? JSON.stringify(newData) : null,
      request.ip || null,
      request.get('user-agent') || null,
      observation
    ]
  );
}

async function listarUsuarios(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT
        u.usu_id,
        u.usu_username,
        u.usu_email,
        u.usu_nombres,
        u.usu_apellidos,
        u.usu_telefono,
        u.usu_estado,
        u.usu_fecha_ultimo_login,
        r.rol_id,
        r.rol_codigo,
        r.rol_nombre
       FROM usu_usuarios u
       INNER JOIN rol_roles r ON r.rol_id = u.usu_id_rol
       ORDER BY u.usu_apellidos, u.usu_nombres`
    );

    const usuarios = rows.map(usuario => ({
      id: usuario.usu_id,
      username: usuario.usu_username,
      email: usuario.usu_email,
      nombres: usuario.usu_nombres,
      apellidos: usuario.usu_apellidos,
      telefono: usuario.usu_telefono,
      estado: usuario.usu_estado,
      fecha_ultimo_login: usuario.usu_fecha_ultimo_login,
      rol: {
        id: usuario.rol_id,
        codigo: usuario.rol_codigo,
        nombre: usuario.rol_nombre
      }
    }));

    return res.status(200).json({
      ok: true,
      usuarios
    });
  } catch (error) {
    console.error('Error al listar usuarios:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  }
}

async function obtenerUsuarioPorId(req, res) {
  const { id } = req.params;
  const parsedId = Number(id);

  if (!/^\d+$/.test(id) || !Number.isSafeInteger(parsedId) || parsedId <= 0) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El id debe ser un entero positivo'
    });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
        u.usu_id,
        u.usu_username,
        u.usu_email,
        u.usu_nombres,
        u.usu_apellidos,
        u.usu_telefono,
        u.usu_estado,
        u.usu_fecha_ultimo_login,
        u.usu_fecha_creacion,
        r.rol_id,
        r.rol_codigo,
        r.rol_nombre
       FROM usu_usuarios u
       INNER JOIN rol_roles r ON r.rol_id = u.usu_id_rol
       WHERE u.usu_id = ?
       LIMIT 1`,
      [parsedId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: 'Usuario no encontrado'
      });
    }

    const usuario = rows[0];

    return res.status(200).json({
      ok: true,
      usuario: {
        id: usuario.usu_id,
        username: usuario.usu_username,
        email: usuario.usu_email,
        nombres: usuario.usu_nombres,
        apellidos: usuario.usu_apellidos,
        telefono: usuario.usu_telefono,
        estado: usuario.usu_estado,
        fecha_ultimo_login: usuario.usu_fecha_ultimo_login,
        fecha_creacion: usuario.usu_fecha_creacion,
        rol: {
          id: usuario.rol_id,
          codigo: usuario.rol_codigo,
          nombre: usuario.rol_nombre
        }
      }
    });
  } catch (error) {
    console.error('Error al consultar usuario:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  }
}

async function crearUsuario(req, res) {
  if (req.usuario.rol_codigo !== 'ADMIN') {
    return res.status(403).json({
      ok: false,
      mensaje: 'No tiene permisos para realizar esta operación'
    });
  }

  const body = req.body || {};
  const { username, email, password, nombres, apellidos, telefono, rol_id: requestedRoleId } = body;

  const normalizedUsername = typeof username === 'string' ? username.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedNombres = typeof nombres === 'string' ? nombres.trim() : '';
  const normalizedApellidos = typeof apellidos === 'string' ? apellidos.trim() : '';
  const normalizedTelefono = typeof telefono === 'string' ? telefono.trim() : null;
  const parsedRoleId = Number(requestedRoleId);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (
    !normalizedUsername ||
    !normalizedEmail ||
    !password ||
    !normalizedNombres ||
    !normalizedApellidos ||
    !/^\d+$/.test(String(requestedRoleId)) ||
    !Number.isSafeInteger(parsedRoleId) ||
    parsedRoleId <= 0
  ) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Los datos requeridos son inválidos'
    });
  }

  if (!emailPattern.test(normalizedEmail)) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El correo electrónico no es válido'
    });
  }

  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({
      ok: false,
      mensaje: 'La contraseña debe tener al menos 8 caracteres'
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [duplicates] = await connection.execute(
      `SELECT usu_id
       FROM usu_usuarios
       WHERE usu_username = ? OR usu_email = ?
       LIMIT 1`,
      [normalizedUsername, normalizedEmail]
    );

    if (duplicates.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        ok: false,
        mensaje: 'El nombre de usuario o correo ya se encuentra registrado'
      });
    }

    const [roles] = await connection.execute(
      `SELECT rol_id, rol_codigo, rol_nombre
       FROM rol_roles
       WHERE rol_id = ? AND rol_estado = 1
       LIMIT 1`,
      [parsedRoleId]
    );

    if (roles.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'Rol no válido'
      });
    }

    const role = roles[0];
    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await connection.execute(
      `INSERT INTO usu_usuarios (
        usu_username,
        usu_email,
        usu_password,
        usu_nombres,
        usu_apellidos,
        usu_telefono,
        usu_id_rol,
        usu_estado,
        usu_id_usuario_creacion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        normalizedUsername,
        normalizedEmail,
        passwordHash,
        normalizedNombres,
        normalizedApellidos,
        normalizedTelefono || null,
        role.rol_id,
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
        usu_username: normalizedUsername,
        usu_email: normalizedEmail,
        usu_nombres: normalizedNombres,
        usu_apellidos: normalizedApellidos,
        usu_telefono: normalizedTelefono || null,
        usu_id_rol: role.rol_id,
        usu_estado: 1
      },
      request: req,
      observation: 'Usuario creado'
    });

    await connection.commit();

    return res.status(201).json({
      ok: true,
      mensaje: 'Usuario creado correctamente',
      usuario: {
        id: result.insertId,
        username: normalizedUsername,
        email: normalizedEmail,
        nombres: normalizedNombres,
        apellidos: normalizedApellidos,
        telefono: normalizedTelefono || null,
        estado: 1,
        rol: {
          id: role.rol_id,
          codigo: role.rol_codigo,
          nombre: role.rol_nombre
        }
      }
    });
  } catch (error) {
    await connection.rollback();

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        ok: false,
        mensaje: 'El nombre de usuario o correo ya se encuentra registrado'
      });
    }

    console.error('Error al crear usuario:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

async function actualizarUsuario(req, res) {
  if (req.usuario.rol_codigo !== 'ADMIN') {
    return res.status(403).json({
      ok: false,
      mensaje: 'No tiene permisos para realizar esta operación'
    });
  }

  const { id } = req.params;
  const parsedId = Number(id);

  if (!/^\d+$/.test(id) || !Number.isSafeInteger(parsedId) || parsedId <= 0) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El id debe ser un entero positivo'
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [users] = await connection.execute(
      `SELECT
         usu_id,
         usu_username,
         usu_email,
         usu_nombres,
         usu_apellidos,
         usu_telefono,
         usu_id_rol,
         usu_estado
       FROM usu_usuarios
       WHERE usu_id = ?
       LIMIT 1`,
      [parsedId]
    );

    if (users.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: 'Usuario no encontrado'
      });
    }

    const currentUser = users[0];
    const body = req.body || {};

    if (Object.prototype.hasOwnProperty.call(body, 'password')) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'La contraseña no puede modificarse desde este endpoint'
      });
    }

    if (Object.prototype.hasOwnProperty.call(body, 'estado')) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'El estado no puede modificarse desde este endpoint'
      });
    }

    const { username, email, nombres, apellidos, telefono, rol_id: requestedRoleId } = body;
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedNombres = typeof nombres === 'string' ? nombres.trim() : '';
    const normalizedApellidos = typeof apellidos === 'string' ? apellidos.trim() : '';
    const normalizedTelefono = typeof telefono === 'string' ? telefono.trim() : null;
    const parsedRoleId = Number(requestedRoleId);
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !normalizedUsername ||
      !normalizedEmail ||
      !normalizedNombres ||
      !normalizedApellidos ||
      !/^\d+$/.test(String(requestedRoleId)) ||
      !Number.isSafeInteger(parsedRoleId) ||
      parsedRoleId <= 0
    ) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'Los datos requeridos son inválidos'
      });
    }

    if (!emailPattern.test(normalizedEmail)) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'El correo electrónico no es válido'
      });
    }

    const [roles] = await connection.execute(
      `SELECT rol_id, rol_codigo, rol_nombre
       FROM rol_roles
       WHERE rol_id = ? AND rol_estado = 1
       LIMIT 1`,
      [parsedRoleId]
    );

    if (roles.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'Rol no válido'
      });
    }

    if (req.usuario.usu_id === parsedId && currentUser.usu_id_rol !== parsedRoleId) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'No puede modificar su propio rol'
      });
    }

    const [duplicates] = await connection.execute(
      `SELECT usu_id
       FROM usu_usuarios
       WHERE (usu_username = ? OR usu_email = ?)
         AND usu_id <> ?
       LIMIT 1`,
      [normalizedUsername, normalizedEmail, parsedId]
    );

    if (duplicates.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        ok: false,
        mensaje: 'El nombre de usuario o correo ya se encuentra registrado'
      });
    }

    const role = roles[0];
    await connection.execute(
      `UPDATE usu_usuarios
       SET
         usu_username = ?,
         usu_email = ?,
         usu_nombres = ?,
         usu_apellidos = ?,
         usu_telefono = ?,
         usu_id_rol = ?,
         usu_fecha_modificacion = CURRENT_TIMESTAMP,
         usu_id_usuario_modificacion = ?
       WHERE usu_id = ?`,
      [
        normalizedUsername,
        normalizedEmail,
        normalizedNombres,
        normalizedApellidos,
        normalizedTelefono || null,
        role.rol_id,
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
        usu_username: currentUser.usu_username,
        usu_email: currentUser.usu_email,
        usu_nombres: currentUser.usu_nombres,
        usu_apellidos: currentUser.usu_apellidos,
        usu_telefono: currentUser.usu_telefono,
        usu_id_rol: currentUser.usu_id_rol,
        usu_estado: currentUser.usu_estado
      },
      newData: {
        usu_username: normalizedUsername,
        usu_email: normalizedEmail,
        usu_nombres: normalizedNombres,
        usu_apellidos: normalizedApellidos,
        usu_telefono: normalizedTelefono || null,
        usu_id_rol: role.rol_id,
        usu_estado: currentUser.usu_estado
      },
      request: req,
      observation: 'Usuario actualizado'
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Usuario actualizado correctamente',
      usuario: {
        id: parsedId,
        username: normalizedUsername,
        email: normalizedEmail,
        nombres: normalizedNombres,
        apellidos: normalizedApellidos,
        telefono: normalizedTelefono || null,
        estado: 1,
        rol: {
          id: role.rol_id,
          codigo: role.rol_codigo,
          nombre: role.rol_nombre
        }
      }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        ok: false,
        mensaje: 'El nombre de usuario o correo ya se encuentra registrado'
      });
    }

    await connection.rollback();
    console.error('Error al actualizar usuario:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

async function inactivarUsuario(req, res) {
  if (req.usuario.rol_codigo !== 'ADMIN') {
    return res.status(403).json({
      ok: false,
      mensaje: 'No tiene permisos para realizar esta operación'
    });
  }

  const { id } = req.params;
  const parsedId = Number(id);

  if (!/^\d+$/.test(id) || !Number.isSafeInteger(parsedId) || parsedId <= 0) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El id debe ser un entero positivo'
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [users] = await connection.execute(
      `SELECT usu_id, usu_estado
       FROM usu_usuarios
       WHERE usu_id = ?
       LIMIT 1`,
      [parsedId]
    );

    if (users.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: 'Usuario no encontrado'
      });
    }

    if (req.usuario.usu_id === parsedId) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'No puede inactivar su propio usuario'
      });
    }

    if (users[0].usu_estado === 0) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'El usuario ya se encuentra inactivo'
      });
    }

    await connection.execute(
      `UPDATE usu_usuarios
       SET
         usu_estado = 0,
         usu_fecha_inactivacion = CURRENT_TIMESTAMP,
         usu_id_usuario_inactivacion = ?,
         usu_fecha_modificacion = CURRENT_TIMESTAMP,
         usu_id_usuario_modificacion = ?
       WHERE usu_id = ?`,
      [req.usuario.usu_id, req.usuario.usu_id, parsedId]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'INACTIVAR',
      recordId: parsedId,
      previousData: { usu_estado: 1 },
      newData: { usu_estado: 0 },
      request: req,
      observation: 'Usuario inactivado'
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Usuario inactivado correctamente',
      usuario: {
        id: parsedId,
        estado: 0
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al inactivar usuario:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

async function reactivarUsuario(req, res) {
  if (req.usuario.rol_codigo !== 'ADMIN') {
    return res.status(403).json({
      ok: false,
      mensaje: 'No tiene permisos para realizar esta operación'
    });
  }

  const { id } = req.params;
  const parsedId = Number(id);

  if (!/^\d+$/.test(id) || !Number.isSafeInteger(parsedId) || parsedId <= 0) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El id debe ser un entero positivo'
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [users] = await connection.execute(
      `SELECT usu_id, usu_estado
       FROM usu_usuarios
       WHERE usu_id = ?
       LIMIT 1`,
      [parsedId]
    );

    if (users.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: 'Usuario no encontrado'
      });
    }

    if (users[0].usu_estado === 1) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'El usuario ya se encuentra activo'
      });
    }

    await connection.execute(
      `UPDATE usu_usuarios
       SET
         usu_estado = 1,
         usu_fecha_inactivacion = NULL,
         usu_id_usuario_inactivacion = NULL,
         usu_fecha_modificacion = CURRENT_TIMESTAMP,
         usu_id_usuario_modificacion = ?
       WHERE usu_id = ?`,
      [req.usuario.usu_id, parsedId]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'REACTIVAR',
      recordId: parsedId,
      previousData: { usu_estado: 0 },
      newData: { usu_estado: 1 },
      request: req,
      observation: 'Usuario reactivado'
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Usuario reactivado correctamente',
      usuario: {
        id: parsedId,
        estado: 1
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al reactivar usuario:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

module.exports = {
  listarUsuarios,
  obtenerUsuarioPorId,
  crearUsuario,
  actualizarUsuario,
  inactivarUsuario,
  reactivarUsuario
};
