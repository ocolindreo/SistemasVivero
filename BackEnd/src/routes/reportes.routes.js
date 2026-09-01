const express = require('express');
const autenticarJWT = require('../middleware/auth.middleware');
const {
  obtenerDashboard,
  obtenerReporteGeneral,
  obtenerReporteProduccion,
  obtenerReporteInventario,
  obtenerReporteSolicitudes,
  obtenerReporteEntregas,
} = require('../controllers/reportes.controller');

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

router.get('/dashboard', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), obtenerDashboard);
router.get('/general', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), obtenerReporteGeneral);
router.get('/produccion', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), obtenerReporteProduccion);
router.get('/inventario', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), obtenerReporteInventario);
router.get('/solicitudes', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), obtenerReporteSolicitudes);
router.get('/entregas', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), obtenerReporteEntregas);

module.exports = router;
