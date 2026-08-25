const pool = require('../config/database');

const ROLES_LECTURA = new Set(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']);
const ROLES_CREACION = new Set(['ADMIN', 'VIVERO', 'GESTION']);
const ROLES_DECISION = new Set(['ADMIN', 'VIVERO']);

function esIdValido(value) {
  const parsed = Number(value);
  return /^\d+$/.test(String(value)) && Number.isSafeInteger(parsed) && parsed > 0;
}

function validarEnteroPositivo(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizarTextoOpcional(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizarTextoObligatorio(value) {
  const normalized = normalizarTextoOpcional(value);
  return normalized;
}

function normalizarFecha(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }

  return trimmed;
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

async function registrarAuditoria({ connection, userId, action, table, recordId, previousData, newData, request, observation }) {
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
      table,
      recordId,
      previousData ? JSON.stringify(previousData) : null,
      newData ? JSON.stringify(newData) : null,
      request.ip || null,
      request.get('user-agent') || null,
      observation || null
    ]
  );
}

async function obtenerEstadoSolicitud(connection, codigo) {
  const [rows] = await connection.execute(
    `SELECT est_id, est_codigo, est_descripcion
     FROM est_estados
     WHERE est_modulo = 'SOLICITUD'
       AND est_codigo = ?
       AND est_estado = 1
     LIMIT 1`,
    [codigo]
  );

  return rows[0] || null;
}

async function obtenerSolicitudBase(connection, solicitudId, lock = false) {
  const [rows] = await connection.execute(
    `SELECT
       s.sol_id,
       s.sol_codigo,
       s.sol_id_beneficiario,
       s.sol_fecha_solicitud,
       s.sol_fecha_requerida,
       s.sol_motivo,
       s.sol_destino_descripcion,
       s.sol_observaciones,
       s.sol_estado,
       s.sol_id_estado_proceso,
       s.sol_id_usuario_creacion,
       s.sol_fecha_creacion,
       s.sol_id_usuario_revision,
       s.sol_fecha_revision,
       s.sol_observacion_revision,
       s.sol_fecha_modificacion,
       b.ben_id,
       b.ben_codigo,
       b.ben_tipo,
       b.ben_nombre,
       b.ben_estado,
       e.est_codigo,
       e.est_descripcion,
       u.usu_id,
       u.usu_username,
       u.usu_nombres,
       u.usu_apellidos
     FROM sol_solicitudes s
     INNER JOIN ben_beneficiarios b ON b.ben_id = s.sol_id_beneficiario
     INNER JOIN est_estados e ON e.est_id = s.sol_id_estado_proceso
     INNER JOIN usu_usuarios u ON u.usu_id = s.sol_id_usuario_creacion
     WHERE s.sol_id = ?
     LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
    [solicitudId]
  );

  return rows[0] || null;
}

function mapSolicitud(row) {
  return {
    id: row.sol_id,
    codigo: row.sol_codigo,
    fecha_solicitud: row.sol_fecha_solicitud,
    fecha_requerida: row.sol_fecha_requerida,
    motivo: row.sol_motivo,
    destino_descripcion: row.sol_destino_descripcion,
    observaciones: row.sol_observaciones,
    estado: {
      id: row.sol_id_estado_proceso,
      codigo: row.est_codigo,
      descripcion: row.est_descripcion,
    },
    beneficiario: {
      id: row.ben_id,
      codigo: row.ben_codigo,
      tipo: row.ben_tipo,
      nombre: row.ben_nombre,
      estado: row.ben_estado,
    },
    usuario_creacion: {
      id: row.usu_id,
      username: row.usu_username,
      nombres: row.usu_nombres,
      apellidos: row.usu_apellidos,
    },
    fecha_creacion: row.sol_fecha_creacion,
    usuario_revision: row.sol_id_usuario_revision ? {
      id: row.sol_id_usuario_revision,
    } : null,
    fecha_revision: row.sol_fecha_revision,
    observacion_revision: row.sol_observacion_revision,
  };
}

async function obtenerDetalleRows(connection, solicitudId, lock = false) {
  const [rows] = await connection.execute(
    `SELECT
       d.sod_id,
       d.sod_id_solicitud,
       d.sod_id_especie,
       d.sod_id_inventario,
       d.sod_cantidad_solicitada,
       d.sod_cantidad_aprobada,
       d.sod_cantidad_entregada,
       d.sod_observaciones,
       d.sod_estado,
       inv.inv_id,
       inv.inv_id_lote,
       inv.inv_id_area,
       inv.inv_cantidad_total,
       inv.inv_cantidad_reservada,
       inv.inv_estado,
       l.lot_codigo,
       sp.esp_id,
       sp.esp_codigo,
       sp.esp_nombre_comun,
       ar.are_id,
       ar.are_codigo,
       ar.are_nombre
     FROM sod_solicitudes_detalle d
     INNER JOIN inv_inventario inv ON inv.inv_id = d.sod_id_inventario
     INNER JOIN lot_lotes l ON l.lot_id = inv.inv_id_lote
     INNER JOIN esp_especies sp ON sp.esp_id = d.sod_id_especie
     INNER JOIN are_areas_vivero ar ON ar.are_id = inv.inv_id_area
     WHERE d.sod_id_solicitud = ?
     ORDER BY d.sod_id ASC
     ${lock ? 'FOR UPDATE' : ''}`,
    [solicitudId]
  );

  return rows;
}

function mapDetalle(row) {
  return {
    id: row.sod_id,
    inventario: {
      id: row.inv_id,
      cantidad_total: row.inv_cantidad_total,
      cantidad_reservada: row.inv_cantidad_reservada,
      cantidad_disponible: Number(row.inv_cantidad_total) - Number(row.inv_cantidad_reservada),
      estado: row.inv_estado,
    },
    lote: {
      id: row.inv_id_lote,
      codigo: row.lot_codigo,
    },
    especie: {
      id: row.esp_id,
      codigo: row.esp_codigo,
      nombre_comun: row.esp_nombre_comun,
    },
    cantidad_solicitada: row.sod_cantidad_solicitada,
    cantidad_aprobada: row.sod_cantidad_aprobada,
    cantidad_entregada: row.sod_cantidad_entregada,
    observaciones: row.sod_observaciones,
    estado: row.sod_estado,
  };
}

async function listarSolicitudes(req, res) {
  if (requiereRol(ROLES_LECTURA, req, res)) return;

  try {
    const [rows] = await pool.execute(
      `SELECT
         s.sol_id,
         s.sol_codigo,
         s.sol_fecha_solicitud,
         s.sol_fecha_requerida,
         s.sol_motivo,
         s.sol_estado,
         s.sol_id_estado_proceso,
         s.sol_fecha_creacion,
         b.ben_id,
         b.ben_codigo,
         b.ben_tipo,
         b.ben_nombre,
         e.est_codigo,
         e.est_descripcion,
         u.usu_id,
         u.usu_username,
         u.usu_nombres,
         u.usu_apellidos,
         COALESCE(SUM(d.sod_cantidad_solicitada), 0) AS total_solicitado,
         COALESCE(SUM(d.sod_cantidad_aprobada), 0) AS total_aprobado
       FROM sol_solicitudes s
       INNER JOIN ben_beneficiarios b ON b.ben_id = s.sol_id_beneficiario
       INNER JOIN est_estados e ON e.est_id = s.sol_id_estado_proceso
       INNER JOIN usu_usuarios u ON u.usu_id = s.sol_id_usuario_creacion
       LEFT JOIN sod_solicitudes_detalle d ON d.sod_id_solicitud = s.sol_id
       GROUP BY s.sol_id, b.ben_id, e.est_id, u.usu_id
       ORDER BY s.sol_fecha_creacion DESC, s.sol_id DESC`
    );

    return res.status(200).json({
      ok: true,
      solicitudes: rows.map((row) => ({
        id: row.sol_id,
        codigo: row.sol_codigo,
        fecha_solicitud: row.sol_fecha_solicitud,
        fecha_requerida: row.sol_fecha_requerida,
        motivo: row.sol_motivo,
        estado: {
          id: row.sol_id_estado_proceso,
          codigo: row.est_codigo,
          descripcion: row.est_descripcion,
        },
        beneficiario: {
          id: row.ben_id,
          codigo: row.ben_codigo,
          tipo: row.ben_tipo,
          nombre: row.ben_nombre,
        },
        total_solicitado: Number(row.total_solicitado),
        total_aprobado: Number(row.total_aprobado),
        usuario_creacion: {
          id: row.usu_id,
          username: row.usu_username,
          nombres: row.usu_nombres,
          apellidos: row.usu_apellidos,
        },
        fecha_creacion: row.sol_fecha_creacion,
      })),
    });
  } catch (error) {
    console.error('Error al listar solicitudes:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

async function obtenerSolicitudPorId(req, res) {
  if (requiereRol(ROLES_LECTURA, req, res)) return;

  const { id } = req.params;
  if (!esIdValido(id)) {
    return res.status(400).json({ ok: false, mensaje: 'El id debe ser un entero positivo' });
  }

  try {
    const solicitud = await obtenerSolicitudBase(pool, Number(id));
    if (!solicitud) {
      return res.status(404).json({ ok: false, mensaje: 'Solicitud no encontrada' });
    }

    const detalles = await obtenerDetalleRows(pool, Number(id));
    return res.status(200).json({
      ok: true,
      solicitud: {
        ...mapSolicitud(solicitud),
        detalles: detalles.map(mapDetalle),
      },
    });
  } catch (error) {
    console.error('Error al consultar solicitud:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

async function crearSolicitud(req, res) {
  if (requiereRol(ROLES_CREACION, req, res)) return;

  const body = req.body || {};
  const beneficiarioId = validarEnteroPositivo(body.beneficiario_id);
  const fechaSolicitud = normalizarFecha(body.fecha_solicitud);
  const fechaRequerida = body.fecha_requerida ? normalizarFecha(body.fecha_requerida) : null;
  const motivo = normalizarTextoOpcional(body.motivo);
  const destinoDescripcion = normalizarTextoOpcional(body.destino_descripcion);
  const observaciones = normalizarTextoOpcional(body.observaciones);
  const detalles = body.detalles;

  if (!beneficiarioId || !fechaSolicitud || (body.fecha_requerida && !fechaRequerida) || !Array.isArray(detalles) || detalles.length === 0) {
    return res.status(400).json({ ok: false, mensaje: 'Los datos requeridos son inválidos' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [beneficiarios] = await connection.execute(
      `SELECT ben_id, ben_nombre, ben_estado
       FROM ben_beneficiarios
       WHERE ben_id = ?
       LIMIT 1`,
      [beneficiarioId]
    );

    if (beneficiarios.length === 0 || Number(beneficiarios[0].ben_estado) !== 1) {
      await connection.rollback();
      return res.status(400).json({ ok: false, mensaje: 'El beneficiario indicado no es válido o no está activo' });
    }

    const inventariosUsados = new Set();
    const detallesValidados = [];

    for (const detalle of detalles) {
      const inventarioId = validarEnteroPositivo(detalle?.inventario_id);
      const cantidad = validarEnteroPositivo(detalle?.cantidad);

      if (!inventarioId || !cantidad || inventariosUsados.has(inventarioId)) {
        await connection.rollback();
        return res.status(400).json({ ok: false, mensaje: 'Los detalles contienen inventarios o cantidades inválidas' });
      }

      inventariosUsados.add(inventarioId);

      const [inventarios] = await connection.execute(
        `SELECT
           inv.inv_id,
           inv.inv_cantidad_total,
           inv.inv_cantidad_reservada,
           inv.inv_estado,
           l.lot_id_especie
         FROM inv_inventario inv
         INNER JOIN lot_lotes l ON l.lot_id = inv.inv_id_lote
         WHERE inv.inv_id = ?
         LIMIT 1`,
        [inventarioId]
      );

      if (inventarios.length === 0) {
        await connection.rollback();
        return res.status(400).json({ ok: false, mensaje: `El inventario ${inventarioId} no existe` });
      }

      const inventario = inventarios[0];
      const disponible = Number(inventario.inv_cantidad_total) - Number(inventario.inv_cantidad_reservada);
      if (Number(inventario.inv_estado) !== 1 || cantidad > disponible) {
        await connection.rollback();
        return res.status(400).json({ ok: false, mensaje: `La cantidad solicitada para el inventario ${inventarioId} no está disponible` });
      }

      detallesValidados.push({
        inventarioId,
        especieId: inventario.lot_id_especie,
        cantidad,
        observaciones: normalizarTextoOpcional(detalle.observaciones),
      });
    }

    const estadoRegistrada = await obtenerEstadoSolicitud(connection, 'REGISTRADA');
    if (!estadoRegistrada) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'No existe el estado REGISTRADA activo para SOLICITUD' });
    }

    const [solicitudResult] = await connection.execute(
      `INSERT INTO sol_solicitudes (
         sol_codigo,
         sol_id_beneficiario,
         sol_fecha_solicitud,
         sol_fecha_requerida,
         sol_motivo,
         sol_destino_descripcion,
         sol_observaciones,
         sol_estado,
         sol_id_estado_proceso,
         sol_id_usuario_creacion
       ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        beneficiarioId,
        fechaSolicitud,
        fechaRequerida,
        motivo,
        destinoDescripcion,
        observaciones,
        estadoRegistrada.est_id,
        req.usuario.usu_id,
      ]
    );

    const codigoSolicitud = `SOL-${String(solicitudResult.insertId).padStart(6, '0')}`;
    await connection.execute(
      `UPDATE sol_solicitudes SET sol_codigo = ? WHERE sol_id = ?`,
      [codigoSolicitud, solicitudResult.insertId]
    );

    for (const detalle of detallesValidados) {
      await connection.execute(
        `INSERT INTO sod_solicitudes_detalle (
           sod_id_solicitud,
           sod_id_especie,
           sod_id_inventario,
           sod_cantidad_solicitada,
           sod_cantidad_aprobada,
           sod_cantidad_entregada,
           sod_observaciones,
           sod_estado
         ) VALUES (?, ?, ?, ?, 0, 0, ?, 1)`,
        [solicitudResult.insertId, detalle.especieId, detalle.inventarioId, detalle.cantidad, detalle.observaciones]
      );
    }

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'CREATE',
      table: 'sol_solicitudes',
      recordId: solicitudResult.insertId,
      previousData: null,
      newData: {
        sol_codigo: codigoSolicitud,
        sol_id_beneficiario: beneficiarioId,
        sol_fecha_solicitud: fechaSolicitud,
        sol_id_estado_proceso: estadoRegistrada.est_id,
        detalles: detallesValidados,
      },
      request: req,
      observation: 'Solicitud registrada',
    });

    await connection.commit();

    return res.status(201).json({
      ok: true,
      mensaje: 'Solicitud registrada correctamente',
      solicitud: {
        id: solicitudResult.insertId,
        codigo: codigoSolicitud,
        estado: {
          codigo: estadoRegistrada.est_codigo,
          descripcion: estadoRegistrada.est_descripcion,
        },
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al crear solicitud:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  } finally {
    connection.release();
  }
}

async function aprobarSolicitud(req, res) {
  if (requiereRol(ROLES_DECISION, req, res)) return;

  const { id } = req.params;
  if (!esIdValido(id)) {
    return res.status(400).json({ ok: false, mensaje: 'El id debe ser un entero positivo' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const solicitud = await obtenerSolicitudBase(connection, Number(id), true);
    if (!solicitud) {
      await connection.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Solicitud no encontrada' });
    }

    if (!['REGISTRADA', 'EN_REVISION'].includes(solicitud.est_codigo)) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'La solicitud no se encuentra en un estado aprobable' });
    }

    const detalles = await obtenerDetalleRows(connection, Number(id), true);
    if (detalles.length === 0) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'La solicitud no tiene detalles para reservar' });
    }

    for (const detalle of detalles) {
      const total = Number(detalle.inv_cantidad_total);
      const reservada = Number(detalle.inv_cantidad_reservada);
      const disponible = total - reservada;
      const cantidad = Number(detalle.sod_cantidad_solicitada);

      if (Number(detalle.inv_estado) !== 1 || cantidad <= 0 || cantidad > disponible || reservada + cantidad > total) {
        await connection.rollback();
        return res.status(409).json({ ok: false, mensaje: `Stock insuficiente para el inventario ${detalle.inv_id}` });
      }
    }

    const estadoAprobada = await obtenerEstadoSolicitud(connection, 'APROBADA');
    if (!estadoAprobada) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'No existe el estado APROBADA activo para SOLICITUD' });
    }

    for (const detalle of detalles) {
      const nuevaReservada = Number(detalle.inv_cantidad_reservada) + Number(detalle.sod_cantidad_solicitada);
      await connection.execute(
        `UPDATE inv_inventario
         SET inv_cantidad_reservada = ?,
             inv_fecha_modificacion = CURRENT_TIMESTAMP,
             inv_id_usuario_modificacion = ?
         WHERE inv_id = ?`,
        [nuevaReservada, req.usuario.usu_id, detalle.inv_id]
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
         ) VALUES (?, 'RESERVA', ?, ?, ?, 'SOLICITUD', ?, ?, 1)`,
        [
          detalle.inv_id,
          detalle.sod_cantidad_solicitada,
          `Reserva por aprobación de solicitud ${solicitud.sol_codigo}`,
          req.usuario.usu_id,
          Number(id),
          `Reserva automática por aprobación de ${solicitud.sol_codigo} para ${detalle.lot_codigo}`,
        ]
      );

      await connection.execute(
        `UPDATE sod_solicitudes_detalle
         SET sod_cantidad_aprobada = sod_cantidad_solicitada,
             sod_fecha_modificacion = CURRENT_TIMESTAMP
         WHERE sod_id = ?`,
        [detalle.sod_id]
      );

      await registrarAuditoria({
        connection,
        userId: req.usuario.usu_id,
        action: 'APPROVE',
        table: 'inv_inventario',
        recordId: detalle.inv_id,
        previousData: {
          inv_cantidad_total: detalle.inv_cantidad_total,
          inv_cantidad_reservada: detalle.inv_cantidad_reservada,
        },
        newData: {
          inv_cantidad_total: detalle.inv_cantidad_total,
          inv_cantidad_reservada: nuevaReservada,
          solicitud_id: Number(id),
          solicitud_codigo: solicitud.sol_codigo,
        },
        request: req,
        observation: `Reserva por aprobación de ${solicitud.sol_codigo}`,
      });
    }

    await connection.execute(
      `UPDATE sol_solicitudes
       SET sol_id_estado_proceso = ?,
           sol_id_usuario_revision = ?,
           sol_fecha_revision = CURRENT_TIMESTAMP,
           sol_fecha_modificacion = CURRENT_TIMESTAMP,
           sol_id_usuario_modificacion = ?
       WHERE sol_id = ?`,
      [estadoAprobada.est_id, req.usuario.usu_id, req.usuario.usu_id, Number(id)]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'APPROVE',
      table: 'sol_solicitudes',
      recordId: Number(id),
      previousData: { estado_codigo: solicitud.est_codigo },
      newData: { estado_codigo: estadoAprobada.est_codigo, reservas: detalles.map((detalle) => ({ inventario_id: detalle.inv_id, cantidad: detalle.sod_cantidad_solicitada })) },
      request: req,
      observation: `Solicitud ${solicitud.sol_codigo} aprobada`,
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Solicitud aprobada y reservas registradas correctamente',
      solicitud: {
        id: Number(id),
        codigo: solicitud.sol_codigo,
        estado: {
          codigo: estadoAprobada.est_codigo,
          descripcion: estadoAprobada.est_descripcion,
        },
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al aprobar solicitud:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  } finally {
    connection.release();
  }
}

async function rechazarSolicitud(req, res) {
  if (requiereRol(ROLES_DECISION, req, res)) return;

  const { id } = req.params;
  if (!esIdValido(id)) {
    return res.status(400).json({ ok: false, mensaje: 'El id debe ser un entero positivo' });
  }

  const motivo = normalizarTextoObligatorio(req.body?.motivo);
  if (!motivo) {
    return res.status(400).json({ ok: false, mensaje: 'El motivo de rechazo es obligatorio' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const solicitud = await obtenerSolicitudBase(connection, Number(id), true);
    if (!solicitud) {
      await connection.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Solicitud no encontrada' });
    }

    if (!['REGISTRADA', 'EN_REVISION'].includes(solicitud.est_codigo)) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'La solicitud no se encuentra en un estado rechazable' });
    }

    const estadoRechazada = await obtenerEstadoSolicitud(connection, 'RECHAZADA');
    if (!estadoRechazada) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'No existe el estado RECHAZADA activo para SOLICITUD' });
    }

    await connection.execute(
      `UPDATE sol_solicitudes
       SET sol_id_estado_proceso = ?,
           sol_id_usuario_revision = ?,
           sol_fecha_revision = CURRENT_TIMESTAMP,
           sol_observacion_revision = ?,
           sol_fecha_modificacion = CURRENT_TIMESTAMP,
           sol_id_usuario_modificacion = ?
       WHERE sol_id = ?`,
      [estadoRechazada.est_id, req.usuario.usu_id, motivo, req.usuario.usu_id, Number(id)]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'REJECT',
      table: 'sol_solicitudes',
      recordId: Number(id),
      previousData: { estado_codigo: solicitud.est_codigo },
      newData: { estado_codigo: estadoRechazada.est_codigo, motivo },
      request: req,
      observation: motivo,
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Solicitud rechazada correctamente',
      solicitud: {
        id: Number(id),
        codigo: solicitud.sol_codigo,
        estado: {
          codigo: estadoRechazada.est_codigo,
          descripcion: estadoRechazada.est_descripcion,
        },
        motivo,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al rechazar solicitud:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  } finally {
    connection.release();
  }
}

module.exports = {
  listarSolicitudes,
  obtenerSolicitudPorId,
  crearSolicitud,
  aprobarSolicitud,
  rechazarSolicitud,
};
