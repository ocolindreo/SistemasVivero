const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { getLockPolicy } = require('../utils/login-security');

const ACCESS_TOKEN_COOKIE = 'access_token';
const GENERIC_LOGIN_ERROR = 'No fue posible iniciar sesión. Verifique sus credenciales.';
const DUMMY_PASSWORD_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
const isProduction = process.env.NODE_ENV === 'production';
const accessTokenCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  path: '/',
  maxAge: 8 * 60 * 60 * 1000
};

async function recordAuthAudit({ connection = pool, userId, action, request, observation, previousData, newData }) {
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
      userId,
      previousData ? JSON.stringify(previousData) : null,
      newData ? JSON.stringify(newData) : null,
      request.ip || null,
      request.get('user-agent') || null,
      observation
    ]
  );
}

async function login(req, res) {
  let connection;
  try {
    const { usuario, password } = req.body || {};
    if (typeof usuario !== 'string' || !usuario.trim() || typeof password !== 'string' || !password) {
      return res.status(400).json({ ok: false, mensaje: 'Usuario y contraseña son obligatorios' });
    }
    if (!process.env.JWT_SECRET || !process.env.JWT_EXPIRES_IN) {
      console.error('Configuración JWT incompleta');
      return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const identifier = usuario.trim();
    const [users] = await connection.execute(
      `SELECT u.usu_id, u.usu_username, u.usu_email, u.usu_password, u.usu_nombres, u.usu_apellidos, u.usu_estado,
              u.usu_intentos_fallidos, u.usu_fecha_ultimo_intento_fallido, u.usu_bloqueado_hasta, u.usu_bloqueo_administrativo,
              CASE WHEN u.usu_bloqueado_hasta > CURRENT_TIMESTAMP
                   THEN GREATEST(1, TIMESTAMPDIFF(SECOND, CURRENT_TIMESTAMP, u.usu_bloqueado_hasta)) ELSE 0 END AS segundos_bloqueo_restantes,
              r.rol_codigo, r.rol_nombre, r.rol_estado
       FROM usu_usuarios u
       INNER JOIN rol_roles r ON r.rol_id = u.usu_id_rol
       WHERE (u.usu_username = ? OR u.usu_email = ?)
       LIMIT 1 FOR UPDATE`,
      [identifier, identifier]
    );

    if (users.length === 0) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      await connection.rollback();
      return res.status(401).json({ ok: false, mensaje: GENERIC_LOGIN_ERROR });
    }
    const user = users[0];
    if (user.usu_estado !== 1 || user.rol_estado !== 1) {
      await connection.rollback();
      return res.status(401).json({ ok: false, mensaje: GENERIC_LOGIN_ERROR });
    }
    if (user.usu_bloqueo_administrativo === 1) {
      await connection.rollback();
      return res.status(423).json({ ok: false, codigo: 'CUENTA_BLOQUEADA_ADMIN', mensaje: 'Su usuario ha sido bloqueado por múltiples intentos fallidos. Por favor, comuníquese con un administrador.' });
    }
    if (Number(user.segundos_bloqueo_restantes) > 0) {
      await connection.rollback();
      return res.status(423).json({ ok: false, codigo: 'BLOQUEO_TEMPORAL', mensaje: 'Por seguridad, debe esperar antes de realizar otro intento.', reintentar_en_segundos: Number(user.segundos_bloqueo_restantes) });
    }
    if (user.usu_bloqueado_hasta) {
      await connection.execute('UPDATE usu_usuarios SET usu_bloqueado_hasta = NULL WHERE usu_id = ?', [user.usu_id]);
    }

    const passwordMatches = await bcrypt.compare(password, user.usu_password);
    if (!passwordMatches) {
      const failedAttempts = Number(user.usu_intentos_fallidos) + 1;
      const lockPolicy = getLockPolicy(failedAttempts);
      const lockedUntilSql = lockPolicy.seconds ? `DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${lockPolicy.seconds} SECOND)` : 'NULL';
      await connection.execute(
        `UPDATE usu_usuarios
         SET usu_intentos_fallidos = ?, usu_fecha_ultimo_intento_fallido = CURRENT_TIMESTAMP,
             usu_bloqueado_hasta = ${lockedUntilSql}, usu_bloqueo_administrativo = ?
         WHERE usu_id = ?`,
        [failedAttempts, lockPolicy.administrative ? 1 : 0, user.usu_id]
      );
      await recordAuthAudit({ connection, userId: user.usu_id, action: 'LOGIN_FALLIDO', request: req, observation: `Intento de autenticación fallido número ${failedAttempts}`, previousData: { intentos_fallidos: Number(user.usu_intentos_fallidos) }, newData: { intentos_fallidos: failedAttempts } });
      if (lockPolicy.seconds) {
        await recordAuthAudit({ connection, userId: user.usu_id, action: 'BLOQUEO_TEMPORAL', request: req, observation: `Bloqueo temporal de ${lockPolicy.seconds} segundos por intentos fallidos`, newData: { intentos_fallidos: failedAttempts, duracion_segundos: lockPolicy.seconds } });
      } else if (lockPolicy.administrative) {
        await recordAuthAudit({ connection, userId: user.usu_id, action: 'BLOQUEO_ADMIN', request: req, observation: 'Bloqueo administrativo por intentos fallidos', newData: { intentos_fallidos: failedAttempts, bloqueo_administrativo: 1 } });
      }
      await connection.commit();
      if (lockPolicy.administrative) return res.status(423).json({ ok: false, codigo: 'CUENTA_BLOQUEADA_ADMIN', mensaje: 'Su usuario ha sido bloqueado por múltiples intentos fallidos. Por favor, comuníquese con un administrador.' });
      if (lockPolicy.seconds) return res.status(423).json({ ok: false, codigo: 'BLOQUEO_TEMPORAL', mensaje: 'Por seguridad, debe esperar antes de realizar otro intento.', reintentar_en_segundos: lockPolicy.seconds });
      return res.status(401).json({ ok: false, mensaje: GENERIC_LOGIN_ERROR });
    }

    const previousFailedAttempts = Number(user.usu_intentos_fallidos);
    const [loginUpdate] = await connection.execute(
      `UPDATE usu_usuarios
       SET usu_fecha_ultimo_login = CURRENT_TIMESTAMP, usu_intentos_fallidos = 0,
           usu_fecha_ultimo_intento_fallido = NULL, usu_bloqueado_hasta = NULL, usu_bloqueo_administrativo = 0
       WHERE usu_id = ?`, [user.usu_id]
    );
    if (loginUpdate.affectedRows !== 1) throw new Error('No se pudo actualizar la fecha del último login');
    await recordAuthAudit({ connection, userId: user.usu_id, action: 'LOGIN', request: req, observation: previousFailedAttempts > 0 ? `Inicio de sesión exitoso después de ${previousFailedAttempts} intento(s) fallido(s)` : 'Inicio de sesión exitoso', previousData: previousFailedAttempts > 0 ? { intentos_fallidos: previousFailedAttempts } : null, newData: previousFailedAttempts > 0 ? { intentos_fallidos: 0 } : null });
    const token = jwt.sign({ usu_id: user.usu_id, usu_username: user.usu_username, rol_codigo: user.rol_codigo }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
    await connection.commit();

    res.cookie(ACCESS_TOKEN_COOKIE, token, accessTokenCookieOptions);
    return res.status(200).json({ ok: true, mensaje: 'Inicio de sesión correcto', token, usuario: { id: user.usu_id, username: user.usu_username, email: user.usu_email, nombres: user.usu_nombres, apellidos: user.usu_apellidos, rol: { codigo: user.rol_codigo, nombre: user.rol_nombre } } });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error en login:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  } finally {
    if (connection) connection.release();
  }
}

async function logout(req, res) {
  try {
    const authorization = req.get('authorization');

    const bearerToken = authorization?.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : '';
    const token = req.cookies?.[ACCESS_TOKEN_COOKIE] || bearerToken;

    if (!token || !process.env.JWT_SECRET) {
      return res.status(401).json({
        ok: false,
        mensaje: 'Token no válido o expirado'
      });
    }

    let decodedToken;

    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        ok: false,
        mensaje: 'Token no válido o expirado'
      });
    }

    if (!decodedToken.usu_id) {
      return res.status(401).json({
        ok: false,
        mensaje: 'Token no válido o expirado'
      });
    }

    const [users] = await pool.execute(
      'SELECT usu_id FROM usu_usuarios WHERE usu_id = ? LIMIT 1',
      [decodedToken.usu_id]
    );

    if (users.length === 0) {
      return res.status(401).json({
        ok: false,
        mensaje: 'Token no válido o expirado'
      });
    }

    await recordAuthAudit({
      userId: decodedToken.usu_id,
      action: 'LOGOUT',
      request: req,
      observation: 'Cierre de sesión'
    });

    res.clearCookie(ACCESS_TOKEN_COOKIE, accessTokenCookieOptions);

    return res.status(200).json({
      ok: true,
      mensaje: 'Sesión cerrada correctamente'
    });
  } catch (error) {
    console.error('Error en logout:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  }
}

async function obtenerSesionActual(req, res) {
  try {
    const [users] = await pool.execute(
      `SELECT
        u.usu_id,
        u.usu_username,
        u.usu_email,
        u.usu_nombres,
        u.usu_apellidos,
        u.usu_estado,
        r.rol_id,
        r.rol_codigo,
        r.rol_nombre,
        r.rol_estado
       FROM usu_usuarios u
       INNER JOIN rol_roles r ON r.rol_id = u.usu_id_rol
       WHERE u.usu_id = ?
       LIMIT 1`,
      [req.usuario.usu_id]
    );

    if (users.length === 0) {
      return res.status(401).json({
        ok: false,
        mensaje: 'Sesión no válida'
      });
    }

    const user = users[0];

    if (user.usu_estado !== 1 || user.rol_estado !== 1) {
      return res.status(403).json({
        ok: false,
        mensaje: 'La sesión no está disponible'
      });
    }

    return res.status(200).json({
      ok: true,
      usuario: {
        id: user.usu_id,
        username: user.usu_username,
        email: user.usu_email,
        nombres: user.usu_nombres,
        apellidos: user.usu_apellidos,
        rol: {
          id: user.rol_id,
          codigo: user.rol_codigo,
          nombre: user.rol_nombre
        }
      }
    });
  } catch (error) {
    console.error('Error al obtener sesión:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  }
}

module.exports = { login, logout, obtenerSesionActual };
