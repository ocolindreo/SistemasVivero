const readline = require('readline');
const bcrypt = require('bcrypt');
const pool = require('../config/database');

const SALT_ROUNDS = 10;

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function ask(rl, question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
}

function askHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let password = '';

    stdout.write(question);
    stdin.resume();
    stdin.setRawMode?.(true);
    stdin.setEncoding('utf8');

    const onData = character => {
      if (character === '\u0003') {
        cleanup();
        reject(new Error('Operación cancelada'));
        return;
      }

      if (character === '\r' || character === '\n') {
        cleanup();
        stdout.write('\n');
        resolve(password);
        return;
      }

      if (character === '\u0008' || character === '\u007f') {
        password = password.slice(0, -1);
        return;
      }

      password += character;
    };

    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode?.(false);
      stdin.pause();
    };

    stdin.on('data', onData);
  });
}

function validateRequiredFields(fields) {
  const missingFields = Object.entries(fields)
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missingFields.length > 0) {
    throw new Error(`Campos obligatorios vacíos: ${missingFields.join(', ')}`);
  }
}

async function createAdmin() {
  const rl = createInterface();

  try {
    const username = await ask(rl, 'Username: ');
    const email = await ask(rl, 'Correo electrónico: ');
    const nombres = await ask(rl, 'Nombres: ');
    const apellidos = await ask(rl, 'Apellidos: ');
    const telefono = await ask(rl, 'Teléfono (opcional): ');
    rl.close();

    validateRequiredFields({ username, email, nombres, apellidos });

    const password = await askHidden('Contraseña inicial: ');
    validateRequiredFields({ password });

    const [roles] = await pool.execute(
      'SELECT rol_id FROM rol_roles WHERE rol_codigo = ? AND rol_estado = 1 LIMIT 1',
      ['ADMIN']
    );

    if (roles.length === 0) {
      throw new Error('No existe un rol ADMIN activo en rol_roles');
    }

    const adminRoleId = roles[0].rol_id;
    const [existingUsers] = await pool.execute(
      'SELECT usu_id FROM usu_usuarios WHERE usu_username = ? OR usu_email = ? LIMIT 1',
      [username, email]
    );

    if (existingUsers.length > 0) {
      console.log('El usuario ya existe. No se creó ningún usuario nuevo.');
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await pool.execute(
      `INSERT INTO usu_usuarios
        (usu_username, usu_email, usu_password, usu_nombres, usu_apellidos, usu_telefono, usu_id_rol)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [username, email, passwordHash, nombres, apellidos, telefono || null, adminRoleId]
    );

    console.log(`Usuario administrador creado correctamente: ${username}`);
  } finally {
    if (!rl.closed) {
      rl.close();
    }
    await pool.end();
  }
}

createAdmin().catch(error => {
  console.error(`No se pudo crear el usuario administrador: ${error.message}`);
  process.exitCode = 1;
});
