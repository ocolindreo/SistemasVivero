const express = require('express');
const autenticarJWT = require('../middleware/auth.middleware');
const { listarRoles } = require('../controllers/roles.controller');

const router = express.Router();

router.get('/', autenticarJWT, listarRoles);

module.exports = router;
