const express = require('express');
const autenticarJWT = require('../middleware/auth.middleware');
const {
	listarUsuarios,
	obtenerUsuarioPorId,
	crearUsuario,
	actualizarUsuario,
	inactivarUsuario,
	reactivarUsuario
} = require('../controllers/usuarios.controller');

const router = express.Router();

router.get('/', autenticarJWT, listarUsuarios);
router.get('/:id', autenticarJWT, obtenerUsuarioPorId);
router.post('/', autenticarJWT, crearUsuario);
router.put('/:id', autenticarJWT, actualizarUsuario);
router.patch('/:id/inactivar', autenticarJWT, inactivarUsuario);
router.patch('/:id/reactivar', autenticarJWT, reactivarUsuario);

module.exports = router;
