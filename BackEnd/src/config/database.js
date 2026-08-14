const mysql = require('mysql2/promise');
require('dotenv').config();

// Crear un pool de conexiones a la base de datos
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'vivero_municipal',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Probar la conexión al iniciar
pool.getConnection()
  .then(connection => {
    console.log('✓ Conexión a MySQL establecida correctamente');
    connection.release();
  })
  .catch(err => {
    console.warn('⚠ Error al conectar a MySQL:', err.message);
    console.warn('⚠ El servidor seguirá ejecutándose, pero sin acceso a BD');
  });

module.exports = pool;
