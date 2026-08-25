const express = require('express');
const autenticarJWT = require('../middleware/auth.middleware');
const {
  listarSolicitudes,
  obtenerSolicitudPorId,
  crearSolicitud,
  aprobarSolicitud,
  rechazarSolicitud,
} = require('../controllers/solicitudes.controller');

const router = express.Router();

function autorizarRoles(rolesPermitidos) {
  return (req, res, next) => {
    if (!rolesPermitidos.includes(req.usuario.rol_codigo)) {
      return res.status(403).json({
        ok: false,
        mensaje: 'No tiene permisos para realizar esta operación'
      });
    }

    return next();
  };
}

router.get('/', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']), listarSolicitudes);
router.get('/:id', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']), obtenerSolicitudPorId);
router.post('/', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION']), crearSolicitud);
router.post('/:id/aprobar', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), aprobarSolicitud);
router.post('/:id/rechazar', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), rechazarSolicitud);

module.exports = router;
