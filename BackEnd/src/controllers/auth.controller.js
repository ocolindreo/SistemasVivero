const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const ACCESS_TOKEN_COOKIE = 'access_token';
const accessTokenCookieOptions = {
  httpOnly: true,
  secure: false,
  sameSite: 'lax',
  path: '/',
  maxAge: 8 * 60 * 60 * 1000
};

async function recordAuthAudit({ userId, action, request, observation }) {
  await pool.execute(
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
      null,
      null,
      request.ip || null,
      request.get('user-agent') || null,
      observation
    ]
  );
}

async function login(req, res) {
  try {
    const { usuario, password } = req.body || {};

    if (typeof usuario !== 'string' || !usuario.trim() || typeof password !== 'string' || !password) {
      return res.status(400).json({
        ok: false,
        mensaje: 'Usuario y contraseña son obligatorios'
      });
    }

    const [users] = await pool.execute(
      `SELECT
        u.usu_id,
        u.usu_username,
        u.usu_email,
        u.usu_password,
        u.usu_nombres,
        u.usu_apellidos,
        u.usu_estado,
        r.rol_codigo,
        r.rol_nombre,
        r.rol_estado
       FROM usu_usuarios u
       INNER JOIN rol_roles r ON r.rol_id = u.usu_id_rol
       WHERE (u.usu_username = ? OR u.usu_email = ?)
       LIMIT 1`,
      [usuario.trim(), usuario.trim()]
    );

    if (users.length === 0) {
      return res.status(401).json({
        ok: false,
        mensaje: 'Usuario o contraseña incorrectos'
      });
    }

    const user = users[0];

    if (user.usu_estado !== 1 || user.rol_estado !== 1) {
      return res.status(403).json({
        ok: false,
        mensaje: 'El usuario no puede iniciar sesión'
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.usu_password);

    if (!passwordMatches) {
      return res.status(401).json({
        ok: false,
        mensaje: 'Usuario o contraseña incorrectos'
      });
    }

    const [loginUpdate] = await pool.execute(
      `UPDATE usu_usuarios
       SET usu_fecha_ultimo_login = CURRENT_TIMESTAMP
       WHERE usu_id = ?`,
      [user.usu_id]
    );

    if (loginUpdate.affectedRows !== 1) {
      throw new Error('No se pudo actualizar la fecha del último login');
    }

    await recordAuthAudit({
      userId: user.usu_id,
      action: 'LOGIN',
      request: req,
      observation: 'Inicio de sesión exitoso'
    });

    if (!process.env.JWT_SECRET || !process.env.JWT_EXPIRES_IN) {
      console.error('Configuración JWT incompleta');
      return res.status(500).json({
        ok: false,
        mensaje: 'Error interno del servidor'
      });
    }

    const token = jwt.sign(
      {
        usu_id: user.usu_id,
        usu_username: user.usu_username,
        rol_codigo: user.rol_codigo
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // Temporary dual mode: JSON token remains for existing Bearer clients.
    res.cookie(ACCESS_TOKEN_COOKIE, token, accessTokenCookieOptions);

    return res.status(200).json({
      ok: true,
      mensaje: 'Inicio de sesión correcto',
      token,
      usuario: {
        id: user.usu_id,
        username: user.usu_username,
        email: user.usu_email,
        nombres: user.usu_nombres,
        apellidos: user.usu_apellidos,
        rol: {
          codigo: user.rol_codigo,
          nombre: user.rol_nombre
        }
      }
    });
  } catch (error) {
    console.error('Error en login:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
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
