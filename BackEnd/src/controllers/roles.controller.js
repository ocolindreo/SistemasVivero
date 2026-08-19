const pool = require('../config/database');

async function listarRoles(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT
        rol_id,
        rol_codigo,
        rol_nombre,
        rol_descripcion
       FROM rol_roles
       WHERE rol_estado = 1
       ORDER BY rol_nombre`
    );

    const roles = rows.map(rol => ({
      id: rol.rol_id,
      codigo: rol.rol_codigo,
      nombre: rol.rol_nombre,
      descripcion: rol.rol_descripcion
    }));

    return res.status(200).json({
      ok: true,
      roles
    });
  } catch (error) {
    console.error('Error al listar roles:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  }
}

module.exports = { listarRoles };
