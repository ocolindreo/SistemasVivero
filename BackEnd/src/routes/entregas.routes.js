const express = require('express');
const autenticarJWT = require('../middleware/auth.middleware');
const {
  listarEntregas,
  obtenerEntregaPorId,
  crearEntrega,
  prepararEntrega,
  marcarListaEntrega,
  confirmarEntrega,
} = require('../controllers/entregas.controller');

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

router.get('/', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']), listarEntregas);
router.get('/:id', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']), obtenerEntregaPorId);
router.post('/', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), crearEntrega);
router.post('/:id/preparar', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), prepararEntrega);
router.post('/:id/lista', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), marcarListaEntrega);
router.post('/:id/confirmar', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), confirmarEntrega);

module.exports = router;
