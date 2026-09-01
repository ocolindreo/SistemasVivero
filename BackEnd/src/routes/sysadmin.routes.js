const express = require('express');
const autenticarJWT = require('../middleware/auth.middleware');
const {
  listarUsuarios,
  listarEspecies,
  listarAreas,
  listarBeneficiarios,
  actualizarVisibilidad,
  restablecerPassword,
} = require('../controllers/sysadmin.controller');

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

router.get('/usuarios', autenticarJWT, autorizarRoles(['ADMIN']), listarUsuarios);
router.get('/especies', autenticarJWT, autorizarRoles(['ADMIN']), listarEspecies);
router.get('/areas', autenticarJWT, autorizarRoles(['ADMIN']), listarAreas);
router.get('/beneficiarios', autenticarJWT, autorizarRoles(['ADMIN']), listarBeneficiarios);
router.patch('/:modulo/:id/visibilidad', autenticarJWT, autorizarRoles(['ADMIN']), actualizarVisibilidad);
router.patch('/usuarios/:id/restablecer-password', autenticarJWT, autorizarRoles(['ADMIN']), restablecerPassword);

module.exports = router;
