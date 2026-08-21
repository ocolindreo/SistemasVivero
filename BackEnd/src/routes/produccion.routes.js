const express = require('express');
const autenticarJWT = require('../middleware/auth.middleware');
const {
  listarLotes,
  obtenerLotePorId,
  listarEtapasPorLote,
  listarResponsablesProduccion,
  crearLote,
  actualizarObservacionesLote,
  avanzarEtapaLote,
  cancelarLote,
} = require('../controllers/produccion.controller');

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

router.get('/lotes', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']), listarLotes);
router.get('/lotes/:id', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']), obtenerLotePorId);
router.get('/lotes/:id/etapas', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']), listarEtapasPorLote);
router.get('/responsables', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']), listarResponsablesProduccion);

router.post('/lotes', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), crearLote);
router.put('/lotes/:id', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), actualizarObservacionesLote);
router.post('/lotes/:id/avanzar-etapa', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), avanzarEtapaLote);
router.post('/lotes/:id/cancelar', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), cancelarLote);

module.exports = router;
