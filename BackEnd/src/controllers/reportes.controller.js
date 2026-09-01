const pool = require('../config/database');

const ROLES_LECTURA = new Set(['ADMIN', 'VIVERO', 'GESTION', 'CONSULTA']);

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

function normalizarFecha(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value.trim() : null;
}

function obtenerRangoFechas(req, res) {
  const fechaDesdeRaw = req.query?.fecha_desde;
  const fechaHastaRaw = req.query?.fecha_hasta;

  if (fechaDesdeRaw === undefined && fechaHastaRaw === undefined) return { modo: 'todo', fechaDesde: null, fechaHasta: null };
  if (fechaDesdeRaw === undefined || fechaHastaRaw === undefined) {
    res.status(400).json({ ok: false, mensaje: 'Debe indicar fecha_desde y fecha_hasta juntas' });
    return null;
  }

  const fechaDesde = normalizarFecha(fechaDesdeRaw);
  const fechaHasta = normalizarFecha(fechaHastaRaw);
  if (!fechaDesde || !fechaHasta || fechaDesde > fechaHasta) {
    res.status(400).json({ ok: false, mensaje: 'El rango de fechas no es válido' });
    return null;
  }

  return { modo: 'rango', fechaDesde, fechaHasta };
}

function respuestaReporte(rango, contenido) {
  return {
    ok: true,
    modo: rango.modo,
    fecha_desde: rango.fechaDesde,
    fecha_hasta: rango.fechaHasta,
    ...contenido,
  };
}

function mapFilasNumericas(rows, campos) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, campos.includes(key) ? Number(value) : value])));
}

async function obtenerDashboard(req, res) {
  if (requiereRol(ROLES_LECTURA, req, res)) return;

  try {
    const resultados = await Promise.all([
      pool.execute(
        `SELECT
           (SELECT COUNT(*)
            FROM lot_lotes lot
            INNER JOIN est_estados estado ON estado.est_id = lot.lot_id_estado_proceso
            WHERE estado.est_modulo = 'PRODUCCION'
              AND estado.est_codigo IN ('PLANIFICADO', 'SIEMBRA', 'GERMINACION', 'CRECIMIENTO', 'ENDURECIMIENTO', 'DISPONIBLE')) AS lotes_en_produccion,
           (SELECT COALESCE(SUM(inv.inv_cantidad_total - inv.inv_cantidad_reservada), 0)
            FROM inv_inventario inv
            WHERE inv.inv_estado = 1
              AND inv.inv_cantidad_total > 0) AS plantas_disponibles,
           (SELECT COALESCE(SUM(inv.inv_cantidad_reservada), 0)
            FROM inv_inventario inv
            WHERE inv.inv_estado = 1
              AND inv.inv_cantidad_total > 0) AS plantas_reservadas,
           (SELECT COUNT(*)
            FROM sol_solicitudes sol
            INNER JOIN est_estados estado ON estado.est_id = sol.sol_id_estado_proceso
            WHERE estado.est_modulo = 'SOLICITUD'
              AND estado.est_codigo IN ('REGISTRADA', 'EN_REVISION')) AS solicitudes_pendientes,
           (SELECT COUNT(*)
            FROM sol_solicitudes sol
            INNER JOIN est_estados estado ON estado.est_id = sol.sol_id_estado_proceso
            WHERE estado.est_modulo = 'SOLICITUD'
              AND estado.est_codigo = 'ATENDIDA') AS solicitudes_atendidas,
           (SELECT COALESCE(SUM(detalle.end_cantidad_entregada), 0)
            FROM end_entregas_detalle detalle) AS plantas_entregadas`
      ),
      pool.execute(
        `SELECT
           estado.est_codigo AS codigo_estado,
           estado.est_descripcion AS nombre_estado,
           COUNT(lot.lot_id) AS cantidad_lotes
         FROM est_estados estado
         LEFT JOIN lot_lotes lot ON lot.lot_id_estado_proceso = estado.est_id
         WHERE estado.est_modulo = 'PRODUCCION'
           AND estado.est_estado = 1
         GROUP BY estado.est_id, estado.est_codigo, estado.est_descripcion, estado.est_orden
         ORDER BY estado.est_orden ASC, estado.est_id ASC`
      ),
      pool.execute(
        `SELECT
           especie.esp_id AS id_especie,
           especie.esp_nombre_comun AS especie,
           COALESCE(SUM(inv.inv_cantidad_total), 0) AS cantidad_total,
           COALESCE(SUM(inv.inv_cantidad_reservada), 0) AS cantidad_reservada,
           COALESCE(SUM(inv.inv_cantidad_total - inv.inv_cantidad_reservada), 0) AS cantidad_disponible
         FROM inv_inventario inv
         INNER JOIN lot_lotes lot ON lot.lot_id = inv.inv_id_lote
         INNER JOIN esp_especies especie ON especie.esp_id = lot.lot_id_especie
         WHERE inv.inv_estado = 1
           AND inv.inv_cantidad_total > 0
         GROUP BY especie.esp_id, especie.esp_nombre_comun
         ORDER BY especie.esp_nombre_comun ASC`
      ),
      pool.execute(
        `SELECT
           estado.est_codigo AS codigo_estado,
           estado.est_descripcion AS nombre_estado,
           COUNT(sol.sol_id) AS cantidad_solicitudes
         FROM est_estados estado
         LEFT JOIN sol_solicitudes sol ON sol.sol_id_estado_proceso = estado.est_id
         WHERE estado.est_modulo = 'SOLICITUD'
           AND estado.est_estado = 1
         GROUP BY estado.est_id, estado.est_codigo, estado.est_descripcion, estado.est_orden
         ORDER BY estado.est_orden ASC, estado.est_id ASC`
      ),
      pool.execute(
        `SELECT
           ent.ent_id AS id_entrega,
           ent.ent_codigo AS codigo_entrega,
           sol.sol_codigo AS codigo_solicitud,
           ben.ben_nombre AS beneficiario,
           estado.est_codigo AS estado,
           ent.ent_fecha_entrega AS fecha_entrega,
           COALESCE(SUM(detalle.end_cantidad_entregada), 0) AS total_entregado
         FROM ent_entregas ent
         INNER JOIN sol_solicitudes sol ON sol.sol_id = ent.ent_id_solicitud
         INNER JOIN ben_beneficiarios ben ON ben.ben_id = ent.ent_id_beneficiario
         INNER JOIN est_estados estado ON estado.est_id = ent.ent_id_estado_proceso
         INNER JOIN end_entregas_detalle detalle ON detalle.end_id_entrega = ent.ent_id
         WHERE estado.est_modulo = 'ENTREGA'
           AND estado.est_codigo IN ('ENTREGA_PARCIAL', 'ENTREGADA')
         GROUP BY ent.ent_id, ent.ent_codigo, sol.sol_codigo, ben.ben_nombre, estado.est_codigo, ent.ent_fecha_entrega
         ORDER BY ent.ent_fecha_entrega DESC, ent.ent_id DESC
         LIMIT 5`
      ),
    ]);

    const [resumenRows] = resultados[0];
    const [produccionPorEtapaRows] = resultados[1];
    const [inventarioPorEspecieRows] = resultados[2];
    const [solicitudesPorEstadoRows] = resultados[3];
    const [ultimasEntregasRows] = resultados[4];

    const resumen = resumenRows[0];
    return res.status(200).json({
      ok: true,
      resumen: {
        lotes_en_produccion: Number(resumen.lotes_en_produccion),
        plantas_disponibles: Number(resumen.plantas_disponibles),
        plantas_reservadas: Number(resumen.plantas_reservadas),
        solicitudes_pendientes: Number(resumen.solicitudes_pendientes),
        solicitudes_atendidas: Number(resumen.solicitudes_atendidas),
        plantas_entregadas: Number(resumen.plantas_entregadas),
      },
      produccion_por_etapa: produccionPorEtapaRows.map((row) => ({
        codigo_estado: row.codigo_estado,
        nombre_estado: row.nombre_estado,
        cantidad_lotes: Number(row.cantidad_lotes),
      })),
      inventario_por_especie: inventarioPorEspecieRows.map((row) => ({
        id_especie: row.id_especie,
        especie: row.especie,
        cantidad_total: Number(row.cantidad_total),
        cantidad_reservada: Number(row.cantidad_reservada),
        cantidad_disponible: Number(row.cantidad_disponible),
      })),
      solicitudes_por_estado: solicitudesPorEstadoRows.map((row) => ({
        codigo_estado: row.codigo_estado,
        nombre_estado: row.nombre_estado,
        cantidad_solicitudes: Number(row.cantidad_solicitudes),
      })),
      ultimas_entregas: ultimasEntregasRows.map((row) => ({
        id_entrega: row.id_entrega,
        codigo_entrega: row.codigo_entrega,
        codigo_solicitud: row.codigo_solicitud,
        beneficiario: row.beneficiario,
        estado: row.estado,
        fecha_entrega: row.fecha_entrega,
        total_entregado: Number(row.total_entregado),
      })),
    });
  } catch (error) {
    console.error('Error al obtener dashboard de reportes:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

async function obtenerReporteGeneral(req, res) {
  if (requiereRol(ROLES_LECTURA, req, res)) return;
  const rango = obtenerRangoFechas(req, res);
  if (!rango) return;

  try {
    if (rango.modo === 'todo') {
      const [resumenRows, produccionRows, solicitudesRows, inventarioRows, entregasRows] = await Promise.all([
        pool.execute(
          `SELECT
             SUM(estado.est_codigo IN ('PLANIFICADO', 'SIEMBRA', 'GERMINACION', 'CRECIMIENTO', 'ENDURECIMIENTO', 'DISPONIBLE')) AS lotes_en_produccion,
             SUM(estado.est_codigo = 'FINALIZADO') AS lotes_finalizados,
             SUM(estado.est_codigo = 'CANCELADO') AS lotes_cancelados
           FROM lot_lotes lot
           INNER JOIN est_estados estado ON estado.est_id = lot.lot_id_estado_proceso`
        ),
        pool.execute(`SELECT estado.est_codigo AS codigo_estado, estado.est_descripcion AS nombre_estado, COUNT(lot.lot_id) AS cantidad_lotes FROM est_estados estado LEFT JOIN lot_lotes lot ON lot.lot_id_estado_proceso = estado.est_id WHERE estado.est_modulo = 'PRODUCCION' AND estado.est_estado = 1 GROUP BY estado.est_id, estado.est_codigo, estado.est_descripcion, estado.est_orden ORDER BY estado.est_orden, estado.est_id`),
        pool.execute(`SELECT estado.est_codigo AS codigo_estado, estado.est_descripcion AS nombre_estado, COUNT(sol.sol_id) AS cantidad_solicitudes FROM est_estados estado LEFT JOIN sol_solicitudes sol ON sol.sol_id_estado_proceso = estado.est_id WHERE estado.est_modulo = 'SOLICITUD' AND estado.est_estado = 1 GROUP BY estado.est_id, estado.est_codigo, estado.est_descripcion, estado.est_orden ORDER BY estado.est_orden, estado.est_id`),
        pool.execute(`SELECT especie.esp_id AS id_especie, especie.esp_nombre_comun AS especie, SUM(inv.inv_cantidad_total) AS cantidad_total, SUM(inv.inv_cantidad_reservada) AS cantidad_reservada, SUM(inv.inv_cantidad_total - inv.inv_cantidad_reservada) AS cantidad_disponible FROM inv_inventario inv INNER JOIN lot_lotes lot ON lot.lot_id = inv.inv_id_lote INNER JOIN esp_especies especie ON especie.esp_id = lot.lot_id_especie WHERE inv.inv_estado = 1 AND inv.inv_cantidad_total > 0 GROUP BY especie.esp_id, especie.esp_nombre_comun ORDER BY especie.esp_nombre_comun`),
        pool.execute(`SELECT ent.ent_id AS id_entrega, ent.ent_codigo AS codigo_entrega, sol.sol_codigo AS codigo_solicitud, ben.ben_nombre AS beneficiario, estado.est_codigo AS estado, ent.ent_fecha_entrega AS fecha_entrega, SUM(detalle.end_cantidad_entregada) AS total_entregado FROM ent_entregas ent INNER JOIN sol_solicitudes sol ON sol.sol_id = ent.ent_id_solicitud INNER JOIN ben_beneficiarios ben ON ben.ben_id = ent.ent_id_beneficiario INNER JOIN est_estados estado ON estado.est_id = ent.ent_id_estado_proceso INNER JOIN end_entregas_detalle detalle ON detalle.end_id_entrega = ent.ent_id WHERE estado.est_codigo IN ('ENTREGA_PARCIAL', 'ENTREGADA') GROUP BY ent.ent_id, ent.ent_codigo, sol.sol_codigo, ben.ben_nombre, estado.est_codigo, ent.ent_fecha_entrega ORDER BY ent.ent_fecha_entrega DESC, ent.ent_id DESC LIMIT 5`),
      ]);
      const [inventarioResumenRows, solicitudesResumenRows, entregasResumenRows, plantasEntregadasRows] = await Promise.all([
        pool.execute(`SELECT COALESCE(SUM(inv_cantidad_total - inv_cantidad_reservada), 0) AS plantas_disponibles_actuales, COALESCE(SUM(inv_cantidad_reservada), 0) AS plantas_reservadas_actuales FROM inv_inventario WHERE inv_estado = 1 AND inv_cantidad_total > 0`),
        pool.execute(`SELECT COUNT(*) AS solicitudes_totales, SUM(estado.est_codigo = 'ATENDIDA') AS solicitudes_atendidas FROM sol_solicitudes sol INNER JOIN est_estados estado ON estado.est_id = sol.sol_id_estado_proceso`),
        pool.execute(`SELECT SUM(estado.est_codigo = 'ENTREGA_PARCIAL') AS entregas_parciales, SUM(estado.est_codigo = 'ENTREGADA') AS entregas_finales FROM ent_entregas ent INNER JOIN est_estados estado ON estado.est_id = ent.ent_id_estado_proceso`),
        pool.execute(`SELECT COALESCE(SUM(end_cantidad_entregada), 0) AS plantas_entregadas_total FROM end_entregas_detalle`),
      ]);
      const resumen = { ...resumenRows[0][0], ...inventarioResumenRows[0][0], ...solicitudesResumenRows[0][0], ...entregasResumenRows[0][0], ...plantasEntregadasRows[0][0] };
      return res.status(200).json(respuestaReporte(rango, {
        resumen: Object.fromEntries(Object.entries(resumen).map(([key, value]) => [key, Number(value) || 0])),
        produccion_por_estado: mapFilasNumericas(produccionRows[0], ['cantidad_lotes']),
        solicitudes_por_estado: mapFilasNumericas(solicitudesRows[0], ['cantidad_solicitudes']),
        inventario_por_especie: mapFilasNumericas(inventarioRows[0], ['id_especie', 'cantidad_total', 'cantidad_reservada', 'cantidad_disponible']),
        ultimas_entregas: mapFilasNumericas(entregasRows[0], ['id_entrega', 'total_entregado']),
      }));
    }

    const params = [rango.fechaDesde, rango.fechaHasta];
    const [actividadRows, movimientosRows, produccionRows, solicitudesRows, entregasRows] = await Promise.all([
      pool.execute(
        `SELECT
           (SELECT COUNT(*) FROM lot_lotes WHERE lot_fecha_inicio BETWEEN ? AND ?) AS lotes_iniciados,
           (SELECT COUNT(*) FROM sol_solicitudes WHERE sol_fecha_solicitud BETWEEN ? AND ?) AS solicitudes_registradas,
           (SELECT COUNT(*) FROM sol_solicitudes WHERE DATE(sol_fecha_revision) BETWEEN ? AND ?) AS solicitudes_revisadas,
           (SELECT COUNT(*) FROM ent_entregas ent INNER JOIN est_estados estado ON estado.est_id = ent.ent_id_estado_proceso WHERE estado.est_codigo IN ('ENTREGA_PARCIAL', 'ENTREGADA') AND ent.ent_fecha_entrega BETWEEN ? AND ?) AS entregas_realizadas,
           (SELECT COALESCE(SUM(detalle.end_cantidad_entregada), 0) FROM end_entregas_detalle detalle INNER JOIN ent_entregas ent ON ent.ent_id = detalle.end_id_entrega INNER JOIN est_estados estado ON estado.est_id = ent.ent_id_estado_proceso WHERE estado.est_codigo IN ('ENTREGA_PARCIAL', 'ENTREGADA') AND ent.ent_fecha_entrega BETWEEN ? AND ?) AS plantas_entregadas,
           (SELECT COUNT(*) FROM mov_movimientos_inventario WHERE mov_estado = 1 AND DATE(mov_fecha) BETWEEN ? AND ?) AS movimientos_inventario,
           (SELECT COALESCE(SUM(mov_cantidad), 0) FROM mov_movimientos_inventario WHERE mov_estado = 1 AND mov_tipo = 'INGRESO' AND DATE(mov_fecha) BETWEEN ? AND ?) AS plantas_ingresadas,
           (SELECT COALESCE(SUM(mov_cantidad), 0) FROM mov_movimientos_inventario WHERE mov_estado = 1 AND mov_tipo IN ('SALIDA_ENTREGA', 'PERDIDA', 'AJUSTE_NEGATIVO') AND DATE(mov_fecha) BETWEEN ? AND ?) AS plantas_salidas`,
        [...params, ...params, ...params, ...params, ...params, ...params, ...params, ...params]
      ),
      pool.execute(`SELECT mov_tipo AS tipo_movimiento, COUNT(*) AS cantidad_movimientos, COALESCE(SUM(mov_cantidad), 0) AS cantidad_plantas FROM mov_movimientos_inventario WHERE mov_estado = 1 AND DATE(mov_fecha) BETWEEN ? AND ? GROUP BY mov_tipo ORDER BY mov_tipo`, params),
      pool.execute(`SELECT estado.est_codigo AS codigo_estado, COUNT(*) AS cantidad_lotes FROM lot_lotes lot INNER JOIN est_estados estado ON estado.est_id = lot.lot_id_estado_proceso WHERE lot.lot_fecha_inicio BETWEEN ? AND ? GROUP BY estado.est_codigo ORDER BY estado.est_codigo`, params),
      pool.execute(`SELECT estado.est_codigo AS codigo_estado, COUNT(*) AS cantidad_solicitudes FROM sol_solicitudes sol INNER JOIN est_estados estado ON estado.est_id = sol.sol_id_estado_proceso WHERE sol.sol_fecha_solicitud BETWEEN ? AND ? GROUP BY estado.est_codigo ORDER BY estado.est_codigo`, params),
      pool.execute(`SELECT ent.ent_codigo AS codigo_entrega, ent.ent_fecha_entrega AS fecha_entrega, estado.est_codigo AS estado, COALESCE(SUM(detalle.end_cantidad_entregada), 0) AS total_entregado FROM ent_entregas ent INNER JOIN est_estados estado ON estado.est_id = ent.ent_id_estado_proceso INNER JOIN end_entregas_detalle detalle ON detalle.end_id_entrega = ent.ent_id WHERE estado.est_codigo IN ('ENTREGA_PARCIAL', 'ENTREGADA') AND ent.ent_fecha_entrega BETWEEN ? AND ? GROUP BY ent.ent_id, ent.ent_codigo, ent.ent_fecha_entrega, estado.est_codigo ORDER BY ent.ent_fecha_entrega DESC, ent.ent_id DESC`, params),
    ]);
    return res.status(200).json(respuestaReporte(rango, {
      resumen: Object.fromEntries(Object.entries(actividadRows[0][0]).map(([key, value]) => [key, Number(value) || 0])),
      movimientos_por_tipo: mapFilasNumericas(movimientosRows[0], ['cantidad_movimientos', 'cantidad_plantas']),
      produccion_por_estado: mapFilasNumericas(produccionRows[0], ['cantidad_lotes']),
      solicitudes_por_estado: mapFilasNumericas(solicitudesRows[0], ['cantidad_solicitudes']),
      entregas_realizadas: mapFilasNumericas(entregasRows[0], ['total_entregado']),
    }));
  } catch (error) {
    console.error('Error al obtener reporte general:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

async function obtenerReporteProduccion(req, res) {
  if (requiereRol(ROLES_LECTURA, req, res)) return;
  const rango = obtenerRangoFechas(req, res);
  if (!rango) return;
  const where = rango.modo === 'rango' ? 'WHERE lot.lot_fecha_inicio BETWEEN ? AND ?' : '';
  const params = rango.modo === 'rango' ? [rango.fechaDesde, rango.fechaHasta] : [];
  try {
    const [rows] = await pool.execute(
      `SELECT lot.lot_codigo AS codigo_lote, especie.esp_nombre_comun AS especie, lot.lot_fecha_inicio AS fecha_inicio, lot.lot_cantidad_inicial AS cantidad_inicial, lot.lot_cantidad_actual AS cantidad_actual, estado.est_codigo AS estado FROM lot_lotes lot INNER JOIN esp_especies especie ON especie.esp_id = lot.lot_id_especie INNER JOIN est_estados estado ON estado.est_id = lot.lot_id_estado_proceso ${where} ORDER BY lot.lot_fecha_inicio DESC, lot.lot_id DESC`,
      params
    );
    return res.status(200).json(respuestaReporte(rango, { datos: mapFilasNumericas(rows, ['cantidad_inicial', 'cantidad_actual']) }));
  } catch (error) {
    console.error('Error al obtener reporte de producción:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

async function obtenerReporteInventario(req, res) {
  if (requiereRol(ROLES_LECTURA, req, res)) return;
  const rango = obtenerRangoFechas(req, res);
  if (!rango) return;
  try {
    if (rango.modo === 'todo') {
      const [rows] = await pool.execute(`SELECT especie.esp_nombre_comun AS especie, lot.lot_codigo AS lote, inv.inv_cantidad_total AS cantidad_total, inv.inv_cantidad_reservada AS cantidad_reservada, inv.inv_cantidad_total - inv.inv_cantidad_reservada AS cantidad_disponible, inv.inv_estado AS estado_operativo FROM inv_inventario inv INNER JOIN lot_lotes lot ON lot.lot_id = inv.inv_id_lote INNER JOIN esp_especies especie ON especie.esp_id = lot.lot_id_especie ORDER BY especie.esp_nombre_comun, lot.lot_codigo`);
      return res.status(200).json(respuestaReporte(rango, { datos: mapFilasNumericas(rows, ['cantidad_total', 'cantidad_reservada', 'cantidad_disponible', 'estado_operativo']) }));
    }
    const [rows, resumenRows] = await Promise.all([
      pool.execute(`SELECT mov.mov_fecha AS fecha, mov.mov_tipo AS tipo_movimiento, especie.esp_nombre_comun AS especie, lot.lot_codigo AS lote, mov.mov_cantidad AS cantidad, mov.mov_referencia AS referencia, mov.mov_observaciones AS observacion FROM mov_movimientos_inventario mov INNER JOIN inv_inventario inv ON inv.inv_id = mov.mov_id_inventario INNER JOIN lot_lotes lot ON lot.lot_id = inv.inv_id_lote INNER JOIN esp_especies especie ON especie.esp_id = lot.lot_id_especie WHERE mov.mov_estado = 1 AND DATE(mov.mov_fecha) BETWEEN ? AND ? ORDER BY mov.mov_fecha DESC, mov.mov_id DESC`, [rango.fechaDesde, rango.fechaHasta]),
      pool.execute(`SELECT mov_tipo AS tipo_movimiento, COUNT(*) AS cantidad_movimientos, COALESCE(SUM(mov_cantidad), 0) AS cantidad_plantas FROM mov_movimientos_inventario WHERE mov_estado = 1 AND DATE(mov_fecha) BETWEEN ? AND ? GROUP BY mov_tipo ORDER BY mov_tipo`, [rango.fechaDesde, rango.fechaHasta]),
    ]);
    return res.status(200).json(respuestaReporte(rango, { datos: mapFilasNumericas(rows[0], ['cantidad']), resumen_por_tipo: mapFilasNumericas(resumenRows[0], ['cantidad_movimientos', 'cantidad_plantas']) }));
  } catch (error) {
    console.error('Error al obtener reporte de inventario:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

async function obtenerReporteSolicitudes(req, res) {
  if (requiereRol(ROLES_LECTURA, req, res)) return;
  const rango = obtenerRangoFechas(req, res);
  if (!rango) return;
  const where = rango.modo === 'rango' ? 'WHERE sol.sol_fecha_solicitud BETWEEN ? AND ?' : '';
  const params = rango.modo === 'rango' ? [rango.fechaDesde, rango.fechaHasta] : [];
  try {
    const [rows] = await pool.execute(`SELECT sol.sol_codigo AS codigo_solicitud, ben.ben_nombre AS beneficiario, sol.sol_fecha_solicitud AS fecha_solicitud, sol.sol_fecha_requerida AS fecha_requerida, estado.est_codigo AS estado, COALESCE(detalles.total_solicitado, 0) AS total_solicitado FROM sol_solicitudes sol INNER JOIN ben_beneficiarios ben ON ben.ben_id = sol.sol_id_beneficiario INNER JOIN est_estados estado ON estado.est_id = sol.sol_id_estado_proceso LEFT JOIN (SELECT sod_id_solicitud, SUM(sod_cantidad_solicitada) AS total_solicitado FROM sod_solicitudes_detalle GROUP BY sod_id_solicitud) detalles ON detalles.sod_id_solicitud = sol.sol_id ${where} ORDER BY sol.sol_fecha_solicitud DESC, sol.sol_id DESC`, params);
    return res.status(200).json(respuestaReporte(rango, { datos: mapFilasNumericas(rows, ['total_solicitado']) }));
  } catch (error) {
    console.error('Error al obtener reporte de solicitudes:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

async function obtenerReporteEntregas(req, res) {
  if (requiereRol(ROLES_LECTURA, req, res)) return;
  const rango = obtenerRangoFechas(req, res);
  if (!rango) return;
  const rangeSql = rango.modo === 'rango' ? 'AND ent.ent_fecha_entrega BETWEEN ? AND ?' : '';
  const params = rango.modo === 'rango' ? [rango.fechaDesde, rango.fechaHasta] : [];
  try {
    const [rows] = await pool.execute(`SELECT ent.ent_codigo AS codigo_entrega, sol.sol_codigo AS codigo_solicitud, ben.ben_nombre AS beneficiario, ent.ent_fecha_entrega AS fecha_entrega, estado.est_codigo AS estado, COALESCE(SUM(detalle.end_cantidad_entregada), 0) AS total_entregado FROM ent_entregas ent INNER JOIN sol_solicitudes sol ON sol.sol_id = ent.ent_id_solicitud INNER JOIN ben_beneficiarios ben ON ben.ben_id = ent.ent_id_beneficiario INNER JOIN est_estados estado ON estado.est_id = ent.ent_id_estado_proceso INNER JOIN end_entregas_detalle detalle ON detalle.end_id_entrega = ent.ent_id WHERE estado.est_codigo IN ('ENTREGA_PARCIAL', 'ENTREGADA') ${rangeSql} GROUP BY ent.ent_id, ent.ent_codigo, sol.sol_codigo, ben.ben_nombre, ent.ent_fecha_entrega, estado.est_codigo ORDER BY ent.ent_fecha_entrega DESC, ent.ent_id DESC`, params);
    return res.status(200).json(respuestaReporte(rango, { datos: mapFilasNumericas(rows, ['total_entregado']) }));
  } catch (error) {
    console.error('Error al obtener reporte de entregas:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

module.exports = {
  obtenerDashboard,
  obtenerReporteGeneral,
  obtenerReporteProduccion,
  obtenerReporteInventario,
  obtenerReporteSolicitudes,
  obtenerReporteEntregas,
};
