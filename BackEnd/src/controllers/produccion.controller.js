const pool = require('../config/database');

const ROLES_LECTURA = new Set(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']);
const ROLES_ESCRITURA = new Set(['ADMIN', 'VIVERO']);
const FLUJO_ETAPAS = ['PLANIFICADO', 'SIEMBRA', 'GERMINACION', 'CRECIMIENTO', 'ENDURECIMIENTO', 'DISPONIBLE', 'FINALIZADO'];

function esIdValido(value) {
  const parsed = Number(value);
  return /^\d+$/.test(String(value)) && Number.isSafeInteger(parsed) && parsed > 0;
}

function validarEnteroPositivo(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizarTextoOpcional(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function normalizarFecha(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsedDate = new Date(trimmed);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString().slice(0, 10);
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

function siguienteCodigoEtapa(codigoActual) {
  const index = FLUJO_ETAPAS.indexOf(codigoActual);
  if (index < 0 || index >= FLUJO_ETAPAS.length - 1) {
    return null;
  }

  return FLUJO_ETAPAS[index + 1];
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
      'lot_lotes',
      recordId,
      previousData ? JSON.stringify(previousData) : null,
      newData ? JSON.stringify(newData) : null,
      request.ip || null,
      request.get('user-agent') || null,
      observation || null
    ]
  );
}

async function registrarAuditoriaInventario({ connection, userId, action, recordId, previousData, newData, request, observation }) {
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

async function obtenerEstadoProduccionActivo(connection, codigo) {
  const [rows] = await connection.execute(
    `SELECT est_id, est_codigo, est_descripcion
     FROM est_estados
     WHERE est_modulo = 'PRODUCCION'
       AND est_codigo = ?
       AND est_estado = 1
     LIMIT 1`,
    [codigo]
  );

  return rows[0] || null;
}

async function obtenerEspecieActiva(connection, especieId) {
  const [rows] = await connection.execute(
    `SELECT esp_id, esp_codigo, esp_nombre_comun
     FROM esp_especies
     WHERE esp_id = ?
       AND esp_estado = 1
     LIMIT 1`,
    [especieId]
  );

  return rows[0] || null;
}

async function obtenerAreaActiva(connection, areaId) {
  const [rows] = await connection.execute(
    `SELECT are_id, are_codigo, are_nombre
     FROM are_areas_vivero
     WHERE are_id = ?
       AND are_estado = 1
     LIMIT 1`,
    [areaId]
  );

  return rows[0] || null;
}

async function obtenerResponsableValido(connection, responsableId) {
  const [rows] = await connection.execute(
    `SELECT
       u.usu_id,
       u.usu_username,
       u.usu_nombres,
       u.usu_apellidos,
       r.rol_codigo,
       r.rol_nombre
     FROM usu_usuarios u
     INNER JOIN rol_roles r ON r.rol_id = u.usu_id_rol
     WHERE u.usu_id = ?
       AND u.usu_estado = 1
       AND r.rol_estado = 1
       AND r.rol_codigo IN ('ADMIN', 'VIVERO')
     LIMIT 1`,
    [responsableId]
  );

  return rows[0] || null;
}

async function obtenerLoteConEstado(connection, loteId, lock = false) {
  const [rows] = await connection.execute(
    `SELECT
       l.lot_id,
       l.lot_codigo,
       l.lot_id_especie,
       l.lot_cantidad_inicial,
       l.lot_cantidad_actual,
       l.lot_fecha_inicio,
       l.lot_id_responsable,
       l.lot_id_area,
       l.lot_observaciones,
       l.lot_estado,
       l.lot_id_estado_proceso,
       e.est_codigo AS estado_codigo,
       e.est_descripcion AS estado_descripcion
     FROM lot_lotes l
     INNER JOIN est_estados e ON e.est_id = l.lot_id_estado_proceso
     WHERE l.lot_id = ?
     LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
    [loteId]
  );

  return rows[0] || null;
}

async function obtenerEtapasVigentes(connection, loteId) {
  const [rows] = await connection.execute(
    `SELECT
       etp_id,
       etp_id_estado_proceso,
       etp_fecha_inicio,
       etp_cantidad,
       etp_id_area,
       etp_id_responsable,
       etp_observaciones
     FROM etp_etapas_produccion
     WHERE etp_id_lote = ?
       AND etp_estado = 1
       AND etp_fecha_fin IS NULL
     ORDER BY etp_id ASC
     FOR UPDATE`,
    [loteId]
  );

  return rows;
}

function construirSiguienteEtapaInfo(estadoActual) {
  if (estadoActual === 'FINALIZADO' || estadoActual === 'CANCELADO') {
    return null;
  }

  const siguienteCodigo = siguienteCodigoEtapa(estadoActual);
  return siguienteCodigo ? { codigo: siguienteCodigo } : null;
}

async function listarLotes(req, res) {
  if (requiereRol(ROLES_LECTURA, req, res)) {
    return;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         l.lot_id,
         l.lot_codigo,
         l.lot_cantidad_inicial,
         l.lot_cantidad_actual,
         l.lot_fecha_inicio,
         l.lot_observaciones,
         l.lot_estado,
         sp.esp_id,
         sp.esp_codigo,
         sp.esp_nombre_comun,
         ar.are_id,
         ar.are_codigo,
         ar.are_nombre,
         ur.usu_id,
         ur.usu_nombres,
         ur.usu_apellidos,
         est.est_id,
         est.est_codigo,
         est.est_descripcion,
         etp.etp_id
       FROM lot_lotes l
       INNER JOIN esp_especies sp ON sp.esp_id = l.lot_id_especie
       INNER JOIN are_areas_vivero ar ON ar.are_id = l.lot_id_area
       INNER JOIN usu_usuarios ur ON ur.usu_id = l.lot_id_responsable
       INNER JOIN est_estados est ON est.est_id = l.lot_id_estado_proceso
       LEFT JOIN etp_etapas_produccion etp ON etp.etp_id = (
         SELECT e2.etp_id
         FROM etp_etapas_produccion e2
         WHERE e2.etp_id_lote = l.lot_id
           AND e2.etp_estado = 1
           AND e2.etp_fecha_fin IS NULL
         ORDER BY e2.etp_id DESC
         LIMIT 1
       )
       ORDER BY l.lot_fecha_creacion DESC, l.lot_id DESC`
    );

    return res.status(200).json({
      ok: true,
      lotes: rows.map((row) => ({
        id: row.lot_id,
        codigo: row.lot_codigo,
        cantidad_inicial: row.lot_cantidad_inicial,
        cantidad_actual: row.lot_cantidad_actual,
        fecha_inicio: row.lot_fecha_inicio,
        observaciones: row.lot_observaciones,
        estado: row.lot_estado,
        especie: {
          id: row.esp_id,
          codigo: row.esp_codigo,
          nombre_comun: row.esp_nombre_comun,
        },
        responsable: {
          id: row.usu_id,
          nombres: row.usu_nombres,
          apellidos: row.usu_apellidos,
        },
        area: {
          id: row.are_id,
          codigo: row.are_codigo,
          nombre: row.are_nombre,
        },
        etapa: {
          id: row.etp_id,
          codigo: row.est_codigo,
          descripcion: row.est_descripcion,
        }
      }))
    });
  } catch (error) {
    console.error('Error al listar lotes:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  }
}

async function obtenerLotePorId(req, res) {
  if (requiereRol(ROLES_LECTURA, req, res)) {
    return;
  }

  const { id } = req.params;

  if (!esIdValido(id)) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El id debe ser un entero positivo'
    });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         l.lot_id,
         l.lot_codigo,
         l.lot_cantidad_inicial,
         l.lot_cantidad_actual,
         l.lot_fecha_inicio,
         l.lot_observaciones,
         l.lot_estado,
         l.lot_fecha_creacion,
         l.lot_fecha_modificacion,
         sp.esp_id,
         sp.esp_codigo,
         sp.esp_nombre_comun,
         ar.are_id,
         ar.are_codigo,
         ar.are_nombre,
         ur.usu_id,
         ur.usu_username,
         ur.usu_nombres,
         ur.usu_apellidos,
         est.est_id,
         est.est_codigo,
         est.est_descripcion,
         etp.etp_id,
         etp.etp_fecha_inicio,
         etp.etp_cantidad,
         etp.etp_observaciones
       FROM lot_lotes l
       INNER JOIN esp_especies sp ON sp.esp_id = l.lot_id_especie
       INNER JOIN are_areas_vivero ar ON ar.are_id = l.lot_id_area
       INNER JOIN usu_usuarios ur ON ur.usu_id = l.lot_id_responsable
       INNER JOIN est_estados est ON est.est_id = l.lot_id_estado_proceso
       LEFT JOIN etp_etapas_produccion etp ON etp.etp_id = (
         SELECT e2.etp_id
         FROM etp_etapas_produccion e2
         WHERE e2.etp_id_lote = l.lot_id
           AND e2.etp_estado = 1
           AND e2.etp_fecha_fin IS NULL
         ORDER BY e2.etp_id DESC
         LIMIT 1
       )
       WHERE l.lot_id = ?
       LIMIT 1`,
      [Number(id)]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: 'Lote no encontrado'
      });
    }

    const lote = rows[0];
    const siguienteEtapa = construirSiguienteEtapaInfo(lote.est_codigo);

    if (siguienteEtapa) {
      const [estados] = await pool.execute(
        `SELECT est_codigo, est_descripcion
         FROM est_estados
         WHERE est_modulo = 'PRODUCCION'
           AND est_codigo = ?
           AND est_estado = 1
         LIMIT 1`,
        [siguienteEtapa.codigo]
      );

      if (estados.length > 0) {
        siguienteEtapa.descripcion = estados[0].est_descripcion;
      }
    }

    return res.status(200).json({
      ok: true,
      lote: {
        id: lote.lot_id,
        codigo: lote.lot_codigo,
        cantidad_inicial: lote.lot_cantidad_inicial,
        cantidad_actual: lote.lot_cantidad_actual,
        fecha_inicio: lote.lot_fecha_inicio,
        observaciones: lote.lot_observaciones,
        estado: lote.lot_estado,
        fecha_creacion: lote.lot_fecha_creacion,
        fecha_modificacion: lote.lot_fecha_modificacion,
        especie: {
          id: lote.esp_id,
          codigo: lote.esp_codigo,
          nombre_comun: lote.esp_nombre_comun,
        },
        responsable: {
          id: lote.usu_id,
          username: lote.usu_username,
          nombres: lote.usu_nombres,
          apellidos: lote.usu_apellidos,
        },
        area: {
          id: lote.are_id,
          codigo: lote.are_codigo,
          nombre: lote.are_nombre,
        },
        etapa_actual: {
          id: lote.etp_id,
          codigo: lote.est_codigo,
          descripcion: lote.est_descripcion,
          fecha_inicio: lote.etp_fecha_inicio,
          cantidad: lote.etp_cantidad,
          observaciones: lote.etp_observaciones,
        },
        siguiente_etapa: siguienteEtapa || null,
      }
    });
  } catch (error) {
    console.error('Error al consultar lote:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  }
}

async function listarEtapasPorLote(req, res) {
  if (requiereRol(ROLES_LECTURA, req, res)) {
    return;
  }

  const { id } = req.params;

  if (!esIdValido(id)) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El id debe ser un entero positivo'
    });
  }

  try {
    const [lotes] = await pool.execute(
      'SELECT lot_id, lot_codigo FROM lot_lotes WHERE lot_id = ? LIMIT 1',
      [Number(id)]
    );

    if (lotes.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: 'Lote no encontrado'
      });
    }

    const [rows] = await pool.execute(
      `SELECT
         e.etp_id,
         e.etp_fecha_inicio,
         e.etp_fecha_fin,
         e.etp_cantidad,
         e.etp_observaciones,
         est.est_codigo,
         est.est_descripcion,
         ar.are_id,
         ar.are_codigo,
         ar.are_nombre,
         ur.usu_id,
         ur.usu_nombres,
         ur.usu_apellidos
       FROM etp_etapas_produccion e
       INNER JOIN est_estados est ON est.est_id = e.etp_id_estado_proceso
       INNER JOIN are_areas_vivero ar ON ar.are_id = e.etp_id_area
       INNER JOIN usu_usuarios ur ON ur.usu_id = e.etp_id_responsable
       WHERE e.etp_id_lote = ?
       ORDER BY e.etp_fecha_inicio ASC, e.etp_id ASC`,
      [Number(id)]
    );

    let cantidadAnterior = null;
    const etapas = rows.map((row) => {
      const merma = cantidadAnterior !== null && row.etp_cantidad !== null
        ? cantidadAnterior - row.etp_cantidad
        : null;

      cantidadAnterior = row.etp_cantidad;

      return {
        id: row.etp_id,
        estado: {
          codigo: row.est_codigo,
          descripcion: row.est_descripcion,
        },
        fecha_inicio: row.etp_fecha_inicio,
        fecha_fin: row.etp_fecha_fin,
        cantidad: row.etp_cantidad,
        merma: merma !== null ? merma : null,
        area: {
          id: row.are_id,
          codigo: row.are_codigo,
          nombre: row.are_nombre,
        },
        responsable: {
          id: row.usu_id,
          nombres: row.usu_nombres,
          apellidos: row.usu_apellidos,
        },
        observaciones: row.etp_observaciones,
        vigente: row.etp_fecha_fin === null,
      };
    });

    return res.status(200).json({
      ok: true,
      lote: {
        id: lotes[0].lot_id,
        codigo: lotes[0].lot_codigo,
      },
      etapas,
    });
  } catch (error) {
    console.error('Error al listar etapas del lote:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  }
}

async function listarResponsablesProduccion(req, res) {
  if (requiereRol(ROLES_LECTURA, req, res)) {
    return;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         u.usu_id,
         u.usu_username,
         u.usu_nombres,
         u.usu_apellidos,
         r.rol_codigo,
         r.rol_nombre
       FROM usu_usuarios u
       INNER JOIN rol_roles r ON r.rol_id = u.usu_id_rol
       WHERE u.usu_estado = 1
         AND r.rol_estado = 1
         AND r.rol_codigo IN ('ADMIN', 'VIVERO')
       ORDER BY u.usu_apellidos, u.usu_nombres`
    );

    return res.status(200).json({
      ok: true,
      responsables: rows.map((row) => ({
        id: row.usu_id,
        username: row.usu_username,
        nombres: row.usu_nombres,
        apellidos: row.usu_apellidos,
        rol: {
          codigo: row.rol_codigo,
          nombre: row.rol_nombre,
        }
      }))
    });
  } catch (error) {
    console.error('Error al listar responsables de producción:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  }
}

async function crearLote(req, res) {
  if (requiereRol(ROLES_ESCRITURA, req, res)) {
    return;
  }

  const body = req.body || {};
  const camposNoPermitidos = [
    'codigo',
    'cantidad_actual',
    'estado',
    'estado_proceso',
    'usuario_creacion',
    'fecha_creacion'
  ];

  if (camposNoPermitidos.some((campo) => Object.prototype.hasOwnProperty.call(body, campo))) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El cuerpo contiene campos no permitidos'
    });
  }

  const especieId = validarEnteroPositivo(body.especie_id);
  const cantidadInicial = validarEnteroPositivo(body.cantidad_inicial);
  const fechaInicio = normalizarFecha(body.fecha_inicio);
  const responsableId = validarEnteroPositivo(body.responsable_id);
  const areaId = validarEnteroPositivo(body.area_id);
  const observaciones = normalizarTextoOpcional(body.observaciones);

  if (!especieId || !cantidadInicial || !fechaInicio || !responsableId || !areaId) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Los datos requeridos son inválidos'
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const especie = await obtenerEspecieActiva(connection, especieId);
    if (!especie) {
      await connection.rollback();
      return res.status(400).json({ ok: false, mensaje: 'La especie indicada no es válida' });
    }

    const area = await obtenerAreaActiva(connection, areaId);
    if (!area) {
      await connection.rollback();
      return res.status(400).json({ ok: false, mensaje: 'El área indicada no es válida' });
    }

    const responsable = await obtenerResponsableValido(connection, responsableId);
    if (!responsable) {
      await connection.rollback();
      return res.status(400).json({ ok: false, mensaje: 'El responsable indicado no es válido' });
    }

    const estadoPlanificado = await obtenerEstadoProduccionActivo(connection, 'PLANIFICADO');
    if (!estadoPlanificado) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'No existe el estado PLANIFICADO activo para PRODUCCION' });
    }

    const [result] = await connection.execute(
      `INSERT INTO lot_lotes (
         lot_codigo,
         lot_id_especie,
         lot_cantidad_inicial,
         lot_cantidad_actual,
         lot_fecha_inicio,
         lot_id_responsable,
         lot_id_area,
         lot_observaciones,
         lot_estado,
         lot_id_estado_proceso,
         lot_id_usuario_creacion
       ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        especieId,
        cantidadInicial,
        cantidadInicial,
        fechaInicio,
        responsableId,
        areaId,
        observaciones,
        estadoPlanificado.est_id,
        req.usuario.usu_id
      ]
    );

    const codigoLote = `LOT-${String(result.insertId).padStart(6, '0')}`;

    await connection.execute(
      `UPDATE lot_lotes
       SET lot_codigo = ?
       WHERE lot_id = ?`,
      [codigoLote, result.insertId]
    );

    const [etapaResult] = await connection.execute(
      `INSERT INTO etp_etapas_produccion (
         etp_id_lote,
         etp_id_estado_proceso,
         etp_fecha_inicio,
         etp_fecha_fin,
         etp_cantidad,
         etp_id_area,
         etp_id_responsable,
         etp_observaciones,
         etp_estado,
         etp_id_usuario_creacion
       ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 1, ?)`,
      [
        result.insertId,
        estadoPlanificado.est_id,
        fechaInicio,
        cantidadInicial,
        areaId,
        responsableId,
        observaciones,
        req.usuario.usu_id
      ]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'CREATE',
      recordId: result.insertId,
      previousData: null,
      newData: {
        lot_codigo: codigoLote,
        lot_id_especie: especieId,
        lot_cantidad_inicial: cantidadInicial,
        lot_cantidad_actual: cantidadInicial,
        lot_fecha_inicio: fechaInicio,
        lot_id_responsable: responsableId,
        lot_id_area: areaId,
        lot_estado: 1,
        lot_id_estado_proceso: estadoPlanificado.est_id,
        etapa_inicial_id: etapaResult.insertId,
        etapa_inicial_codigo: estadoPlanificado.est_codigo,
      },
      request: req,
      observation: 'Lote creado en etapa PLANIFICADO'
    });

    await connection.commit();

    return res.status(201).json({
      ok: true,
      mensaje: 'Lote creado correctamente',
      lote: {
        id: result.insertId,
        codigo: codigoLote,
        cantidad_inicial: cantidadInicial,
        cantidad_actual: cantidadInicial,
        fecha_inicio: fechaInicio,
        observaciones,
        estado: 1,
        especie: {
          id: especie.esp_id,
          codigo: especie.esp_codigo,
          nombre_comun: especie.esp_nombre_comun,
        },
        area: {
          id: area.are_id,
          codigo: area.are_codigo,
          nombre: area.are_nombre,
        },
        responsable: {
          id: responsable.usu_id,
          username: responsable.usu_username,
          nombres: responsable.usu_nombres,
          apellidos: responsable.usu_apellidos,
          rol: {
            codigo: responsable.rol_codigo,
            nombre: responsable.rol_nombre,
          }
        },
        etapa_actual: {
          codigo: estadoPlanificado.est_codigo,
          descripcion: estadoPlanificado.est_descripcion,
        }
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al crear lote:', error.message);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
}

async function actualizarObservacionesLote(req, res) {
  if (requiereRol(ROLES_ESCRITURA, req, res)) {
    return;
  }

  const { id } = req.params;

  if (!esIdValido(id)) {
    return res.status(400).json({ ok: false, mensaje: 'El id debe ser un entero positivo' });
  }

  const body = req.body || {};
  const keys = Object.keys(body);

  if (keys.length === 0 || keys.some((key) => key !== 'observaciones')) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Solo se permite actualizar observaciones'
    });
  }

  const observaciones = normalizarTextoOpcional(body.observaciones);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const lote = await obtenerLoteConEstado(connection, Number(id), true);
    if (!lote) {
      await connection.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Lote no encontrado' });
    }

    await connection.execute(
      `UPDATE lot_lotes
       SET lot_observaciones = ?,
           lot_fecha_modificacion = CURRENT_TIMESTAMP,
           lot_id_usuario_modificacion = ?
       WHERE lot_id = ?`,
      [observaciones, req.usuario.usu_id, Number(id)]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'UPDATE',
      recordId: Number(id),
      previousData: {
        lot_observaciones: lote.lot_observaciones,
      },
      newData: {
        lot_observaciones: observaciones,
      },
      request: req,
      observation: 'Observaciones del lote actualizadas'
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Observaciones actualizadas correctamente',
      lote: {
        id: lote.lot_id,
        codigo: lote.lot_codigo,
        observaciones,
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al actualizar observaciones del lote:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  } finally {
    connection.release();
  }
}

async function avanzarEtapaLote(req, res) {
  if (requiereRol(ROLES_ESCRITURA, req, res)) {
    return;
  }

  const { id } = req.params;

  if (!esIdValido(id)) {
    return res.status(400).json({ ok: false, mensaje: 'El id debe ser un entero positivo' });
  }

  const body = req.body || {};
  const fechaInicioNueva = normalizarFecha(body.fecha_inicio);
  const nuevaCantidad = validarEnteroPositivo(body.cantidad);
  const areaId = validarEnteroPositivo(body.area_id);
  const responsableId = validarEnteroPositivo(body.responsable_id);
  const observaciones = normalizarTextoOpcional(body.observaciones);

  if (!fechaInicioNueva || !nuevaCantidad || !areaId || !responsableId) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Los datos requeridos son inválidos'
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const lote = await obtenerLoteConEstado(connection, Number(id), true);
    if (!lote) {
      await connection.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Lote no encontrado' });
    }

    if (lote.lot_estado !== 1) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'El lote no se encuentra operativo' });
    }

    if (lote.estado_codigo === 'CANCELADO') {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'No se puede avanzar un lote cancelado' });
    }

    if (lote.estado_codigo === 'FINALIZADO') {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'No se puede avanzar un lote finalizado' });
    }

    const etapasVigentes = await obtenerEtapasVigentes(connection, Number(id));
    if (etapasVigentes.length !== 1) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'Existe un conflicto de etapa vigente para el lote' });
    }

    const etapaActual = etapasVigentes[0];

    const fechaActual = new Date(normalizarFecha(String(etapaActual.etp_fecha_inicio)));
    const fechaNueva = new Date(fechaInicioNueva);
    if (fechaNueva.getTime() < fechaActual.getTime()) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'La fecha de la nueva etapa no puede ser anterior a la etapa vigente'
      });
    }

    if (nuevaCantidad > lote.lot_cantidad_actual) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: 'La cantidad no puede superar la cantidad actual del lote'
      });
    }

    const siguienteCodigo = siguienteCodigoEtapa(lote.estado_codigo);
    if (!siguienteCodigo) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'El lote no tiene una etapa siguiente válida' });
    }

    const estadoSiguiente = await obtenerEstadoProduccionActivo(connection, siguienteCodigo);
    if (!estadoSiguiente) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: `No existe el estado ${siguienteCodigo} activo para PRODUCCION` });
    }

    const area = await obtenerAreaActiva(connection, areaId);
    if (!area) {
      await connection.rollback();
      return res.status(400).json({ ok: false, mensaje: 'El área indicada no es válida' });
    }

    const responsable = await obtenerResponsableValido(connection, responsableId);
    if (!responsable) {
      await connection.rollback();
      return res.status(400).json({ ok: false, mensaje: 'El responsable indicado no es válido' });
    }

    await connection.execute(
      `UPDATE etp_etapas_produccion
       SET etp_fecha_fin = ?,
           etp_fecha_modificacion = CURRENT_TIMESTAMP,
           etp_id_usuario_modificacion = ?
       WHERE etp_id = ?`,
      [fechaInicioNueva, req.usuario.usu_id, etapaActual.etp_id]
    );

    const [nuevaEtapaResult] = await connection.execute(
      `INSERT INTO etp_etapas_produccion (
         etp_id_lote,
         etp_id_estado_proceso,
         etp_fecha_inicio,
         etp_fecha_fin,
         etp_cantidad,
         etp_id_area,
         etp_id_responsable,
         etp_observaciones,
         etp_estado,
         etp_id_usuario_creacion
       ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 1, ?)`,
      [
        Number(id),
        estadoSiguiente.est_id,
        fechaInicioNueva,
        nuevaCantidad,
        areaId,
        responsableId,
        observaciones,
        req.usuario.usu_id
      ]
    );

    await connection.execute(
      `UPDATE lot_lotes
       SET lot_cantidad_actual = ?,
           lot_id_area = ?,
           lot_id_responsable = ?,
           lot_id_estado_proceso = ?,
           lot_fecha_modificacion = CURRENT_TIMESTAMP,
           lot_id_usuario_modificacion = ?
       WHERE lot_id = ?`,
      [
        nuevaCantidad,
        areaId,
        responsableId,
        estadoSiguiente.est_id,
        req.usuario.usu_id,
        Number(id)
      ]
    );

    const merma = lote.lot_cantidad_actual - nuevaCantidad;
    let inventarioCreado = null;

    if (lote.estado_codigo === 'ENDURECIMIENTO' && estadoSiguiente.est_codigo === 'DISPONIBLE') {
      const [inventariosExistentes] = await connection.execute(
        `SELECT inv_id
         FROM inv_inventario
         WHERE inv_id_lote = ?
         LIMIT 1
         FOR UPDATE`,
        [Number(id)]
      );

      if (inventariosExistentes.length > 0) {
        await connection.rollback();
        return res.status(409).json({ ok: false, mensaje: 'El lote ya tiene inventario asociado' });
      }

      const [inventarioResult] = await connection.execute(
        `INSERT INTO inv_inventario (
           inv_id_lote,
           inv_id_area,
           inv_cantidad_total,
           inv_cantidad_reservada,
           inv_fecha_disponibilidad,
           inv_estado,
           inv_id_usuario_creacion
         ) VALUES (?, ?, ?, 0, ?, 1, ?)`,
        [Number(id), areaId, nuevaCantidad, fechaInicioNueva, req.usuario.usu_id]
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
         ) VALUES (?, 'INGRESO', ?, 'Ingreso automático desde Producción', ?, 'LOTE', ?, ?, 1)`,
        [
          inventarioResult.insertId,
          nuevaCantidad,
          req.usuario.usu_id,
          Number(id),
          `Ingreso automático por avance del lote ${lote.lot_codigo} a DISPONIBLE`
        ]
      );

      inventarioCreado = {
        inv_id: inventarioResult.insertId,
        inv_id_lote: Number(id),
        inv_id_area: areaId,
        inv_cantidad_total: nuevaCantidad,
        inv_cantidad_reservada: 0,
        inv_fecha_disponibilidad: fechaInicioNueva,
      };

      await registrarAuditoriaInventario({
        connection,
        userId: req.usuario.usu_id,
        action: 'CREATE',
        recordId: inventarioResult.insertId,
        previousData: null,
        newData: inventarioCreado,
        request: req,
        observation: 'Inventario creado automáticamente desde Producción'
      });
    }

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'CAMBIO_ETAPA',
      recordId: Number(id),
      previousData: {
        estado_codigo: lote.estado_codigo,
        cantidad_actual: lote.lot_cantidad_actual,
        area_id: lote.lot_id_area,
        responsable_id: lote.lot_id_responsable,
      },
      newData: {
        estado_codigo: estadoSiguiente.est_codigo,
        cantidad_actual: nuevaCantidad,
        area_id: areaId,
        responsable_id: responsableId,
        merma,
        inventario_creado: inventarioCreado,
      },
      request: req,
      observation: `Cambio de etapa ${lote.estado_codigo} a ${estadoSiguiente.est_codigo}`
    });

    await connection.commit();

    const siguiente = construirSiguienteEtapaInfo(estadoSiguiente.est_codigo);
    if (siguiente) {
      const estadoPosterior = await obtenerEstadoProduccionActivo(connection, siguiente.codigo);
      if (estadoPosterior) {
        siguiente.descripcion = estadoPosterior.est_descripcion;
      }
    }

    return res.status(200).json({
      ok: true,
      mensaje: 'Etapa actualizada correctamente',
      lote: {
        id: Number(id),
        codigo: lote.lot_codigo,
        cantidad_actual: nuevaCantidad,
        merma,
        etapa_actual: {
          id: nuevaEtapaResult.insertId,
          codigo: estadoSiguiente.est_codigo,
          descripcion: estadoSiguiente.est_descripcion,
          fecha_inicio: fechaInicioNueva,
        },
        siguiente_etapa: siguiente || null,
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al avanzar etapa del lote:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  } finally {
    connection.release();
  }
}

async function cancelarLote(req, res) {
  if (requiereRol(ROLES_ESCRITURA, req, res)) {
    return;
  }

  const { id } = req.params;

  if (!esIdValido(id)) {
    return res.status(400).json({ ok: false, mensaje: 'El id debe ser un entero positivo' });
  }

  const motivo = normalizarTextoOpcional(req.body?.motivo);
  if (!motivo) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El motivo de cancelación es obligatorio'
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const lote = await obtenerLoteConEstado(connection, Number(id), true);
    if (!lote) {
      await connection.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Lote no encontrado' });
    }

    if (lote.estado_codigo === 'CANCELADO' || lote.lot_estado === 0) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'El lote ya se encuentra cancelado' });
    }

    if (lote.estado_codigo === 'FINALIZADO') {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'No se puede cancelar un lote finalizado' });
    }

    const estadoCancelado = await obtenerEstadoProduccionActivo(connection, 'CANCELADO');
    if (!estadoCancelado) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'No existe el estado CANCELADO activo para PRODUCCION' });
    }

    const etapasVigentes = await obtenerEtapasVigentes(connection, Number(id));
    if (etapasVigentes.length !== 1) {
      await connection.rollback();
      return res.status(409).json({ ok: false, mensaje: 'Existe un conflicto de etapa vigente para el lote' });
    }

    const etapaActual = etapasVigentes[0];

    await connection.execute(
      `UPDATE etp_etapas_produccion
       SET etp_fecha_fin = CURRENT_DATE,
           etp_fecha_modificacion = CURRENT_TIMESTAMP,
           etp_id_usuario_modificacion = ?
       WHERE etp_id = ?`,
      [req.usuario.usu_id, etapaActual.etp_id]
    );

    const [etapaCanceladaResult] = await connection.execute(
      `INSERT INTO etp_etapas_produccion (
         etp_id_lote,
         etp_id_estado_proceso,
         etp_fecha_inicio,
         etp_fecha_fin,
         etp_cantidad,
         etp_id_area,
         etp_id_responsable,
         etp_observaciones,
         etp_estado,
         etp_id_usuario_creacion
       ) VALUES (?, ?, CURRENT_DATE, NULL, ?, ?, ?, ?, 1, ?)`,
      [
        Number(id),
        estadoCancelado.est_id,
        lote.lot_cantidad_actual,
        lote.lot_id_area,
        lote.lot_id_responsable,
        motivo,
        req.usuario.usu_id
      ]
    );

    await connection.execute(
      `UPDATE lot_lotes
       SET lot_estado = 0,
           lot_id_estado_proceso = ?,
           lot_fecha_modificacion = CURRENT_TIMESTAMP,
           lot_id_usuario_modificacion = ?
       WHERE lot_id = ?`,
      [estadoCancelado.est_id, req.usuario.usu_id, Number(id)]
    );

    await registrarAuditoria({
      connection,
      userId: req.usuario.usu_id,
      action: 'CANCELAR',
      recordId: Number(id),
      previousData: {
        estado_codigo: lote.estado_codigo,
        lot_estado: lote.lot_estado,
      },
      newData: {
        estado_codigo: estadoCancelado.est_codigo,
        lot_estado: 0,
        motivo,
      },
      request: req,
      observation: motivo
    });

    await connection.commit();

    return res.status(200).json({
      ok: true,
      mensaje: 'Lote cancelado correctamente',
      lote: {
        id: Number(id),
        codigo: lote.lot_codigo,
        estado: 0,
        etapa_actual: {
          id: etapaCanceladaResult.insertId,
          codigo: estadoCancelado.est_codigo,
          descripcion: estadoCancelado.est_descripcion,
        },
        motivo,
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al cancelar lote:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  } finally {
    connection.release();
  }
}

module.exports = {
  listarLotes,
  obtenerLotePorId,
  listarEtapasPorLote,
  listarResponsablesProduccion,
  crearLote,
  actualizarObservacionesLote,
  avanzarEtapaLote,
  cancelarLote,
};
