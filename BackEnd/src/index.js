const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Importar la conexión a la base de datos
const pool = require('./config/database');
const authRoutes = require('./routes/auth.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const rolesRoutes = require('./routes/roles.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/roles', rolesRoutes);

// Rutas de prueba
app.get('/', (req, res) => {
  res.json({
    mensaje: 'Sistema Vivero Municipal - API',
    version: '1.0.0',
    estado: 'En desarrollo'
  });
});

// Ruta de prueba para verificar la conexión a BD
app.get('/api/test', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query('SELECT 1 as test');
    connection.release();
    
    res.json({
      mensaje: 'Conexión a BD exitosa',
      resultado: rows
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error al conectar a la base de datos',
      mensaje: error.message
    });
  }
});

// Manejo de errores para rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    ruta: req.path
  });
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`📍 Ambiente: ${process.env.NODE_ENV}`);
});
