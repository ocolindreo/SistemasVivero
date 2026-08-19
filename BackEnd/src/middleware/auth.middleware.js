const jwt = require('jsonwebtoken');

function autenticarJWT(req, res, next) {
  const authorization = req.get('authorization');

  const cookieToken = req.cookies?.access_token;
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const token = cookieToken || match?.[1]?.trim();

  if (!token || !process.env.JWT_SECRET) {
    return res.status(401).json({
      ok: false,
      mensaje: 'Token no válido o expirado'
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    req.usuario = {
      usu_id: payload.usu_id,
      usu_username: payload.usu_username,
      rol_codigo: payload.rol_codigo
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      mensaje: 'Token no válido o expirado'
    });
  }
}

module.exports = autenticarJWT;
