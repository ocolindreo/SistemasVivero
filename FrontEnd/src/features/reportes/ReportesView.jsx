import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import DataTable from '../../components/DataTable'
import {
  obtenerReporteEntregas,
  obtenerReporteGeneral,
  obtenerReporteInventario,
  obtenerReporteProduccion,
  obtenerReporteSolicitudes,
} from '../../services/api'

function formatearNumero(value) {
  return new Intl.NumberFormat('es-GT').format(Number(value) || 0)
}

function formatearFecha(fecha) {
  if (!fecha) return '—'
  const [year, month, day] = String(fecha).split('T')[0].split('-')
  return year && month && day ? `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}` : '—'
}

function mapError(error, fallbackMessage) {
  if (error?.status === 403) return 'No tiene permisos para consultar los reportes.'
  return error?.message || fallbackMessage
}

function EstadoEntregaBadge({ codigo }) {
  const className = codigo === 'ENTREGADA' ? 'status-active' : codigo === 'ENTREGA_PARCIAL' ? 'status-partial' : 'status-inactive'
  return <span className={`status-badge ${className}`}>{codigo || '—'}</span>
}

const REPORTES = {
  GENERAL: { label: 'General', obtener: obtenerReporteGeneral },
  PRODUCCION: { label: 'Producción', obtener: obtenerReporteProduccion },
  INVENTARIO: { label: 'Inventario', obtener: obtenerReporteInventario },
  SOLICITUDES: { label: 'Solicitudes', obtener: obtenerReporteSolicitudes },
  ENTREGAS: { label: 'Entregas', obtener: obtenerReporteEntregas },
}

function ResumenCard({ label, value, tone }) {
  return <article className={`reportes-summary-card reportes-summary-${tone}`}>
    <span>{label}</span>
    <strong>{formatearNumero(value)}</strong>
  </article>
}

function formatearFechaHora(fecha) {
  if (!fecha) return '—'
  const day = String(fecha.getDate()).padStart(2, '0')
  const month = String(fecha.getMonth() + 1).padStart(2, '0')
  const year = fecha.getFullYear()
  const hours = String(fecha.getHours()).padStart(2, '0')
  const minutes = String(fecha.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

function nombreReporte(tipoReporte, esRango) {
  if (tipoReporte === 'INVENTARIO' && esRango) return 'Movimientos de inventario del período'
  return `Reporte de ${REPORTES[tipoReporte].label}`
}

function TablaImprimible({ columnas, datos, vacio }) {
  if (!datos?.length) return <p className="reportes-print-empty">{vacio}</p>
  return <table className="reportes-print-table"><thead><tr>{columnas.map((columna) => <th key={columna.label}>{columna.label}</th>)}</tr></thead><tbody>{datos.map((fila, index) => <tr key={fila.id ?? fila.codigo_entrega ?? fila.codigo_lote ?? fila.codigo_solicitud ?? fila.codigo_estado ?? fila.tipo_movimiento ?? index}>{columnas.map((columna) => <td key={columna.label}>{columna.valor(fila)}</td>)}</tr>)}</tbody></table>
}

function SeccionImprimible({ titulo, children }) {
  return <section className="reportes-print-section"><h2>{titulo}</h2>{children}</section>
}

function ReporteImprimible({ tipoReporte, reporte, impresion }) {
  if (!reporte || !impresion) return null
  const esRango = reporte.modo === 'rango'
  const periodo = esRango ? `${formatearFecha(reporte.fecha_desde)} al ${formatearFecha(reporte.fecha_hasta)}` : 'Todo el período'
  const resumen = reporte.resumen || {}
  const resumenGeneral = esRango
    ? [['Lotes iniciados', resumen.lotes_iniciados], ['Solicitudes registradas', resumen.solicitudes_registradas], ['Solicitudes revisadas', resumen.solicitudes_revisadas], ['Entregas realizadas', resumen.entregas_realizadas], ['Plantas entregadas', resumen.plantas_entregadas], ['Movimientos de inventario', resumen.movimientos_inventario], ['Plantas ingresadas', resumen.plantas_ingresadas], ['Plantas salidas', resumen.plantas_salidas]]
    : [['Lotes en producción', resumen.lotes_en_produccion], ['Lotes finalizados', resumen.lotes_finalizados], ['Lotes cancelados', resumen.lotes_cancelados], ['Plantas disponibles actuales', resumen.plantas_disponibles_actuales], ['Plantas reservadas actuales', resumen.plantas_reservadas_actuales], ['Solicitudes totales', resumen.solicitudes_totales], ['Solicitudes atendidas', resumen.solicitudes_atendidas], ['Entregas parciales', resumen.entregas_parciales], ['Entregas finales', resumen.entregas_finales], ['Plantas entregadas total', resumen.plantas_entregadas_total]]
  const columnasEstadoProduccion = [{ label: 'Estado', valor: (fila) => fila.nombre_estado || fila.codigo_estado }, { label: 'Lotes', valor: (fila) => formatearNumero(fila.cantidad_lotes) }]
  const columnasEstadoSolicitud = [{ label: 'Estado', valor: (fila) => fila.nombre_estado || fila.codigo_estado }, { label: 'Cantidad', valor: (fila) => formatearNumero(fila.cantidad_solicitudes) }]
  const columnasInventario = [{ label: 'Especie', valor: (fila) => fila.especie }, { label: 'Total', valor: (fila) => formatearNumero(fila.cantidad_total) }, { label: 'Reservado', valor: (fila) => formatearNumero(fila.cantidad_reservada) }, { label: 'Disponible', valor: (fila) => formatearNumero(fila.cantidad_disponible) }]
  const columnasEntregas = [{ label: 'Entrega', valor: (fila) => fila.codigo_entrega }, { label: 'Solicitud', valor: (fila) => fila.codigo_solicitud }, { label: 'Beneficiario', valor: (fila) => fila.beneficiario }, { label: 'Fecha entrega', valor: (fila) => formatearFecha(fila.fecha_entrega) }, { label: 'Estado', valor: (fila) => fila.estado }, { label: 'Total entregado', valor: (fila) => formatearNumero(fila.total_entregado) }]
  const columnasProduccion = [{ label: 'Código lote', valor: (fila) => fila.codigo_lote }, { label: 'Especie', valor: (fila) => fila.especie }, { label: 'Fecha inicio', valor: (fila) => formatearFecha(fila.fecha_inicio) }, { label: 'Cantidad inicial', valor: (fila) => formatearNumero(fila.cantidad_inicial) }, { label: 'Cantidad actual', valor: (fila) => formatearNumero(fila.cantidad_actual) }, { label: 'Estado', valor: (fila) => fila.estado }]
  const columnasMovimientos = [{ label: 'Fecha', valor: (fila) => formatearFecha(fila.fecha) }, { label: 'Tipo movimiento', valor: (fila) => fila.tipo_movimiento }, { label: 'Especie', valor: (fila) => fila.especie }, { label: 'Lote', valor: (fila) => fila.lote }, { label: 'Cantidad', valor: (fila) => formatearNumero(fila.cantidad) }, { label: 'Referencia', valor: (fila) => fila.referencia || '—' }, { label: 'Observación', valor: (fila) => fila.observacion || '—' }]
  const columnasSolicitudes = [{ label: 'Solicitud', valor: (fila) => fila.codigo_solicitud }, { label: 'Beneficiario', valor: (fila) => fila.beneficiario }, { label: 'Fecha solicitud', valor: (fila) => formatearFecha(fila.fecha_solicitud) }, { label: 'Fecha requerida', valor: (fila) => formatearFecha(fila.fecha_requerida) }, { label: 'Estado', valor: (fila) => fila.estado }, { label: 'Total solicitado', valor: (fila) => formatearNumero(fila.total_solicitado) }]

  return <article className="reportes-print-document" aria-label="Reporte imprimible"><header><p>Vivero Municipal</p><h1>{nombreReporte(tipoReporte, esRango)}</h1><div><span><strong>Período:</strong> {periodo}</span><span><strong>Generado:</strong> {formatearFechaHora(impresion.fecha)}</span><span><strong>Generado por:</strong> {impresion.username}</span></div></header>{tipoReporte === 'GENERAL' && <>{<SeccionImprimible titulo="Resumen"> <div className="reportes-print-summary">{resumenGeneral.map(([label, valor]) => <div key={label}><span>{label}</span><strong>{formatearNumero(valor)}</strong></div>)}</div></SeccionImprimible>}{esRango ? <><SeccionImprimible titulo="Movimientos por tipo"><TablaImprimible columnas={[{ label: 'Tipo', valor: (fila) => fila.tipo_movimiento }, { label: 'Movimientos', valor: (fila) => formatearNumero(fila.cantidad_movimientos) }, { label: 'Plantas', valor: (fila) => formatearNumero(fila.cantidad_plantas) }]} datos={reporte.movimientos_por_tipo} vacio="No hay movimientos en el período." /></SeccionImprimible><SeccionImprimible titulo="Producción por estado del período"><TablaImprimible columnas={columnasEstadoProduccion} datos={reporte.produccion_por_estado} vacio="No hay lotes iniciados en el período." /></SeccionImprimible><SeccionImprimible titulo="Solicitudes por estado del período"><TablaImprimible columnas={columnasEstadoSolicitud} datos={reporte.solicitudes_por_estado} vacio="No hay solicitudes en el período." /></SeccionImprimible><SeccionImprimible titulo="Entregas realizadas del período"><TablaImprimible columnas={columnasEntregas} datos={reporte.entregas_realizadas} vacio="No hay entregas realizadas en el período." /></SeccionImprimible></> : <><SeccionImprimible titulo="Producción por estado"><TablaImprimible columnas={columnasEstadoProduccion} datos={reporte.produccion_por_estado} vacio="No hay lotes registrados." /></SeccionImprimible><SeccionImprimible titulo="Solicitudes por estado"><TablaImprimible columnas={columnasEstadoSolicitud} datos={reporte.solicitudes_por_estado} vacio="No hay solicitudes registradas." /></SeccionImprimible><SeccionImprimible titulo="Inventario actual por especie"><TablaImprimible columnas={columnasInventario} datos={reporte.inventario_por_especie} vacio="No hay inventario operativo disponible." /></SeccionImprimible><SeccionImprimible titulo="Últimas entregas"><TablaImprimible columnas={columnasEntregas} datos={reporte.ultimas_entregas} vacio="No hay entregas confirmadas registradas." /></SeccionImprimible></>}</>}{tipoReporte === 'PRODUCCION' && <SeccionImprimible titulo="Lotes de producción"><TablaImprimible columnas={columnasProduccion} datos={reporte.datos} vacio="No hay lotes para el período seleccionado." /></SeccionImprimible>}{tipoReporte === 'INVENTARIO' && <>{<SeccionImprimible titulo={esRango ? 'Movimientos de inventario del período' : 'Inventario actual'}><TablaImprimible columnas={esRango ? columnasMovimientos : [...columnasInventario, { label: 'Lote', valor: (fila) => fila.lote }, { label: 'Estado', valor: (fila) => Number(fila.estado_operativo) === 1 ? 'Activo' : 'Histórico / agotado' }]} datos={reporte.datos} vacio={esRango ? 'No hay movimientos de inventario en el período.' : 'No hay inventario registrado.'} /></SeccionImprimible>}{esRango && <SeccionImprimible titulo="Resumen por tipo de movimiento"><TablaImprimible columnas={[{ label: 'Tipo', valor: (fila) => fila.tipo_movimiento }, { label: 'Movimientos', valor: (fila) => formatearNumero(fila.cantidad_movimientos) }, { label: 'Plantas', valor: (fila) => formatearNumero(fila.cantidad_plantas) }]} datos={reporte.resumen_por_tipo} vacio="No hay movimientos en el período." /></SeccionImprimible>}</>}{tipoReporte === 'SOLICITUDES' && <SeccionImprimible titulo="Solicitudes"><TablaImprimible columnas={columnasSolicitudes} datos={reporte.datos} vacio="No hay solicitudes para el período seleccionado." /></SeccionImprimible>}{tipoReporte === 'ENTREGAS' && <SeccionImprimible titulo="Entregas realizadas"><TablaImprimible columnas={columnasEntregas} datos={reporte.datos} vacio="No hay entregas realizadas para el período seleccionado." /></SeccionImprimible>}</article>
}

function ReportesView({ currentUser, onSessionInvalid }) {
  const [tipoReporte, setTipoReporte] = useState('GENERAL')
  const [modoPeriodo, setModoPeriodo] = useState('TODO')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [rangoAplicado, setRangoAplicado] = useState(null)
  const [reporte, setReporte] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [impresion, setImpresion] = useState(null)

  async function cargarReporte(reporteSeleccionado = tipoReporte, rango = modoPeriodo === 'RANGO' ? rangoAplicado : null) {
    setLoading(true)
    setError('')

    try {
      const response = await REPORTES[reporteSeleccionado].obtener(rango?.fechaDesde, rango?.fechaHasta)
      setReporte(response)
    } catch (err) {
      if (err?.status === 401) {
        onSessionInvalid?.()
        return
      }
      setError(mapError(err, 'No fue posible cargar el resumen de reportes.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (modoPeriodo === 'RANGO' && !rangoAplicado) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarReporte(tipoReporte, modoPeriodo === 'RANGO' ? rangoAplicado : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoReporte, modoPeriodo])

  function cambiarModoPeriodo(nuevoModo) {
    setModoPeriodo(nuevoModo)
    if (nuevoModo === 'TODO') setRangoAplicado(null)
  }

  function aplicarRango() {
    if (!fechaDesde || !fechaHasta) {
      setError('Debe indicar Fecha desde y Fecha hasta.')
      return
    }
    if (fechaDesde > fechaHasta) {
      setError('La Fecha desde no puede ser posterior a la Fecha hasta.')
      return
    }
    const rango = { fechaDesde, fechaHasta }
    setRangoAplicado(rango)
    cargarReporte(tipoReporte, rango)
  }

  const maxLotesPorEtapa = useMemo(() => Math.max(1, ...(reporte?.produccion_por_estado || []).map((item) => Number(item.cantidad_lotes) || 0)), [reporte])

  const inventarioColumns = [
    { key: 'especie', label: 'Especie', sortable: true },
    { key: 'cantidad_total', label: 'Total', sortable: true, render: (item) => formatearNumero(item.cantidad_total) },
    { key: 'cantidad_reservada', label: 'Reservado', sortable: true, render: (item) => formatearNumero(item.cantidad_reservada) },
    { key: 'cantidad_disponible', label: 'Disponible', sortable: true, render: (item) => formatearNumero(item.cantidad_disponible) },
  ]

  const solicitudesColumns = [
    { key: 'nombre_estado', label: 'Estado', sortable: true },
    { key: 'cantidad_solicitudes', label: 'Cantidad', sortable: true, render: (item) => formatearNumero(item.cantidad_solicitudes) },
  ]

  const entregasColumns = [
    { key: 'codigo_entrega', label: 'Entrega', sortable: true },
    { key: 'codigo_solicitud', label: 'Solicitud', sortable: true },
    { key: 'beneficiario', label: 'Beneficiario', sortable: true },
    { key: 'estado', label: 'Estado', sortable: true, render: (item) => <EstadoEntregaBadge codigo={item.estado} /> },
    { key: 'fecha_entrega', label: 'Fecha entrega', sortable: true, render: (item) => formatearFecha(item.fecha_entrega) },
    { key: 'total_entregado', label: 'Total entregado', sortable: true, render: (item) => formatearNumero(item.total_entregado) },
  ]

  const produccionColumns = [
    { key: 'codigo_lote', label: 'Código lote', sortable: true },
    { key: 'especie', label: 'Especie', sortable: true },
    { key: 'fecha_inicio', label: 'Fecha inicio', sortable: true, render: (item) => formatearFecha(item.fecha_inicio) },
    { key: 'cantidad_inicial', label: 'Cantidad inicial', sortable: true, render: (item) => formatearNumero(item.cantidad_inicial) },
    { key: 'cantidad_actual', label: 'Cantidad actual', sortable: true, render: (item) => formatearNumero(item.cantidad_actual) },
    { key: 'estado', label: 'Estado', sortable: true },
  ]

  const inventarioActualColumns = [
    { key: 'especie', label: 'Especie', sortable: true },
    { key: 'lote', label: 'Lote', sortable: true },
    { key: 'cantidad_total', label: 'Total', sortable: true, render: (item) => formatearNumero(item.cantidad_total) },
    { key: 'cantidad_reservada', label: 'Reservado', sortable: true, render: (item) => formatearNumero(item.cantidad_reservada) },
    { key: 'cantidad_disponible', label: 'Disponible', sortable: true, render: (item) => formatearNumero(item.cantidad_disponible) },
    { key: 'estado_operativo', label: 'Estado', sortable: true, render: (item) => Number(item.estado_operativo) === 1 ? <span className="status-badge status-active">Activo</span> : <span className="status-badge status-inactive">Histórico / agotado</span> },
  ]

  const movimientosColumns = [
    { key: 'fecha', label: 'Fecha', sortable: true, render: (item) => formatearFecha(item.fecha) },
    { key: 'tipo_movimiento', label: 'Tipo movimiento', sortable: true },
    { key: 'especie', label: 'Especie', sortable: true },
    { key: 'lote', label: 'Lote', sortable: true },
    { key: 'cantidad', label: 'Cantidad', sortable: true, render: (item) => formatearNumero(item.cantidad) },
    { key: 'referencia', label: 'Referencia', sortable: true, render: (item) => item.referencia || '—' },
    { key: 'observacion', label: 'Observación', sortable: true, render: (item) => item.observacion || '—' },
  ]

  const solicitudesReporteColumns = [
    { key: 'codigo_solicitud', label: 'Código solicitud', sortable: true },
    { key: 'beneficiario', label: 'Beneficiario', sortable: true },
    { key: 'fecha_solicitud', label: 'Fecha solicitud', sortable: true, render: (item) => formatearFecha(item.fecha_solicitud) },
    { key: 'fecha_requerida', label: 'Fecha requerida', sortable: true, render: (item) => formatearFecha(item.fecha_requerida) },
    { key: 'estado', label: 'Estado', sortable: true },
    { key: 'total_solicitado', label: 'Total solicitado', sortable: true, render: (item) => formatearNumero(item.total_solicitado) },
  ]

  const datosGenerales = reporte?.datos || []
  const esRango = reporte?.modo === 'rango'
  const tarjetasGenerales = esRango
    ? [['Lotes iniciados', 'lotes_iniciados', 'produccion'], ['Solicitudes registradas', 'solicitudes_registradas', 'pendientes'], ['Solicitudes revisadas', 'solicitudes_revisadas', 'atendidas'], ['Entregas realizadas', 'entregas_realizadas', 'entregadas'], ['Plantas entregadas', 'plantas_entregadas', 'entregadas'], ['Movimientos de inventario', 'movimientos_inventario', 'reservadas'], ['Plantas ingresadas', 'plantas_ingresadas', 'disponibles'], ['Plantas salidas', 'plantas_salidas', 'pendientes']]
    : [['Lotes en producción', 'lotes_en_produccion', 'produccion'], ['Lotes finalizados', 'lotes_finalizados', 'atendidas'], ['Lotes cancelados', 'lotes_cancelados', 'pendientes'], ['Plantas disponibles actuales', 'plantas_disponibles_actuales', 'disponibles'], ['Plantas reservadas actuales', 'plantas_reservadas_actuales', 'reservadas'], ['Solicitudes totales', 'solicitudes_totales', 'produccion'], ['Solicitudes atendidas', 'solicitudes_atendidas', 'atendidas'], ['Entregas parciales', 'entregas_parciales', 'reservadas'], ['Entregas finales', 'entregas_finales', 'entregadas'], ['Plantas entregadas total', 'plantas_entregadas_total', 'entregadas']]

  return (
    <section className="reportes-view" aria-labelledby="reportes-title">
      <header className="reportes-header">
        <div>
          <span className="page-kicker">Reportes</span>
          <h1 id="reportes-title">Reportes</h1>
          <p>Resumen general del Vivero Municipal</p>
        </div>
        {!loading && !error && reporte && <button type="button" className="button-secondary reportes-print-button" onClick={() => { flushSync(() => setImpresion({ fecha: new Date(), username: currentUser?.username || '—' })); window.print() }}>Imprimir {REPORTES[tipoReporte].label.toLowerCase()}</button>}
      </header>

      <div className="reportes-controls" aria-label="Configuración del reporte">
        <div className="catalog-tabs reportes-tabs" role="tablist" aria-label="Tipo de reporte">
          {Object.entries(REPORTES).map(([codigo, item]) => <button type="button" key={codigo} className={`catalog-tab ${tipoReporte === codigo ? 'catalog-tab-active' : ''}`} onClick={() => setTipoReporte(codigo)}>{item.label}</button>)}
        </div>
        <div className="reportes-periodo">
          <span>Período</span>
          <label><input type="radio" name="periodo" checked={modoPeriodo === 'TODO'} onChange={() => cambiarModoPeriodo('TODO')} /> Todo el período</label>
          <label><input type="radio" name="periodo" checked={modoPeriodo === 'RANGO'} onChange={() => cambiarModoPeriodo('RANGO')} /> Rango de fechas</label>
          {modoPeriodo === 'RANGO' && <div className="reportes-rango"><label>Fecha desde<input type="date" value={fechaDesde} onChange={(event) => setFechaDesde(event.target.value)} /></label><label>Fecha hasta<input type="date" value={fechaHasta} onChange={(event) => setFechaHasta(event.target.value)} /></label><button type="button" onClick={aplicarRango}>Aplicar</button></div>}
        </div>
      </div>

      {loading ? <div className="empty-state">Cargando reportes...</div> : null}
      {!loading && error ? <div className="empty-state error-state">{error}</div> : null}

      {!loading && !error && reporte ? (
        <>
          {tipoReporte === 'GENERAL' && <>
            <section className="reportes-summary-grid reportes-summary-grid-extended" aria-label="Indicadores principales">
              {tarjetasGenerales.map(([label, campo, tone]) => <ResumenCard key={campo} label={label} value={reporte.resumen?.[campo]} tone={tone} />)}
            </section>
            {esRango ? <>
              <section className="reportes-layout"><article className="reportes-panel"><h2>Movimientos por tipo</h2><DataTable columns={[{ key: 'tipo_movimiento', label: 'Tipo', sortable: true }, { key: 'cantidad_movimientos', label: 'Movimientos', sortable: true }, { key: 'cantidad_plantas', label: 'Plantas', sortable: true }]} data={reporte.movimientos_por_tipo || []} getRowKey={(item) => item.tipo_movimiento} emptyMessage="No hay movimientos en el período." /></article><article className="reportes-panel"><h2>Producción por estado del período</h2><DataTable columns={[{ key: 'codigo_estado', label: 'Estado', sortable: true }, { key: 'cantidad_lotes', label: 'Lotes', sortable: true }]} data={reporte.produccion_por_estado || []} getRowKey={(item) => item.codigo_estado} emptyMessage="No hay lotes iniciados en el período." /></article></section>
              <section className="reportes-layout"><article className="reportes-panel"><h2>Solicitudes por estado del período</h2><DataTable columns={solicitudesColumns} data={reporte.solicitudes_por_estado || []} getRowKey={(item) => item.codigo_estado} emptyMessage="No hay solicitudes en el período." /></article><article className="reportes-panel"><h2>Entregas realizadas del período</h2><DataTable columns={entregasColumns} data={reporte.entregas_realizadas || []} getRowKey={(item) => item.codigo_entrega} emptyMessage="No hay entregas realizadas en el período." /></article></section>
            </> : <>
              <section className="reportes-layout"><article className="reportes-panel reportes-etapas-panel"><h2>Producción por estado</h2><div className="reportes-stage-list">{(reporte.produccion_por_estado || []).map((item) => (
                  <div className="reportes-stage-row" key={item.codigo_estado}>
                    <div><span>{item.nombre_estado}</span><strong>{formatearNumero(item.cantidad_lotes)}</strong></div>
                    <span className="reportes-stage-track"><span style={{ width: `${((Number(item.cantidad_lotes) || 0) / maxLotesPorEtapa) * 100}%` }} /></span>
                  </div>
                ))}</div></article><article className="reportes-panel"><h2>Solicitudes por estado</h2><DataTable columns={solicitudesColumns} data={reporte.solicitudes_por_estado || []} getRowKey={(item) => item.codigo_estado} emptyMessage="No hay solicitudes registradas." /></article></section>
              <section className="reportes-panel"><h2>Inventario actual por especie</h2><DataTable columns={inventarioColumns} data={reporte.inventario_por_especie || []} getRowKey={(item) => item.id_especie} emptyMessage="No hay inventario operativo disponible." /></section>
              <section className="reportes-panel"><h2>Últimas entregas</h2><DataTable columns={entregasColumns} data={reporte.ultimas_entregas || []} getRowKey={(item) => item.id_entrega} emptyMessage="No hay entregas confirmadas registradas." /></section>
            </>}
          </>}
          {tipoReporte === 'PRODUCCION' && <section className="reportes-panel"><h2>Lotes de producción</h2><DataTable columns={produccionColumns} data={datosGenerales} getRowKey={(item) => item.codigo_lote} emptyMessage="No hay lotes para el período seleccionado." /></section>}
          {tipoReporte === 'INVENTARIO' && <><section className="reportes-panel"><h2>{esRango ? 'Movimientos de inventario del período' : 'Inventario actual'}</h2><DataTable columns={esRango ? movimientosColumns : inventarioActualColumns} data={datosGenerales} getRowKey={(item) => esRango ? `${item.fecha}-${item.lote}-${item.tipo_movimiento}` : item.lote} emptyMessage={esRango ? 'No hay movimientos de inventario en el período.' : 'No hay inventario registrado.'} /></section>{esRango && <section className="reportes-panel"><h2>Resumen por tipo de movimiento</h2><DataTable columns={[{ key: 'tipo_movimiento', label: 'Tipo', sortable: true }, { key: 'cantidad_movimientos', label: 'Movimientos', sortable: true }, { key: 'cantidad_plantas', label: 'Plantas', sortable: true }]} data={reporte.resumen_por_tipo || []} getRowKey={(item) => item.tipo_movimiento} emptyMessage="No hay movimientos en el período." /></section>}</>}
          {tipoReporte === 'SOLICITUDES' && <section className="reportes-panel"><h2>Solicitudes</h2><DataTable columns={solicitudesReporteColumns} data={datosGenerales} getRowKey={(item) => item.codigo_solicitud} emptyMessage="No hay solicitudes para el período seleccionado." /></section>}
          {tipoReporte === 'ENTREGAS' && <section className="reportes-panel"><h2>Entregas realizadas</h2><DataTable columns={entregasColumns} data={datosGenerales} getRowKey={(item) => item.codigo_entrega} emptyMessage="No hay entregas realizadas para el período seleccionado." /></section>}
        </>
      ) : null}
      <ReporteImprimible tipoReporte={tipoReporte} reporte={reporte} impresion={impresion} />
    </section>
  )
}

export default ReportesView
