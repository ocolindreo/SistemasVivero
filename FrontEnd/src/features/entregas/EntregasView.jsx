import { useEffect, useMemo, useState } from 'react'
import DataTable from '../../components/DataTable'
import Modal from '../../components/Modal'
import { obtenerEntregas, obtenerEntrega, crearEntrega, prepararEntrega, marcarEntregaLista, confirmarEntrega, obtenerSolicitudes, obtenerSolicitud, obtenerResponsablesProduccion } from '../../services/api'

const WRITE_ROLES = ['ADMIN', 'VIVERO']
const ESTADOS = ['TODOS', 'PROGRAMADA', 'EN_PREPARACION', 'LISTA', 'ENTREGA_PARCIAL', 'ENTREGADA', 'CANCELADO']

function formatearFecha(fecha) {
  if (!fecha) return '—'
  const [year, month, day] = String(fecha).split('T')[0].split('-')
  return year && month && day ? `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}` : '—'
}

function mapError(error, fallback) {
  if (error?.status === 403) return 'No tiene permisos para realizar esta operación.'
  return error?.message || fallback
}

function EstadoEntregaBadge({ codigo }) {
  const className = codigo === 'ENTREGADA' ? 'status-active' : codigo === 'CANCELADO' ? 'status-rejected' : codigo === 'ENTREGA_PARCIAL' ? 'status-partial' : 'status-inactive'
  return <span className={`status-badge ${className}`}>{codigo || '—'}</span>
}

function nombreUsuario(usuario) {
  return `${usuario?.nombres || ''} ${usuario?.apellidos || ''}`.trim() || usuario?.username || '—'
}

function ResumenEntregas({ entregas }) {
  const counts = ESTADOS.slice(1).map((estado) => [estado, entregas.filter((item) => item.estado?.codigo === estado).length])
  return <div className="entregas-summary" aria-label="Resumen de entregas">{counts.map(([estado, count]) => <div className="entrega-summary-item" key={estado}><span>{estado.replace('_', ' ')}</span><strong>{count}</strong></div>)}</div>
}

function NuevaEntregaModal({ modal, saving, onChange, onSubmit, onClose }) {
  return <Modal title="Nueva entrega" size="wide" onClose={onClose}>
    <form className="catalog-form" onSubmit={onSubmit}>
      <p className="form-help">Seleccione una solicitud aprobada o en preparación con cantidades pendientes.</p>
      <div className="catalog-form-grid">
        <div className="catalog-span-full"><label htmlFor="entrega_solicitud">Solicitud *</label><select id="entrega_solicitud" name="solicitud_id" value={modal.form.solicitud_id} onChange={onChange} required><option value="">Seleccionar solicitud...</option>{modal.solicitudes.map((item) => <option key={item.id} value={item.id}>{item.codigo} - {item.beneficiario?.nombre} - Pendientes: {item.total_pendiente}</option>)}</select></div>
        <div><label htmlFor="entrega_fecha">Fecha programada *</label><input id="entrega_fecha" name="fecha_programada" type="date" value={modal.form.fecha_programada} onChange={onChange} required /></div>
        <div><label htmlFor="entrega_responsable">Responsable *</label><select id="entrega_responsable" name="responsable_id" value={modal.form.responsable_id} onChange={onChange} required><option value="">Seleccionar responsable...</option>{modal.responsables.map((item) => <option key={item.id} value={item.id}>{nombreUsuario(item)} ({item.rol?.codigo})</option>)}</select></div>
        <div className="catalog-span-full"><label htmlFor="entrega_lugar">Lugar de entrega</label><input id="entrega_lugar" name="lugar_entrega" value={modal.form.lugar_entrega} onChange={onChange} /></div>
        <div className="catalog-span-full"><label htmlFor="entrega_observaciones">Observaciones</label><textarea id="entrega_observaciones" name="observaciones" rows="3" value={modal.form.observaciones} onChange={onChange} /></div>
      </div>
      <div className="modal-actions"><button className="button-secondary" type="button" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Crear entrega'}</button></div>
    </form>
  </Modal>
}

function ConfirmarEntregaModal({ entrega, modal, saving, onChange, onDetailChange, onSubmit, onClose }) {
  return <Modal title={`Confirmar entrega ${entrega.codigo}`} size="wide" onClose={onClose}>
    <form className="catalog-form" onSubmit={onSubmit}>
      <div className="catalog-form-grid">
        <div><label htmlFor="receptor_nombre">Nombre de quien recibe *</label><input id="receptor_nombre" name="recibe_nombre" value={modal.form.recibe_nombre} onChange={onChange} required /></div>
        <div><label htmlFor="receptor_dpi">DPI</label><input id="receptor_dpi" name="recibe_dpi" value={modal.form.recibe_dpi} onChange={onChange} /></div>
        <div className="catalog-span-full"><label htmlFor="receptor_lugar">Lugar de entrega</label><input id="receptor_lugar" name="lugar_entrega" value={modal.form.lugar_entrega} onChange={onChange} /></div>
      </div>
      <div className="entrega-confirm-details"><h3>Detalle a entregar</h3>{modal.detalles.map((item, index) => <div className="entrega-confirm-row" key={item.id}><div><strong>{item.especie?.nombre_comun || '—'}</strong><span>Lote: {item.lote?.codigo || '—'}</span><small>Aprobadas: {item.cantidad_aprobada} · Entregadas: {item.cantidad_entregada_total} · Pendientes: {item.pendiente}</small></div><label htmlFor={`cantidad_entrega_${item.id}`}>Ahora *<input id={`cantidad_entrega_${item.id}`} type="number" min="1" max={item.pendiente} value={item.cantidad} onChange={(event) => onDetailChange(index, event.target.value)} required /></label></div>)}</div>
      <div className="catalog-span-full"><label htmlFor="confirmar_observaciones">Observaciones</label><textarea id="confirmar_observaciones" name="observaciones" rows="3" value={modal.form.observaciones} onChange={onChange} /></div>
      <div className="modal-actions"><button className="button-secondary" type="button" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Confirmando...' : 'Confirmar entrega'}</button></div>
    </form>
  </Modal>
}

function EntregaDetalle({ entrega, loading, canWrite, onBack, onAction, onConfirm }) {
  if (loading) return <section className="entregas-view"><div className="empty-state">Cargando entrega...</div></section>
  return <section className="entregas-view entrega-detail-view" aria-labelledby="entrega-detail-title">
    <header className="catalogos-header detalle-page-header"><div><button type="button" className="link-back" onClick={onBack}>← Volver</button><h1 id="entrega-detail-title">{entrega.codigo}</h1><p>{entrega.beneficiario?.nombre || '—'}</p></div><EstadoEntregaBadge codigo={entrega.estado?.codigo} /></header>
    <div className="detalle-card"><div className="info-grid"><div className="info-card"><div className="info-card-title">Solicitud</div><div className="info-card-value">{entrega.solicitud?.codigo || '—'}</div></div><div className="info-card"><div className="info-card-title">Beneficiario</div><div className="info-card-value">{entrega.beneficiario?.nombre || '—'}</div></div><div className="info-card"><div className="info-card-title">Fecha programada</div><div className="info-card-value">{formatearFecha(entrega.fecha_programada)}</div></div><div className="info-card"><div className="info-card-title">Fecha de entrega</div><div className="info-card-value">{formatearFecha(entrega.fecha_entrega)}</div></div><div className="info-card"><div className="info-card-title">Responsable</div><div className="info-card-value">{nombreUsuario(entrega.responsable)}</div></div><div className="info-card"><div className="info-card-title">Estado</div><div className="info-card-value"><EstadoEntregaBadge codigo={entrega.estado?.codigo} /></div></div></div><div className="detalle-section entrega-detail-meta"><p><strong>Lugar:</strong> {entrega.lugar_entrega || '—'}</p><p><strong>Observaciones:</strong> {entrega.observaciones || '—'}</p><p><strong>Receptor:</strong> {entrega.receptor?.nombre || '—'}{entrega.receptor?.dpi ? ` · DPI ${entrega.receptor.dpi}` : ''}</p></div><div className="detalle-section"><h3>Detalle entregado</h3><DataTable columns={[{ key: 'especie.nombre_comun', label: 'Especie', sortable: true }, { key: 'lote.codigo', label: 'Lote', sortable: true }, { key: 'cantidad_entregada', label: 'Cantidad entregada', sortable: true }]} data={entrega.detalles || []} getRowKey={(item) => item.id} emptyMessage="No hay detalle registrado." /></div>{canWrite && <div className="detalle-actions">{entrega.estado?.codigo === 'PROGRAMADA' && <button type="button" onClick={() => onAction('preparar')}>Iniciar preparación</button>}{entrega.estado?.codigo === 'EN_PREPARACION' && <button type="button" onClick={() => onAction('lista')}>Marcar como lista</button>}{entrega.estado?.codigo === 'LISTA' && <button type="button" onClick={onConfirm}>Confirmar entrega</button>}</div>}</div>
  </section>
}

function EntregasView({ currentUser, onToast, onSessionInvalid }) {
  const canWrite = WRITE_ROLES.includes(currentUser?.rol?.codigo)
  const [entregas, setEntregas] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [responsables, setResponsables] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('TODOS')
  const [detalle, setDetalle] = useState(null)
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)

  async function guardedCall(call, fallback) {
    try { return await call() } catch (errorCall) { if (errorCall?.status === 401) { onSessionInvalid(); return null } throw new Error(mapError(errorCall, fallback), { cause: errorCall }) }
  }

  async function cargarEntregas() {
    setLoading(true); setError('')
    try { const response = await guardedCall(() => obtenerEntregas(), 'No fue posible cargar las entregas.'); if (response) setEntregas(response.entregas || []) } catch (errorCall) { setError(errorCall.message) } finally { setLoading(false) }
  }

  async function cargarRecursos() {
    try {
      const [solicitudesData, responsablesData] = await Promise.all([guardedCall(() => obtenerSolicitudes(), 'No fue posible cargar las solicitudes.'), guardedCall(() => obtenerResponsablesProduccion(), 'No fue posible cargar los responsables.')])
      if (responsablesData) setResponsables(responsablesData.responsables || [])
      if (!solicitudesData) return
      const candidates = (solicitudesData.solicitudes || []).filter((item) => ['APROBADA', 'EN_PREPARACION'].includes(item.estado?.codigo))
      const details = await Promise.all(candidates.map((item) => guardedCall(() => obtenerSolicitud(item.id), 'No fue posible cargar una solicitud.')))
      setSolicitudes(details.filter(Boolean).map((response) => {
        const solicitud = response.solicitud
        const totalPendiente = (solicitud.detalles || []).reduce((total, item) => total + Math.max(0, Number(item.cantidad_aprobada || 0) - Number(item.cantidad_entregada || 0)), 0)
        return { ...solicitud, total_pendiente: totalPendiente }
      }).filter((item) => item.total_pendiente > 0))
    } catch (errorCall) { onToast(errorCall.message, 'error') }
  }

  useEffect(() => { // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarEntregas()
    if (canWrite) cargarRecursos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function abrirDetalle(id) {
    setLoadingDetalle(true)
    try { const response = await guardedCall(() => obtenerEntrega(id), 'No fue posible cargar la entrega.'); if (response) setDetalle(response.entrega) } catch (errorCall) { onToast(errorCall.message, 'error') } finally { setLoadingDetalle(false) }
  }

  const filtered = useMemo(() => entregas.filter((item) => {
    const term = search.toLowerCase()
    const matchesState = estadoFiltro === 'TODOS' || item.estado?.codigo === estadoFiltro
    const text = [item.codigo, item.solicitud?.codigo, item.beneficiario?.nombre, item.responsable?.nombres, item.responsable?.apellidos, item.estado?.codigo].filter(Boolean).join(' ').toLowerCase()
    return matchesState && text.includes(term)
  }), [entregas, search, estadoFiltro])

  const columns = [{ key: 'codigo', label: 'Código', sortable: true }, { key: 'solicitud.codigo', label: 'Solicitud', sortable: true }, { key: 'beneficiario.nombre', label: 'Beneficiario', sortable: true }, { key: 'fecha_programada', label: 'Fecha programada', sortable: true, render: (item) => formatearFecha(item.fecha_programada) }, { key: 'responsable', label: 'Responsable', sortable: true, sortValue: (item) => nombreUsuario(item.responsable), render: (item) => nombreUsuario(item.responsable) }, { key: 'estado.codigo', label: 'Estado', sortable: true, render: (item) => <EstadoEntregaBadge codigo={item.estado?.codigo} /> }, { key: 'acciones', label: 'Acciones', sortable: false, render: (item) => <div className="row-actions"><button type="button" onClick={() => abrirDetalle(item.id)}>Ver detalle</button></div> }]

  function abrirNuevaEntrega() { setModal({ kind: 'crear', solicitudes, responsables, form: { solicitud_id: '', fecha_programada: '', responsable_id: '', lugar_entrega: '', observaciones: '' } }) }
  function updateForm(event) { setModal((current) => ({ ...current, form: { ...current.form, [event.target.name]: event.target.value } })) }

  async function guardarEntrega(event) {
    event.preventDefault(); const form = modal.form
    if (!form.solicitud_id || !form.fecha_programada || !form.responsable_id) { onToast('Complete los campos obligatorios.', 'error'); return }
    setSaving(true)
    try { await guardedCall(() => crearEntrega({ solicitud_id: Number(form.solicitud_id), fecha_programada: form.fecha_programada, responsable_id: Number(form.responsable_id), lugar_entrega: form.lugar_entrega.trim() || null, observaciones: form.observaciones.trim() || null }), 'No fue posible crear la entrega.'); setModal(null); onToast('Entrega creada correctamente.', 'success'); await cargarEntregas(); await cargarRecursos() } catch (errorCall) { onToast(errorCall.message, 'error') } finally { setSaving(false) }
  }

  async function ejecutarAccion(action) {
    setSaving(true)
    try { await guardedCall(() => action === 'preparar' ? prepararEntrega(detalle.id) : marcarEntregaLista(detalle.id), 'No fue posible actualizar la entrega.'); onToast('Entrega actualizada correctamente.', 'success'); await abrirDetalle(detalle.id); await cargarEntregas() } catch (errorCall) { onToast(errorCall.message, 'error') } finally { setSaving(false) }
  }

  async function abrirConfirmacion() {
    try {
      const response = await guardedCall(() => obtenerSolicitud(detalle.solicitud.id), 'No fue posible cargar el detalle de la solicitud.')
      if (!response) return

      const detalles = (response.solicitud?.detalles || []).map((item) => ({
        id: item.id,
        solicitud_detalle_id: item.id,
        especie: item.especie,
        lote: item.lote,
        cantidad_aprobada: item.cantidad_aprobada,
        cantidad_entregada_total: item.cantidad_entregada,
        pendiente: Math.max(0, Number(item.cantidad_aprobada || 0) - Number(item.cantidad_entregada || 0)),
        cantidad: '',
      })).filter((item) => item.pendiente > 0)

      if (detalles.length === 0) {
        onToast('La solicitud no tiene cantidades pendientes por entregar.', 'error')
        return
      }

      setModal({ kind: 'confirmar', detalles, form: { recibe_nombre: '', recibe_dpi: '', lugar_entrega: detalle.lugar_entrega || '', observaciones: '' } })
    } catch (errorCall) {
      onToast(errorCall.message, 'error')
    }
  }
  function updateConfirmField(event) { setModal((current) => ({ ...current, form: { ...current.form, [event.target.name]: event.target.value } })) }
  function updateConfirmDetail(index, value) { setModal((current) => ({ ...current, detalles: current.detalles.map((item, itemIndex) => itemIndex === index ? { ...item, cantidad: value } : item) })) }

  async function guardarConfirmacion(event) {
    event.preventDefault(); const quantities = modal.detalles.map((item) => Number(item.cantidad) || 0)
    if (!modal.form.recibe_nombre.trim() || modal.detalles.some((item, index) => !Number.isInteger(quantities[index]) || quantities[index] <= 0 || quantities[index] > item.pendiente)) { onToast('Indique un receptor y cantidades válidas sin superar los pendientes.', 'error'); return }
    setSaving(true)
    try { await guardedCall(() => confirmarEntrega(detalle.id, { recibe_nombre: modal.form.recibe_nombre.trim(), recibe_dpi: modal.form.recibe_dpi.trim() || null, lugar_entrega: modal.form.lugar_entrega.trim() || null, observaciones: modal.form.observaciones.trim() || null, detalles: modal.detalles.map((item, index) => ({ solicitud_detalle_id: item.solicitud_detalle_id, cantidad: quantities[index] })) }), 'No fue posible confirmar la entrega.'); setModal(null); onToast('Entrega confirmada correctamente.', 'success'); await abrirDetalle(detalle.id); await cargarEntregas(); await cargarRecursos() } catch (errorCall) { onToast(errorCall.message, 'error') } finally { setSaving(false) }
  }

  if (detalle) return <><EntregaDetalle entrega={detalle} loading={loadingDetalle} canWrite={canWrite && !saving} onBack={() => setDetalle(null)} onAction={ejecutarAccion} onConfirm={abrirConfirmacion} />{modal?.kind === 'confirmar' && <ConfirmarEntregaModal entrega={detalle} modal={modal} saving={saving} onChange={updateConfirmField} onDetailChange={updateConfirmDetail} onSubmit={guardarConfirmacion} onClose={() => setModal(null)} />}</>

  return <section className="entregas-view" aria-labelledby="entregas-title"><header className="entregas-header"><div><span className="page-kicker">Distribución</span><h1 id="entregas-title">Distribución / Entregas</h1><p>Programación, preparación y registro de entregas de plantas.</p></div>{canWrite && <button type="button" onClick={abrirNuevaEntrega}>+ Nueva entrega</button>}</header><ResumenEntregas entregas={entregas} /><div className="data-card entregas-table-card"><div className="entregas-toolbar"><input className="user-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar entrega..." aria-label="Buscar entrega" /><select className="catalog-filter" value={estadoFiltro} onChange={(event) => setEstadoFiltro(event.target.value)} aria-label="Filtrar por estado">{ESTADOS.map((estado) => <option key={estado} value={estado}>{estado === 'TODOS' ? 'Todos los estados' : estado}</option>)}</select></div>{loading ? <div className="empty-state">Cargando entregas...</div> : error ? <div className="empty-state error-state">{error}</div> : <DataTable columns={columns} data={filtered} getRowKey={(item) => item.id} emptyMessage="No hay entregas para mostrar." />}</div>{modal?.kind === 'crear' && <NuevaEntregaModal modal={modal} saving={saving} onChange={updateForm} onSubmit={guardarEntrega} onClose={() => setModal(null)} />}{modal?.kind === 'confirmar' && <ConfirmarEntregaModal entrega={detalle} modal={modal} saving={saving} onChange={updateConfirmField} onDetailChange={updateConfirmDetail} onSubmit={guardarConfirmacion} onClose={() => setModal(null)} />}</section>
}

export default EntregasView
