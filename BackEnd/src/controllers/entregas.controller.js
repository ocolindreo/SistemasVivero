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

function normalizarTextoOpcional(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
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
      observation || null,
    ]
  );
}

async function obtenerEstadoPorModuloCodigo(connection, modulo, codigo) {
  const [rows] = await connection.execute(
    `SELECT est_id, est_codigo, est_descripcion, est_modulo
     FROM est_estados
     WHERE est_modulo = ?
       AND est_codigo = ?
       AND est_estado = 1
     LIMIT 1`,
    [modulo, codigo]
  );
  return rows[0] || null;
}

async function obtenerEntregaBase(connection, entregaId, lock = false) {
  const [rows] = await connection.execute(
    `SELECT
       e.ent_id,
       e.ent_codigo,
       e.ent_id_solicitud,
       e.ent_id_beneficiario,
       e.ent_fecha_programada,
       e.ent_fecha_entrega,
       e.ent_id_responsable,
       e.ent_recibe_nombre,
       e.ent_recibe_dpi,
       e.ent_lugar_entrega,
       e.ent_observaciones,
       e.ent_estado,
       e.ent_id_estado_proceso,
       e.ent_id_usuario_creacion,
       e.ent_fecha_creacion,
       e.ent_fecha_modificacion,
       e.ent_id_usuario_modificacion,
       s.sol_codigo,
       s.sol_id_beneficiario,
       b.ben_codigo,
       b.ben_nombre,
       b.ben_tipo,
       est.est_codigo AS estado_codigo,
       est.est_descripcion AS estado_descripcion,
       resp.usu_id AS responsable_id,
       resp.usu_username AS responsable_username,
       resp.usu_nombres AS responsable_nombres,
       resp.usu_apellidos AS responsable_apellidos,
       creador.usu_id AS creador_id,
       creador.usu_username AS creador_username,
       creador.usu_nombres AS creador_nombres,
       creador.usu_apellidos AS creador_apellidos
     FROM ent_entregas e
     INNER JOIN sol_solicitudes s ON s.sol_id = e.ent_id_solicitud
     INNER JOIN ben_beneficiarios b ON b.ben_id = e.ent_id_beneficiario
     INNER JOIN est_estados est ON est.est_id = e.ent_id_estado_proceso
     INNER JOIN usu_usuarios resp ON resp.usu_id = e.ent_id_responsable
     INNER JOIN usu_usuarios creador ON creador.usu_id = e.ent_id_usuario_creacion
     WHERE e.ent_id = ?
     LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
    [entregaId]
  );

  return rows[0] || null;
}

async function obtenerDetalleEntregaRows(connection, entregaId) {
  const [rows] = await connection.execute(
    `SELECT
       d.end_id,
       d.end_id_entrega,
       d.end_id_solicitud_detalle,
       d.end_id_reserva,
       d.end_id_inventario,
       d.end_cantidad_entregada,
       d.end_observaciones,
       d.end_estado,
       d.end_fecha_creacion,
       d.end_id_usuario_creacion,
       sd.sod_id_solicitud,
       sd.sod_id_inventario,
       sd.sod_id_especie,
       sd.sod_cantidad_solicitada,
       sd.sod_cantidad_aprobada,
       sd.sod_cantidad_entregada AS sod_cantidad_entregada_total,
       inv.inv_cantidad_total,
       inv.inv_cantidad_reservada,
       l.lot_codigo,
       esp.esp_codigo,
       esp.esp_nombre_comun,
       r.res_cantidad AS reserva_actual,
       e.est_codigo AS detalle_estado_codigo,
       u.usu_username,
       u.usu_nombres,
       u.usu_apellidos
     FROM end_entregas_detalle d
     INNER JOIN sod_solicitudes_detalle sd ON sd.sod_id = d.end_id_solicitud_detalle
     INNER JOIN inv_inventario inv ON inv.inv_id = d.end_id_inventario
     INNER JOIN lot_lotes l ON l.lot_id = inv.inv_id_lote
     INNER JOIN esp_especies esp ON esp.esp_id = sd.sod_id_especie
     INNER JOIN res_reservas r ON r.res_id = d.end_id_reserva
     LEFT JOIN est_estados e ON e.est_id = d.end_estado
     INNER JOIN usu_usuarios u ON u.usu_id = d.end_id_usuario_creacion
     WHERE d.end_id_entrega = ?
     ORDER BY d.end_id ASC`,
    [entregaId]
  );

  return rows;
}

function mapEntrega(row) {
  return {
    id: row.ent_id,
    codigo: row.ent_codigo,
    solicitud: {
      id: row.ent_id_solicitud,
      codigo: row.sol_codigo,
    },
    beneficiario: {
      id: row.ent_id_beneficiario,
      codigo: row.ben_codigo,
      nombre: row.ben_nombre,
      tipo: row.ben_tipo,
    },
    fecha_programada: row.ent_fecha_programada,
    fecha_entrega: row.ent_fecha_entrega,
    responsable: {
      id: row.responsable_id,
      username: row.responsable_username,
      nombres: row.responsable_nombres,
      apellidos: row.responsable_apellidos,
    },
    receptor: {
      nombre: row.ent_recibe_nombre,
      dpi: row.ent_recibe_dpi,
    },
    lugar_entrega: row.ent_lugar_entrega,
    observaciones: row.ent_observaciones,
    estado: {
      id: row.ent_id_estado_proceso,
      codigo: row.estado_codigo,
      descripcion: row.estado_descripcion,
    },
    usuario_creacion: {
      id: row.creador_id,
      username: row.creador_username,
      nombres: row.creador_nombres,
      apellidos: row.creador_apellidos,
    },
    fecha_creacion: row.ent_fecha_creacion,
  };
}

async function listarEntregas(req, res) {
  if (requiereRol(ROLES_LECTURA, req, res)) return;

  try {
    const [rows] = await pool.execute(
      `SELECT
         e.ent_id,
         e.ent_codigo,
         e.ent_id_solicitud,
         e.ent_id_beneficiario,
         e.ent_fecha_programada,
         e.ent_fecha_entrega,
         e.ent_id_responsable,
         e.ent_recibe_nombre,
         e.ent_recibe_dpi,
         e.ent_lugar_entrega,
         e.ent_observaciones,
         e.ent_estado,
         e.ent_id_estado_proceso,
         e.ent_id_usuario_creacion,
         e.ent_fecha_creacion,
         s.sol_codigo,
         b.ben_codigo,
         b.ben_nombre,
         b.ben_tipo,
         est.est_codigo AS estado_codigo,
         est.est_descripcion AS estado_descripcion,
         resp.usu_username,
         resp.usu_nombres,
         resp.usu_apellidos,
         u.usu_username AS usuario_creacion_username,
         u.usu_nombres AS usuario_creacion_nombres,
         u.usu_apellidos AS usuario_creacion_apellidos,
         COALESCE(SUM(ed.end_cantidad_entregada), 0) AS total_entregado
       FROM ent_entregas e
       INNER JOIN sol_solicitudes s ON s.sol_id = e.ent_id_solicitud
       INNER JOIN ben_beneficiarios b ON b.ben_id = e.ent_id_beneficiario
       INNER JOIN est_estados est ON est.est_id = e.ent_id_estado_proceso
       INNER JOIN usu_usuarios resp ON resp.usu_id = e.ent_id_responsable
       INNER JOIN usu_usuarios u ON u.usu_id = e.ent_id_usuario_creacion
       LEFT JOIN end_entregas_detalle ed ON ed.end_id_entrega = e.ent_id
       GROUP BY e.ent_id
       ORDER BY e.ent_fecha_creacion DESC, e.ent_id DESC`
    );

    return res.status(200).json({
      ok: true,
      entregas: rows.map((row) => ({
        id: row.ent_id,
        codigo: row.ent_codigo,
        solicitud: { id: row.ent_id_solicitud, codigo: row.sol_codigo },
        beneficiario: { id: row.ent_id_beneficiario, codigo: row.ben_codigo, nombre: row.ben_nombre, tipo: row.ben_tipo },
        fecha_programada: row.ent_fecha_programada,
        fecha_entrega: row.ent_fecha_entrega,
        responsable: { id: row.ent_id_responsable, username: row.usu_username, nombres: row.usu_nombres, apellidos: row.usu_apellidos },
        estado: { id: row.ent_id_estado_proceso, codigo: row.estado_codigo, descripcion: row.estado_descripcion },
        total_entregado: Number(row.total_entregado),
        usuario_creacion: { id: row.ent_id_usuario_creacion, username: row.usuario_creacion_username, nombres: row.usuario_creacion_nombres, apellidos: row.usuario_creacion_apellidos },
      })),
    });
  } catch (error) {
    console.error('Error al listar entregas:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

async function obtenerEntregaPorId(req, res) {
  if (requiereRol(ROLES_LECTURA, req, res)) return;

  const { id } = req.params;
  if (!esIdValido(id)) {
    return res.status(400).json({ ok: false, mensaje: 'El id debe ser un entero positivo' });
  }

  const connection = await pool.getConnection();

  try {
    const entrega = await obtenerEntregaBase(connection, Number(id));
    if (!entrega) {
      return res.status(404).json({ ok: false, mensaje: 'Entrega no encontrada' });
    }

    const detalles = await obtenerDetalleEntregaRows(connection, Number(id));

    return res.status(200).json({
      ok: true,
      entrega: {
        ...mapEntrega(entrega),
        detalles: detalles.map((detalle) => ({
          id: detalle.end_id,
          solicitud_detalle_id: detalle.end_id_solicitud_detalle,
          reserva_id: detalle.end_id_reserva,
          inventario_id: detalle.end_id_inventario,
          cantidad_entregada: detalle.end_cantidad_entregada,
          observaciones: detalle.end_observaciones,
          estado: { id: detalle.end_estado, codigo: detalle.detalle_estado_codigo },
          lote: { codigo: detalle.lot_codigo },
          especie: { codigo: detalle.esp_codigo, nombre_comun: detalle.esp_nombre_comun },
          cantidad_aprobada: detalle.sod_cantidad_aprobada,
          cantidad_entregada_total: detalle.sod_cantidad_entregada_total,
          reserva_actual: detalle.reserva_actual,
        }))
      },
    });
  } catch (error) {
    console.error('Error al consultar entrega:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  } finally {
    connection.release();
  }
}

async function crearEntrega(req, res) {
  if (requiereRol(ROLES_ESCRITURA, req, res)) return;

  const solicitudId = validarEnteroPositivo(req.body?.solicitud_id);
  const fechaProgramada = normalizarFecha(req.body?.fecha_programada);
  const responsableId = validarEnteroPositivo(req.body?.responsable_id);
  const lugarEntrega = normalizarTextoOpcional(req.body?.lugar_entrega);
  const observaciones = normalizarTextoOpcional(req.body?.observaciones);

  if (!solicitudId || !fechaProgramada || !responsableId) {
    return res.status(400).json({ ok: false, mensaje: 'Datos inválidos para crear la entrega' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [solicitudRows] = await connection.execute(
      `SELECT s.sol_id, s.sol_codigo, s.sol_id_beneficiario, s.sol_id_estado_proceso, e.est_codigo AS estado_codigo
       FROM sol_solicitudes s
       INNER JOIN est_estados e ON e.est_id = s.sol_id_estado_proceso
       WHERE s.sol_id = ?
       LIMIT 1 FOR UPDATE`,
      [solicitudId]
    );

    if (solicitudRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Solicitud no encontrada' });
    }

    const solicitud = solicitudRows[0];
    const estadosSolicitudPermitidos = new Set(['APROBADA', 'EN_PREPARACION']);
    if (!estadosSolicitudPermitidos.has(solicitud.estado_codigo)) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'Solo se puede programar una entrega sobre solicitudes APROBADAS o EN_PREPARACION' });
    }

    const [entregaAbiertaRows] = await connection.execute(
      `SELECT e.ent_id
       FROM ent_entregas e
       INNER JOIN est_estados est ON est.est_id = e.ent_id_estado_proceso
       WHERE e.ent_id_solicitud = ?
         AND est.est_codigo IN ('PROGRAMADA', 'EN_PREPARACION', 'LISTA')
       LIMIT 1`,
      [solicitudId]
    );
    if (entregaAbiertaRows.length > 0) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'La solicitud ya tiene una entrega operativa abierta' });
    }

    const [beneficiarioRows] = await connection.execute(
      `SELECT ben_id FROM ben_beneficiarios WHERE ben_id = ? AND ben_estado = 1 LIMIT 1`,
      [solicitud.sol_id_beneficiario]
    );
    if (beneficiarioRows.length === 0) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'El beneficiario de la solicitud no es válido' });
    }

    const [responsableRows] = await connection.execute(
      `SELECT usu_id, usu_username FROM usu_usuarios WHERE usu_id = ? AND usu_estado = 1 LIMIT 1`,
      [responsableId]
    );
    if (responsableRows.length === 0) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'El responsable indicado no es válido' });
    }

    const [detalleRows] = await connection.execute(
      `SELECT d.sod_id, d.sod_id_inventario, d.sod_cantidad_aprobada, d.sod_cantidad_entregada, inv.inv_id, inv.inv_id_lote
       FROM sod_solicitudes_detalle d
       INNER JOIN inv_inventario inv ON inv.inv_id = d.sod_id_inventario
       WHERE d.sod_id_solicitud = ?
         AND d.sod_cantidad_aprobada > 0`,
      [solicitudId]
    );

    const detallePendiente = detalleRows.filter((detalle) => Number(detalle.sod_cantidad_aprobada) - Number(detalle.sod_cantidad_entregada) > 0);
    if (detallePendiente.length === 0) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'La solicitud no tiene cantidades aprobadas pendientes por entregar' });
    }

    for (const detalle of detallePendiente) {
      const [reservaRows] = await connection.execute(
        `SELECT r.res_id, r.res_cantidad, r.res_estado
         FROM res_reservas r
         WHERE r.res_id_solicitud_detalle = ?
           AND r.res_id_inventario = ?
           AND r.res_estado = 1
         LIMIT 1 FOR UPDATE`,
        [detalle.sod_id, detalle.sod_id_inventario]
      );

      if (reservaRows.length === 0 || Number(reservaRows[0].res_cantidad) <= 0) {
        await connection.rollback();
        return res.status(409).json({ ok: false, mensaje: `Falta reserva persistente válida para el detalle ${detalle.sod_id}` });
      }
    }

    const estadoProgramada = await obtenerEstadoPorModuloCodigo(connection, 'ENTREGA', 'PROGRAMADA');
    if (!estadoProgramada) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'No existe el estado PROGRAMADA activo para ENTREGA' });
    }

    const estadoSolicitudPreparacion = await obtenerEstadoPorModuloCodigo(connection, 'SOLICITUD', 'EN_PREPARACION');
    if (!estadoSolicitudPreparacion) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'No existe el estado EN_PREPARACION activo para SOLICITUD' });
    }

    const [entregaResult] = await connection.execute(
      `INSERT INTO ent_entregas (
         ent_codigo,
         ent_id_solicitud,
         ent_id_beneficiario,
         ent_fecha_programada,
         ent_id_responsable,
         ent_lugar_entrega,
         ent_observaciones,
         ent_estado,
         ent_id_estado_proceso,
         ent_id_usuario_creacion,
         ent_id_usuario_modificacion
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ? )`,
      [
        '',
        solicitudId,
        solicitud.sol_id_beneficiario,
        fechaProgramada,
        responsableId,
        lugarEntrega,
        observaciones,
        estadoProgramada.est_id,
        req.usuario.usu_id,
        req.usuario.usu_id,
      ]
    );

    const codigoEntrega = `ENT-${String(entregaResult.insertId).padStart(6, '0')}`;
    await connection.execute(
      `UPDATE ent_entregas SET ent_codigo = ? WHERE ent_id = ?`,
      [codigoEntrega, entregaResult.insertId]
    );

    await connection.execute(
      `UPDATE sol_solicitudes
       SET sol_id_estado_proceso = ?,
           sol_fecha_modificacion = CURRENT_TIMESTAMP,
           sol_id_usuario_modificacion = ?
       WHERE sol_id = ?`,
      [estadoSolicitudPreparacion.est_id, req.usuario.usu_id, solicitudId]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'CREATE',
      table: 'ent_entregas',
      recordId: entregaResult.insertId,
      previousData: null,
      newData: {
        entrega_id: entregaResult.insertId,
        codigo: codigoEntrega,
        solicitud_id: solicitudId,
        beneficiario_id: solicitud.sol_id_beneficiario,
        responsable_id: responsableId,
        fecha_programada: fechaProgramada,
      },
      request: req,
      observation: `Entrega ${codigoEntrega} creada para ${solicitud.sol_codigo}`,
    });

    await connection.commit();

    return res.status(201).json({
      ok: true,
      mensaje: 'Entrega creada correctamente',
      entrega: {
        id: entregaResult.insertId,
        codigo: codigoEntrega,
        solicitud_id: solicitudId,
        estado: { codigo: estadoProgramada.est_codigo, descripcion: estadoProgramada.est_descripcion },
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al crear entrega:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  } finally {
    connection.release();
  }
}

async function prepararEntrega(req, res) {
  if (requiereRol(ROLES_ESCRITURA, req, res)) return;

  const { id } = req.params;
  if (!esIdValido(id)) {
    return res.status(400).json({ ok: false, mensaje: 'El id debe ser un entero positivo' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const entrega = await obtenerEntregaBase(connection, Number(id), true);
    if (!entrega) {
      await connection.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Entrega no encontrada' });
    }

    const estadoPreparacion = await obtenerEstadoPorModuloCodigo(connection, 'ENTREGA', 'EN_PREPARACION');
    if (!estadoPreparacion) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'No existe el estado EN_PREPARACION activo para ENTREGA' });
    }

    if (entrega.estado_codigo !== 'PROGRAMADA') {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'La entrega no se encuentra en estado PROGRAMADA' });
    }

    await connection.execute(
      `UPDATE ent_entregas
       SET ent_id_estado_proceso = ?,
           ent_fecha_modificacion = CURRENT_TIMESTAMP,
           ent_id_usuario_modificacion = ?
       WHERE ent_id = ?`,
      [estadoPreparacion.est_id, req.usuario.usu_id, Number(id)]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'PREPARE',
      table: 'ent_entregas',
      recordId: Number(id),
      previousData: { estado_codigo: entrega.estado_codigo },
      newData: { estado_codigo: estadoPreparacion.est_codigo },
      request: req,
      observation: `Entrega ${entrega.ent_codigo} marcada en preparación`,
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Entrega marcada como EN_PREPARACION',
      entrega: { id: Number(id), codigo: entrega.ent_codigo, estado: { codigo: estadoPreparacion.est_codigo, descripcion: estadoPreparacion.est_descripcion } },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al preparar entrega:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  } finally {
    connection.release();
  }
}

async function marcarListaEntrega(req, res) {
  if (requiereRol(ROLES_ESCRITURA, req, res)) return;

  const { id } = req.params;
  if (!esIdValido(id)) {
    return res.status(400).json({ ok: false, mensaje: 'El id debe ser un entero positivo' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const entrega = await obtenerEntregaBase(connection, Number(id), true);
    if (!entrega) {
      await connection.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Entrega no encontrada' });
    }

    const estadoLista = await obtenerEstadoPorModuloCodigo(connection, 'ENTREGA', 'LISTA');
    if (!estadoLista) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'No existe el estado LISTA activo para ENTREGA' });
    }

    if (entrega.estado_codigo !== 'EN_PREPARACION') {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'La entrega no se encuentra en estado EN_PREPARACION' });
    }

    await connection.execute(
      `UPDATE ent_entregas
       SET ent_id_estado_proceso = ?,
           ent_fecha_modificacion = CURRENT_TIMESTAMP,
           ent_id_usuario_modificacion = ?
       WHERE ent_id = ?`,
      [estadoLista.est_id, req.usuario.usu_id, Number(id)]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'READY',
      table: 'ent_entregas',
      recordId: Number(id),
      previousData: { estado_codigo: entrega.estado_codigo },
      newData: { estado_codigo: estadoLista.est_codigo },
      request: req,
      observation: `Entrega ${entrega.ent_codigo} marcada como lista`,
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Entrega marcada como LISTA',
      entrega: { id: Number(id), codigo: entrega.ent_codigo, estado: { codigo: estadoLista.est_codigo, descripcion: estadoLista.est_descripcion } },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al marcar entrega como lista:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  } finally {
    connection.release();
  }
}

async function confirmarEntrega(req, res) {
  if (requiereRol(ROLES_ESCRITURA, req, res)) return;

  const { id } = req.params;
  if (!esIdValido(id)) {
    return res.status(400).json({ ok: false, mensaje: 'El id debe ser un entero positivo' });
  }

  const body = req.body || {};
  const recibeNombre = normalizarTextoOpcional(body.recibe_nombre);
  const recibeDpi = normalizarTextoOpcional(body.recibe_dpi);
  const lugarEntrega = normalizarTextoOpcional(body.lugar_entrega) || normalizarTextoOpcional(body.lugar_entrega || '');
  const observaciones = normalizarTextoOpcional(body.observaciones);
  const detalles = Array.isArray(body.detalles) ? body.detalles : [];

  if (!recibeNombre || detalles.length === 0) {
    return res.status(400).json({ ok: false, mensaje: 'Debe indicar quien recibe y al menos un detalle para entregar' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const entrega = await obtenerEntregaBase(connection, Number(id), true);
    if (!entrega) {
      await connection.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Entrega no encontrada' });
    }

    const estadoLista = await obtenerEstadoPorModuloCodigo(connection, 'ENTREGA', 'LISTA');
    const estadoEntregada = await obtenerEstadoPorModuloCodigo(connection, 'ENTREGA', 'ENTREGADA');
    const estadoParcial = await obtenerEstadoPorModuloCodigo(connection, 'ENTREGA', 'ENTREGA_PARCIAL');
    if (!estadoLista || !estadoEntregada || !estadoParcial) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'No existen los estados de entrega requeridos' });
    }

    if (entrega.estado_codigo !== estadoLista.est_codigo) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'La entrega debe estar en estado LISTA para poder confirmarse' });
    }

    const solicitud = await connection.execute(
      `SELECT sol_id, sol_codigo, sol_id_estado_proceso
       FROM sol_solicitudes
       WHERE sol_id = ?
       LIMIT 1 FOR UPDATE`,
      [entrega.ent_id_solicitud]
    );

    if (solicitud[0].length === 0) {
      await connection.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Solicitud asociada no encontrada' });
    }

    const estadoAtendida = await obtenerEstadoPorModuloCodigo(connection, 'SOLICITUD', 'ATENDIDA');
    const estadoEnPreparacion = await obtenerEstadoPorModuloCodigo(connection, 'SOLICITUD', 'EN_PREPARACION');
    if (!estadoAtendida || !estadoEnPreparacion) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'No existen los estados de solicitud requeridos' });
    }

    const solicitudActual = solicitud[0][0];
    let totalEntregadoEnConfirmacion = 0;
    const detallesProcesados = [];

    for (const detalleInput of detalles) {
      const solicitudDetalleId = validarEnteroPositivo(detalleInput?.solicitud_detalle_id);
      const cantidad = validarEnteroPositivo(detalleInput?.cantidad);

      if (!solicitudDetalleId || !cantidad) {
        await connection.rollback();
        return res.status(400).json({ ok: false, mensaje: 'Cada detalle debe incluir solicitud_detalle_id y cantidad válidos' });
      }

      const [detalleRows] = await connection.execute(
        `SELECT d.sod_id, d.sod_id_solicitud, d.sod_id_inventario, d.sod_cantidad_aprobada, d.sod_cantidad_entregada, d.sod_estado
         FROM sod_solicitudes_detalle d
         WHERE d.sod_id = ?
         LIMIT 1 FOR UPDATE`,
        [solicitudDetalleId]
      );

      if (detalleRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ ok: false, mensaje: `Detalle de solicitud ${solicitudDetalleId} no encontrado` });
      }

      const detalle = detalleRows[0];
      if (Number(detalle.sod_id_solicitud) !== Number(entrega.ent_id_solicitud)) {
        await connection.rollback();
        return res.status(409).json({ ok: false, mensaje: `El detalle ${solicitudDetalleId} no pertenece a la solicitud de esta entrega` });
      }

      const restante = Number(detalle.sod_cantidad_aprobada) - Number(detalle.sod_cantidad_entregada);
      if (cantidad <= 0 || cantidad > restante) {
        await connection.rollback();
        return res.status(409).json({ ok: false, mensaje: `La cantidad entregada para el detalle ${solicitudDetalleId} excede el restante` });
      }

      const [reservaRows] = await connection.execute(
        `SELECT r.res_id, r.res_cantidad, r.res_estado, r.res_id_estado_proceso
         FROM res_reservas r
         WHERE r.res_id_solicitud_detalle = ?
           AND r.res_id_inventario = ?
           AND r.res_estado = 1
         LIMIT 1 FOR UPDATE`,
        [detalle.sod_id, detalle.sod_id_inventario]
      );

      if (reservaRows.length === 0) {
        await connection.rollback();
        return res.status(409).json({ ok: false, mensaje: `Falta reserva persistente para el detalle ${solicitudDetalleId}` });
      }

      const reserva = reservaRows[0];
      if (Number(reserva.res_cantidad) < cantidad) {
        await connection.rollback();
        return res.status(409).json({ ok: false, mensaje: `La reserva del detalle ${solicitudDetalleId} no tiene suficiente cantidad disponible` });
      }

      const [inventarioRows] = await connection.execute(
        `SELECT inv_id, inv_id_lote, inv_cantidad_total, inv_cantidad_reservada, inv_estado
         FROM inv_inventario
         WHERE inv_id = ?
         LIMIT 1 FOR UPDATE`,
        [detalle.sod_id_inventario]
      );

      if (inventarioRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ ok: false, mensaje: `Inventario ${detalle.sod_id_inventario} no encontrado` });
      }

      const inventario = inventarioRows[0];
      if (Number(inventario.inv_estado) !== 1 || Number(inventario.inv_cantidad_total) < cantidad || Number(inventario.inv_cantidad_reservada) < cantidad) {
        await connection.rollback();
        return res.status(409).json({ ok: false, mensaje: `No se puede entregar ${cantidad} del inventario ${detalle.sod_id_inventario}` });
      }

      totalEntregadoEnConfirmacion += cantidad;
      detallesProcesados.push({
        solicitudDetalleId: detalle.sod_id,
        inventarioId: detalle.sod_id_inventario,
        inventarioIdLote: inventario.inv_id_lote,
        reservaId: reserva.res_id,
        cantidad,
        reservaActual: Number(reserva.res_cantidad),
        inventarioActual: Number(inventario.inv_cantidad_total),
        reservadaActual: Number(inventario.inv_cantidad_reservada),
      });
    }

    const estadoEntregaFinal = await obtenerEstadoPorModuloCodigo(connection, 'ENTREGA', 'ENTREGADA');
    const estadoEntregaParcial = await obtenerEstadoPorModuloCodigo(connection, 'ENTREGA', 'ENTREGA_PARCIAL');

    for (const item of detallesProcesados) {
      const nuevaReserva = item.reservaActual - item.cantidad;
      const nuevaCantidadReservadaInventario = item.reservadaActual - item.cantidad;
      const nuevaCantidadTotalInventario = item.inventarioActual - item.cantidad;
      const nuevoEstadoInventario = nuevaCantidadTotalInventario === 0 ? 0 : 1;

      await connection.execute(
        `UPDATE res_reservas
         SET res_cantidad = ?,
             res_fecha_liberacion = CASE WHEN ? <= 0 THEN NULL ELSE res_fecha_liberacion END,
             res_id_estado_proceso = CASE WHEN ? <= 0 THEN (SELECT est_id FROM est_estados WHERE est_modulo = 'RESERVA' AND est_codigo = 'UTILIZADA' AND est_estado = 1 LIMIT 1) ELSE res_id_estado_proceso END,
             res_fecha_modificacion = CURRENT_TIMESTAMP,
             res_id_usuario_modificacion = ?
         WHERE res_id = ?`,
        [nuevaReserva, nuevaReserva, nuevaReserva, req.usuario.usu_id, item.reservaId]
      );

      await connection.execute(
        `UPDATE inv_inventario
         SET inv_cantidad_total = ?,
             inv_cantidad_reservada = ?,
             inv_estado = ?,
             inv_fecha_modificacion = CURRENT_TIMESTAMP,
             inv_id_usuario_modificacion = ?
         WHERE inv_id = ?`,
        [nuevaCantidadTotalInventario, nuevaCantidadReservadaInventario, nuevoEstadoInventario, req.usuario.usu_id, item.inventarioId]
      );

      if (nuevaCantidadTotalInventario === 0 && nuevaCantidadReservadaInventario === 0) {
        const [loteRows] = await connection.execute(
          `SELECT l.lot_id, l.lot_codigo, l.lot_id_estado_proceso, e.est_codigo AS estado_codigo
           FROM lot_lotes l
           INNER JOIN est_estados e ON e.est_id = l.lot_id_estado_proceso
           WHERE l.lot_id = ?
           LIMIT 1 FOR UPDATE`,
          [item.inventarioIdLote]
        );

        const estadoFinalizado = await obtenerEstadoPorModuloCodigo(connection, 'PRODUCCION', 'FINALIZADO');
        if (!estadoFinalizado) {
          throw new Error('No existe el estado FINALIZADO activo para PRODUCCION');
        }

        const lote = loteRows[0];
        if (lote && lote.estado_codigo === 'DISPONIBLE') {
          await connection.execute(
            `UPDATE lot_lotes
             SET lot_id_estado_proceso = ?,
                 lot_fecha_modificacion = CURRENT_TIMESTAMP,
                 lot_id_usuario_modificacion = ?
             WHERE lot_id = ?`,
            [estadoFinalizado.est_id, req.usuario.usu_id, lote.lot_id]
          );

          await registrarAuditoria({
            connection,
            userId: req.usuario.usu_id,
            action: 'UPDATE',
            table: 'lot_lotes',
            recordId: lote.lot_id,
            previousData: { estado_codigo: lote.estado_codigo },
            newData: { estado_codigo: estadoFinalizado.est_codigo, motivo: 'Inventario agotado por entrega' },
            request: req,
            observation: `Lote ${lote.lot_codigo} finalizado automáticamente por agotamiento de inventario`,
          });
        }
      }

      await connection.execute(
        `INSERT INTO end_entregas_detalle (
           end_id_entrega,
           end_id_solicitud_detalle,
           end_id_reserva,
           end_id_inventario,
           end_cantidad_entregada,
           end_observaciones,
           end_estado,
           end_id_usuario_creacion
         ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          Number(id),
          item.solicitudDetalleId,
          item.reservaId,
          item.inventarioId,
          item.cantidad,
          observaciones || 'Entrega confirmada',
          req.usuario.usu_id,
        ]
      );

      await connection.execute(
        `UPDATE sod_solicitudes_detalle
         SET sod_cantidad_entregada = sod_cantidad_entregada + ?,
             sod_fecha_modificacion = CURRENT_TIMESTAMP
         WHERE sod_id = ?`,
        [item.cantidad, item.solicitudDetalleId]
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
         ) VALUES (?, 'SALIDA_ENTREGA', ?, ?, ?, 'ENTREGA', ?, ?, 1)`,
        [
          item.inventarioId,
          item.cantidad,
          `Salida por entrega ${entrega.ent_codigo}`,
          req.usuario.usu_id,
          Number(id),
          `Salida por entrega ${entrega.ent_codigo} para detalle ${item.solicitudDetalleId}`,
        ]
      );
    }

    const [solicitudDetallesRows] = await connection.execute(
      `SELECT sod_id, sod_cantidad_aprobada, sod_cantidad_entregada
       FROM sod_solicitudes_detalle
       WHERE sod_id_solicitud = ?`,
      [entrega.ent_id_solicitud]
    );

    const solicitudCompleta = solicitudDetallesRows.every((row) => Number(row.sod_cantidad_entregada) >= Number(row.sod_cantidad_aprobada));
    const estadoSolicitud = solicitudCompleta ? estadoAtendida : estadoEnPreparacion;

    await connection.execute(
      `UPDATE sol_solicitudes
       SET sol_id_estado_proceso = ?,
           sol_fecha_modificacion = CURRENT_TIMESTAMP,
           sol_id_usuario_modificacion = ?
       WHERE sol_id = ?`,
      [estadoSolicitud.est_id, req.usuario.usu_id, entrega.ent_id_solicitud]
    );

    const estadoFinalEntrega = solicitudCompleta ? estadoEntregaFinal : estadoEntregaParcial;
    await connection.execute(
      `UPDATE ent_entregas
       SET ent_recibe_nombre = ?,
           ent_recibe_dpi = ?,
           ent_lugar_entrega = ?,
           ent_observaciones = ?,
           ent_fecha_entrega = CURRENT_DATE,
           ent_id_estado_proceso = ?,
           ent_fecha_modificacion = CURRENT_TIMESTAMP,
           ent_id_usuario_modificacion = ?
       WHERE ent_id = ?`,
      [recibeNombre, recibeDpi, lugarEntrega || entrega.ent_lugar_entrega, observaciones || entrega.ent_observaciones, estadoFinalEntrega.est_id, req.usuario.usu_id, Number(id)]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'DELIVER',
      table: 'ent_entregas',
      recordId: Number(id),
      previousData: { estado_codigo: entrega.estado_codigo },
      newData: {
        entrega_id: Number(id),
        receptor: recibeNombre,
        dpi: recibeDpi,
        lugar_entrega: lugarEntrega || entrega.ent_lugar_entrega,
        estado_entrega: estadoFinalEntrega.est_codigo,
        estado_solicitud: estadoSolicitud.est_codigo,
        detalles: detallesProcesados,
      },
      request: req,
      observation: `Confirmación de entrega ${entrega.ent_codigo}`,
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: solicitudCompleta ? 'Entrega finalizada y solicitud atendida' : 'Entrega confirmada parcialmente',
      entrega: {
        id: Number(id),
        codigo: entrega.ent_codigo,
        estado: { codigo: estadoFinalEntrega.est_codigo, descripcion: estadoFinalEntrega.est_descripcion },
        solicitud: { id: entrega.ent_id_solicitud, codigo: solicitudActual.sol_codigo, estado: { codigo: estadoSolicitud.est_codigo, descripcion: estadoSolicitud.est_descripcion } },
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al confirmar entrega:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  } finally {
    connection.release();
  }
}

module.exports = {
  listarEntregas,
  obtenerEntregaPorId,
  crearEntrega,
  prepararEntrega,
  marcarListaEntrega,
  confirmarEntrega,
};
