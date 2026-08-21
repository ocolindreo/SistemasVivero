const express = require('express');
const autenticarJWT = require('../middleware/auth.middleware');
const {
  listarEspecies,
  obtenerEspeciePorId,
  crearEspecie,
  actualizarEspecie,
  inactivarEspecie,
  reactivarEspecie
} = require('../controllers/especies.controller');

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

router.get('/', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']), listarEspecies);
router.get('/:id', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']), obtenerEspeciePorId);
router.post('/', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), crearEspecie);
router.put('/:id', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), actualizarEspecie);
router.patch('/:id/inactivar', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), inactivarEspecie);
router.patch('/:id/reactivar', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO']), reactivarEspecie);

module.exports = router;