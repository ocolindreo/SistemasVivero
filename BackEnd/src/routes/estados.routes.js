const express = require('express');
const autenticarJWT = require('../middleware/auth.middleware');
const {
  listarEstados,
  obtenerEstadoPorId
} = require('../controllers/estados.controller');

const router = express.Router();

router.get('/', autenticarJWT, listarEstados);
router.get('/:id', autenticarJWT, obtenerEstadoPorId);

module.exports = router;