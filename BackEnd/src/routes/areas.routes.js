const express = require('express');
const autenticarJWT = require('../middleware/auth.middleware');
const {
  listarAreas,
  obtenerAreaPorId,
  crearArea,
  actualizarArea,
  inactivarArea,
  reactivarArea
} = require('../controllers/areas.controller');

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

router.get('/', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']), listarAreas);
router.get('/:id', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']), obtenerAreaPorId);
router.post('/', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), crearArea);
router.put('/:id', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), actualizarArea);
router.patch('/:id/inactivar', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), inactivarArea);
router.patch('/:id/reactivar', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), reactivarArea);

module.exports = router;