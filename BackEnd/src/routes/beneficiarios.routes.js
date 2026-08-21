const express = require('express');
const autenticarJWT = require('../middleware/auth.middleware');
const {
  listarBeneficiarios,
  obtenerBeneficiarioPorId,
  crearBeneficiario,
  actualizarBeneficiario,
  inactivarBeneficiario,
  reactivarBeneficiario
} = require('../controllers/beneficiarios.controller');

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

router.get('/', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']), listarBeneficiarios);
router.get('/:id', autenticarJWT, autorizarRoles(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']), obtenerBeneficiarioPorId);
router.post('/', autenticarJWT, autorizarRoles(['ADMIN', 'GESTION']), crearBeneficiario);
router.put('/:id', autenticarJWT, autorizarRoles(['ADMIN', 'GESTION']), actualizarBeneficiario);
router.patch('/:id/inactivar', autenticarJWT, autorizarRoles(['ADMIN', 'GESTION']), inactivarBeneficiario);
router.patch('/:id/reactivar', autenticarJWT, autorizarRoles(['ADMIN', 'GESTION']), reactivarBeneficiario);

module.exports = router;