const pool = require('../config/database');

const ROLES_LECTURA = new Set(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']);
const ROLES_ESCRITURA = new Set(['ADMIN', 'VIVERO']);

function esIdValido(value) {
  const parsed = Number(value);
  return /^\d+$/.test(String(value)) && Number.isSafeInteger(parsed) && parsed > 0;
}

function validarEnteroPositivo(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizarTextoObligatorio(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function normalizarTextoOpcional(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function requiereRol(rolesPermitidos, req, res) {
  if (!rolesPermitidos.has(req.usuario.rol_codigo)) {
    res.status(403).json({
      ok: false,
      mensaje: 'No tiene permisos para realizar esta operación'
    });
    return true;
  }

  return false;
}

async function registrarAuditoria({ connection, userId, action, recordId, previousData, newData, request, observation }) {
  await connection.execute(
    `INSERT INTO aud_auditorias (
      aud_id_usuario,
      aud_accion,
      aud_tabla,
      aud_id_registro,
      aud_datos_anteriores,
      aud_datos_nuevos,
      aud_ip,
      aud_navegador,
      aud_observacion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      action,
      'inv_inventario',
      recordId,
      previousData ? JSON.stringify(previousData) : null,
      newData ? JSON.stringify(newData) : null,
      request.ip || null,
      request.get('user-agent') || null,
      observation || null
    ]
  );
}

function mapInventario(row) {
  const cantidadTotal = Number(row.inv_cantidad_total);
  const cantidadReservada = Number(row.inv_cantidad_reservada);

  return {
    id: row.inv_id,
    lote: {
      id: row.lot_id,
      codigo: row.lot_codigo,
    },
    especie: {
      id: row.esp_id,
      codigo: row.esp_codigo,
      nombre_comun: row.esp_nombre_comun,
    },
    area: {
      id: row.are_id,
      codigo: row.are_codigo,
      nombre: row.are_nombre,
    },
    cantidad_total: cantidadTotal,
    cantidad_reservada: cantidadReservada,
    cantidad_disponible: cantidadTotal - cantidadReservada,
    fecha_disponibilidad: row.inv_fecha_disponibilidad,
    estado: row.inv_estado,
  };
}

async function obtenerInventarioBase(connection, inventarioId, lock = false) {
  const [rows] = await connection.execute(
    `SELECT
       inv.inv_id,
       inv.inv_id_lote,
       inv.inv_id_area,
       inv.inv_cantidad_total,
       inv.inv_cantidad_reservada,
       inv.inv_fecha_disponibilidad,
       inv.inv_estado,
       l.lot_id,
       l.lot_codigo,
       sp.esp_id,
       sp.esp_codigo,
       sp.esp_nombre_comun,
       ar.are_id,
       ar.are_codigo,
       ar.are_nombre
     FROM inv_inventario inv
     INNER JOIN lot_lotes l ON l.lot_id = inv.inv_id_lote
     INNER JOIN esp_especies sp ON sp.esp_id = l.lot_id_especie
     INNER JOIN are_areas_vivero ar ON ar.are_id = inv.inv_id_area
     WHERE inv.inv_id = ?
     LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
    [inventarioId]
  );

  return rows[0] || null;
}

async function listarInventario(req, res) {
  if (requiereRol(ROLES_LECTURA, req, res)) {
    return;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         inv.inv_id,
         inv.inv_cantidad_total,
         inv.inv_cantidad_reservada,
         inv.inv_fecha_disponibilidad,
         inv.inv_estado,
         l.lot_id,
         l.lot_codigo,
         sp.esp_id,
         sp.esp_codigo,
         sp.esp_nombre_comun,
         ar.are_id,
         ar.are_codigo,
         ar.are_nombre
       FROM inv_inventario inv
       INNER JOIN lot_lotes l ON l.lot_id = inv.inv_id_lote
       INNER JOIN esp_especies sp ON sp.esp_id = l.lot_id_especie
       INNER JOIN are_areas_vivero ar ON ar.are_id = inv.inv_id_area
       ORDER BY inv.inv_fecha_creacion DESC, inv.inv_id DESC`
    );

    return res.status(200).json({
      ok: true,
      inventario: rows.map(mapInventario),
    });
  } catch (error) {
    console.error('Error al listar inventario:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

async function obtenerInventarioPorId(req, res) {
  if (requiereRol(ROLES_LECTURA, req, res)) {
    return;
  }

  const { id } = req.params;

  if (!esIdValido(id)) {
    return res.status(400).json({ ok: false, mensaje: 'El id debe ser un entero positivo' });
  }

  try {
    const inventario = await obtenerInventarioBase(pool, Number(id));

    if (!inventario) {
      return res.status(404).json({ ok: false, mensaje: 'Inventario no encontrado' });
    }

    return res.status(200).json({
      ok: true,
      inventario: mapInventario(inventario),
    });
  } catch (error) {
    console.error('Error al consultar inventario:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

async function listarMovimientosInventario(req, res) {
  if (requiereRol(ROLES_LECTURA, req, res)) {
    return;
  }

  const { id } = req.params;

  if (!esIdValido(id)) {
    return res.status(400).json({ ok: false, mensaje: 'El id debe ser un entero positivo' });
  }

  try {
    const inventario = await obtenerInventarioBase(pool, Number(id));

    if (!inventario) {
      return res.status(404).json({ ok: false, mensaje: 'Inventario no encontrado' });
    }

    const [rows] = await pool.execute(
      `SELECT
         m.mov_id,
         m.mov_tipo,
         m.mov_cantidad,
         m.mov_motivo,
         m.mov_referencia,
         m.mov_id_referencia,
         m.mov_fecha,
         m.mov_observaciones,
         m.mov_estado,
         u.usu_id,
         u.usu_username,
         u.usu_nombres,
         u.usu_apellidos
       FROM mov_movimientos_inventario m
       INNER JOIN usu_usuarios u ON u.usu_id = m.mov_id_usuario
       WHERE m.mov_id_inventario = ?
       ORDER BY m.mov_fecha DESC, m.mov_id DESC`,
      [Number(id)]
    );

    return res.status(200).json({
      ok: true,
      inventario: {
        id: inventario.inv_id,
        lote: {
          id: inventario.lot_id,
          codigo: inventario.lot_codigo,
        },
      },
      movimientos: rows.map((row) => ({
        id: row.mov_id,
        tipo: row.mov_tipo,
        cantidad: row.mov_cantidad,
        motivo: row.mov_motivo,
        referencia: row.mov_referencia,
        id_referencia: row.mov_id_referencia,
        fecha: row.mov_fecha,
        observaciones: row.mov_observaciones,
        usuario: {
          id: row.usu_id,
          username: row.usu_username,
          nombres: row.usu_nombres,
          apellidos: row.usu_apellidos,
        },
        estado: row.mov_estado,
      })),
    });
  } catch (error) {
    console.error('Error al listar movimientos de inventario:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

async function registrarMovimientoCantidad({ req, res, tipo, action, aplicarCantidad, permitirInventarioEnCero = false }) {
  if (requiereRol(ROLES_ESCRITURA, req, res)) {
    return;
  }

  const { id } = req.params;

  if (!esIdValido(id)) {
    return res.status(400).json({ ok: false, mensaje: 'El id debe ser un entero positivo' });
  }

  const body = req.body || {};
  const cantidad = validarEnteroPositivo(body.cantidad);
  const motivo = normalizarTextoObligatorio(body.motivo);
  const observaciones = normalizarTextoOpcional(body.observaciones);

  if (!cantidad) {
    return res.status(400).json({ ok: false, mensaje: 'La cantidad debe ser un entero positivo' });
  }

  if (!motivo) {
    return res.status(400).json({ ok: false, mensaje: 'El motivo es obligatorio' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const inventario = await obtenerInventarioBase(connection, Number(id), true);

    if (!inventario) {
      await connection.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Inventario no encontrado' });
    }

    if (inventario.inv_estado !== 1 && (!permitirInventarioEnCero || Number(inventario.inv_cantidad_total) !== 0)) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'El inventario no se encuentra operativo' });
    }

    const cantidadTotal = Number(inventario.inv_cantidad_total);
    const cantidadReservada = Number(inventario.inv_cantidad_reservada);
    const cantidadDisponible = cantidadTotal - cantidadReservada;

    const resultado = aplicarCantidad({ cantidadTotal, cantidadReservada, cantidadDisponible, cantidad });
    if (resultado.error) {
      await connection.rollback();
      return res.status(400).json({ ok: false, mensaje: resultado.error });
    }

    await connection.execute(
      `UPDATE inv_inventario
       SET inv_cantidad_total = ?,
           inv_estado = ?,
           inv_fecha_modificacion = CURRENT_TIMESTAMP,
           inv_id_usuario_modificacion = ?
       WHERE inv_id = ?`,
      [resultado.nuevoTotal, resultado.nuevoEstado, req.usuario.usu_id, Number(id)]
    );

    await connection.execute(
      `INSERT INTO mov_movimientos_inventario (
         mov_id_inventario,
         mov_tipo,
         mov_cantidad,
         mov_motivo,
         mov_id_usuario,
         mov_referencia,
         mov_id_referencia,
         mov_observaciones,
         mov_estado
       ) VALUES (?, ?, ?, ?, ?, 'INVENTARIO', ?, ?, 1)`,
      [Number(id), tipo, cantidad, motivo, req.usuario.usu_id, Number(id), observaciones]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action,
      recordId: Number(id),
      previousData: {
        inv_cantidad_total: cantidadTotal,
        inv_cantidad_reservada: cantidadReservada,
        inv_estado: inventario.inv_estado,
      },
      newData: {
        inv_cantidad_total: resultado.nuevoTotal,
        inv_cantidad_reservada: cantidadReservada,
        inv_estado: resultado.nuevoEstado,
        movimiento_tipo: tipo,
        movimiento_cantidad: cantidad,
      },
      request: req,
      observation: motivo,
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Movimiento registrado correctamente',
      inventario: {
        id: Number(id),
        cantidad_total: resultado.nuevoTotal,
        cantidad_reservada: cantidadReservada,
        cantidad_disponible: resultado.nuevoTotal - cantidadReservada,
        estado: resultado.nuevoEstado,
      },
      movimiento: {
        tipo,
        cantidad,
        motivo,
        observaciones,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al registrar movimiento de inventario:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  } finally {
    connection.release();
  }
}

function registrarPerdida(req, res) {
  return registrarMovimientoCantidad({
    req,
    res,
    tipo: 'PERDIDA',
    action: 'PERDIDA',
    aplicarCantidad: ({ cantidadDisponible, cantidadTotal, cantidadReservada, cantidad }) => {
      if (cantidad > cantidadDisponible) {
        return { error: 'La cantidad no puede superar la cantidad disponible' };
      }

      const nuevoTotal = cantidadTotal - cantidad;
      if (nuevoTotal < cantidadReservada) {
        return { error: 'La cantidad total no puede quedar por debajo de la cantidad reservada' };
      }

      return { nuevoTotal, nuevoEstado: nuevoTotal === 0 ? 0 : 1 };
    }
  });
}

function registrarAjustePositivo(req, res) {
  return registrarMovimientoCantidad({
    req,
    res,
    tipo: 'AJUSTE_POSITIVO',
    action: 'AJUSTE_POSITIVO',
    permitirInventarioEnCero: true,
    aplicarCantidad: ({ cantidadTotal, cantidadReservada, cantidad }) => {
      const nuevoTotal = cantidadTotal + cantidad;
      return { nuevoTotal, nuevoEstado: nuevoTotal > cantidadReservada ? 1 : 0 };
    }
  });
}

function registrarAjusteNegativo(req, res) {
  return registrarMovimientoCantidad({
    req,
    res,
    tipo: 'AJUSTE_NEGATIVO',
    action: 'AJUSTE_NEGATIVO',
    aplicarCantidad: ({ cantidadDisponible, cantidadTotal, cantidadReservada, cantidad }) => {
      if (cantidad > cantidadDisponible) {
        return { error: 'La cantidad no puede superar la cantidad disponible' };
      }

      const nuevoTotal = cantidadTotal - cantidad;
      if (nuevoTotal < cantidadReservada) {
        return { error: 'La cantidad total no puede quedar por debajo de la cantidad reservada' };
      }

      return { nuevoTotal, nuevoEstado: nuevoTotal === 0 ? 0 : 1 };
    }
  });
}

module.exports = {
  listarInventario,
  obtenerInventarioPorId,
  listarMovimientosInventario,
  registrarPerdida,
  registrarAjustePositivo,
  registrarAjusteNegativo,
};
