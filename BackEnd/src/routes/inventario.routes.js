const express = require('express');
const autenticarJWT = require('../middleware/auth.middleware');
const {
  listarInventario,
  obtenerInventarioPorId,
  listarMovimientosInventario,
  registrarPerdida,
  registrarAjustePositivo,
  registrarAjusteNegativo,
} = require('../controllers/inventario.controller');

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

router.get('/', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']), listarInventario);
router.get('/:id', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']), obtenerInventarioPorId);
router.get('/:id/movimientos', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']), listarMovimientosInventario);

router.post('/:id/perdida', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), registrarPerdida);
router.post('/:id/ajuste-positivo', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), registrarAjustePositivo);
router.post('/:id/ajuste-negativo', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), registrarAjusteNegativo);

module.exports = router;
