const express = require('express');
const autenticarJWT = require('../middleware/auth.middleware');
const { login, logout, obtenerSesionActual } = require('../controllers/auth.controller');

const router = express.Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', autenticarJWT, obtenerSesionActual);

module.exports = router;
