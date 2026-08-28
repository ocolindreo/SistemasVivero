import { useEffect, useMemo, useState } from 'react'
import DataTable from '../../components/DataTable'
import Modal from '../../components/Modal'
import ConfirmDialog from '../../components/ConfirmDialog'
import { DEPARTAMENTOS_GUATEMALA, UBICACIONES_GUATEMALA } from '../../data/ubicacionesGuatemala'
import {
  obtenerSolicitudes,
  obtenerSolicitud,
  crearSolicitud,
  aprobarSolicitud,
  rechazarSolicitud,
  obtenerBeneficiarios,
  crearBeneficiario,
  obtenerInventario,
  obtenerEntregas,
  obtenerEntrega,
} from '../../services/api'

const SOLICITUD_TABS = [
  { id: 'REGISTRADA', label: 'Registradas', empty: 'No hay solicitudes registradas pendientes.' },
  { id: 'APROBADA', label: 'Aprobadas', empty: 'No hay solicitudes aprobadas.' },
  { id: 'RECHAZADA', label: 'Rechazadas', empty: 'No hay solicitudes rechazadas.' },
  { id: 'HISTORICO', label: 'Histórico', empty: 'No hay solicitudes con entregas asociadas.' },
]
const WRITE_ROLES = ['ADMIN', 'VIVERO', 'GESTION']
const DECISION_ROLES = ['ADMIN', 'VIVERO']
const EMPTY_BENEFICIARIO = { tipo: 'PERSONA', nombre: '', nit: '', dpi: '', responsable: '', departamento: '', municipio: '', telefono: '', email: '', direccion: '', descripcion: '' }
const BENEFICIARIO_TIPOS = [
  { value: 'PERSONA', label: 'Persona' },
  { value: 'ESCUELA', label: 'Escuela' },
  { value: 'COMUNIDAD', label: 'Comunidad' },
  { value: 'INSTITUCION', label: 'Institucion' },
]

function formatearFecha(fecha) {
  if (!fecha) return '—'
  const [year, month, day] = String(fecha).split('T')[0].split('-')
  if (!year || !month || !day) return '—'
  return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`
}

function mapError(error, fallbackMessage) {
  if (error?.status === 403) return 'No tiene permisos para realizar esta operación.'
  return error?.message || fallbackMessage
}

function entregasDeSolicitud(entregas, solicitudId) {
  return entregas.filter((entrega) => Number(entrega.solicitud?.id) === Number(solicitudId))
}

function totalEntregadoDeEntregas(entregas) {
  return entregas.filter((entrega) => entrega.estado?.codigo !== 'CANCELADO').reduce((sum, entrega) => sum + Number(entrega.total_entregado || 0), 0)
}

function SolicitudStatusBadge({ estado }) {
  const classes = { REGISTRADA: 'status-inactive', APROBADA: 'status-active', RECHAZADA: 'status-rejected', ATENDIDA: 'status-active' }
  return <span className={`status-badge ${classes[estado] || 'status-inactive'}`}>{estado === 'REGISTRADA' ? 'Registrada' : estado === 'APROBADA' ? 'Aprobada' : estado === 'RECHAZADA' ? 'Rechazada' : estado}</span>
}

function DistribucionBadges({ entregas }) {
  const estados = [...new Set((entregas || []).map((entrega) => entrega.estado?.codigo).filter(Boolean))]
  return <div className="solicitudes-distribution-badges">{estados.length > 0 ? estados.map((estado) => <span className={`status-badge ${estado === 'ENTREGADA' ? 'status-active' : estado === 'CANCELADO' ? 'status-rejected' : 'status-inactive'}`} key={estado}>{estado}</span>) : '—'}</div>
}

function EntregaStatusBadge({ estado }) {
  const codigo = estado?.codigo
  const className = codigo === 'ENTREGADA' ? 'status-active' : codigo === 'CANCELADO' ? 'status-rejected' : 'status-inactive'
  return <span className={`status-badge ${className}`}>{codigo || '—'}</span>
}

function EntregaHistorica({ entrega }) {
  const total = (entrega.detalles || []).reduce((sum, detalle) => sum + Number(detalle.cantidad_entregada || 0), 0)
  return <article className="historico-entrega"><div className="historico-entrega-header"><div><strong>{entrega.codigo}</strong><span>{formatearFecha(entrega.fecha_programada)}{entrega.fecha_entrega ? ` · Entregada ${formatearFecha(entrega.fecha_entrega)}` : ''}</span></div><div><EntregaStatusBadge estado={entrega.estado} /><span className="historico-entrega-total">{total} plantas</span></div></div><div className="historico-entrega-info"><span><strong>Responsable:</strong> {`${entrega.responsable?.nombres || ''} ${entrega.responsable?.apellidos || ''}`.trim() || entrega.responsable?.username || '—'}</span><span><strong>Receptor:</strong> {entrega.receptor?.nombre || '—'}{entrega.receptor?.dpi ? ` · DPI ${entrega.receptor.dpi}` : ''}</span><span><strong>Lugar:</strong> {entrega.lugar_entrega || '—'}</span><span><strong>Observaciones:</strong> {entrega.observaciones || '—'}</span></div>{entrega.detalles?.length > 0 ? <DataTable columns={[{ key: 'especie.nombre_comun', label: 'Especie', sortable: true }, { key: 'lote.codigo', label: 'Lote', sortable: true }, { key: 'cantidad_entregada', label: 'Cantidad', sortable: true }]} data={entrega.detalles} getRowKey={(item) => item.id} emptyMessage="Sin detalle entregado todavía." /> : <p className="form-help">Sin detalle entregado todavía.</p>}</article>
}

function BeneficiarioForm({ form, saving, onChange, onSubmit, onClose }) {
  return (
    <Modal title="Nuevo beneficiario" size="wide" onClose={onClose}>
      <form className="user-form" onSubmit={onSubmit}>
        <div className="form-grid solicitudes-beneficiario-grid">
          <label>Tipo *<select name="tipo" value={form.tipo} onChange={onChange} required>{BENEFICIARIO_TIPOS.map((tipo) => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}</select></label>
          <label>Nombre *<input name="nombre" value={form.nombre} onChange={onChange} required /></label>
          <label>Responsable<input name="responsable" value={form.responsable} onChange={onChange} /></label>
          <label>NIT<input name="nit" value={form.nit} onChange={onChange} /></label>
          <label>DPI<input name="dpi" value={form.dpi} onChange={onChange} /></label>
          <label>Departamento<select name="departamento" value={form.departamento} onChange={onChange}><option value="">Seleccione un departamento</option>{DEPARTAMENTOS_GUATEMALA.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>Municipio<select name="municipio" value={form.municipio} onChange={onChange} disabled={!form.departamento}><option value="">Seleccione un municipio</option>{(UBICACIONES_GUATEMALA[form.departamento] || []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>Telefono<input name="telefono" value={form.telefono} onChange={onChange} /></label>
          <label>Correo electronico<input type="email" name="email" value={form.email} onChange={onChange} /></label>
          <label className="catalog-span-full">Direccion<textarea name="direccion" rows="2" value={form.direccion} onChange={onChange} /></label>
          <label className="catalog-span-full">Descripcion<textarea name="descripcion" rows="3" value={form.descripcion} onChange={onChange} /></label>
        </div>
        <div className="modal-actions"><button className="button-secondary" type="button" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button></div>
      </form>
    </Modal>
  )
}

function SolicitudForm({ form, beneficiaries, inventory, saving, onChange, onDetailChange, onAddDetail, onRemoveDetail, onNewBeneficiary, onSubmit, onClose }) {
  const total = form.detalles.reduce((sum, detail) => sum + (Number(detail.cantidad) || 0), 0)
  return (
    <Modal title="Nueva solicitud" size="wide" onClose={onClose}>
      <form className="catalog-form" onSubmit={onSubmit}>
        <div className="catalog-form-grid">
          <div>
            <label htmlFor="sol_beneficiario">Beneficiario *</label>
            <div className="solicitud-beneficiario-control"><select id="sol_beneficiario" name="beneficiario_id" value={form.beneficiario_id} onChange={onChange} required><option value="">Seleccionar beneficiario...</option>{beneficiaries.filter((item) => Number(item.estado) === 1).map((item) => <option key={item.id} value={item.id}>{item.codigo} - {item.nombre}</option>)}</select><button type="button" className="button-secondary" onClick={onNewBeneficiary}>+ Nuevo beneficiario</button></div>
          </div>
          <div><label htmlFor="sol_fecha">Fecha solicitud *</label><input id="sol_fecha" name="fecha_solicitud" type="date" value={form.fecha_solicitud} onChange={onChange} required /></div>
          <div><label htmlFor="sol_motivo">Motivo *</label><input id="sol_motivo" name="motivo" value={form.motivo} onChange={onChange} required /></div>
          <div className="catalog-span-full"><label htmlFor="sol_observaciones">Observaciones</label><textarea id="sol_observaciones" name="observaciones" rows="3" value={form.observaciones} onChange={onChange} /></div>
        </div>

        <div className="solicitudes-details-section">
          <div className="solicitudes-section-header"><h3>Plantas solicitadas</h3><button type="button" className="button-secondary" onClick={onAddDetail}>+ Agregar planta</button></div>
          <div className="solicitudes-detail-list">
            {form.detalles.map((detail, index) => {
              const selected = inventory.find((item) => String(item.id) === String(detail.inventario_id))
              const available = selected?.cantidad_disponible ?? 0
              const quantityError = Number(detail.cantidad) > available
              return <div className="solicitud-detail-row" key={`${index}-${detail.inventario_id}`}>
                <div><label htmlFor={`sol_inventario_${index}`}>Inventario/Lote *</label><select id={`sol_inventario_${index}`} value={detail.inventario_id} onChange={(event) => onDetailChange(index, 'inventario_id', event.target.value)} required><option value="">Seleccionar inventario...</option>{inventory.filter((item) => Number(item.estado) === 1 && Number(item.cantidad_disponible) > 0 && (String(item.id) === String(detail.inventario_id) || !form.detalles.some((other, otherIndex) => otherIndex !== index && String(other.inventario_id) === String(item.id)))).map((item) => <option key={item.id} value={item.id}>{item.lote.codigo} - {item.especie.nombre_comun} - Disponible: {item.cantidad_disponible}</option>)}</select></div>
                <div className="solicitud-detail-summary"><strong>Especie:</strong> {selected ? `${selected.especie.codigo} - ${selected.especie.nombre_comun}` : '—'}<br /><strong>Disponible:</strong> {selected ? available : '—'}</div>
                <div><label htmlFor={`sol_cantidad_${index}`}>Cantidad solicitada *</label><input id={`sol_cantidad_${index}`} type="number" min="1" max={available || undefined} value={detail.cantidad} onChange={(event) => onDetailChange(index, 'cantidad', event.target.value)} required />{quantityError && <span className="field-error">La cantidad solicitada supera la cantidad disponible.</span>}</div>
                <button type="button" className="text-button solicitud-remove-button" onClick={() => onRemoveDetail(index)} disabled={form.detalles.length === 1}>Quitar</button>
              </div>
            })}
          </div>
          <div className="solicitudes-total">Total solicitado: <strong>{total} plantas</strong></div>
        </div>

        <div className="modal-actions"><button className="button-secondary" type="button" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Crear solicitud'}</button></div>
      </form>
    </Modal>
  )
}

function SolicitudesView({ currentUser, onToast, onSessionInvalid }) {
  const role = currentUser?.rol?.codigo || ''
  const canCreate = WRITE_ROLES.includes(role)
  const canDecide = DECISION_ROLES.includes(role)
  const [solicitudes, setSolicitudes] = useState([])
  const [entregas, setEntregas] = useState([])
  const [beneficiaries, setBeneficiaries] = useState([])
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('REGISTRADA')
  const [detalle, setDetalle] = useState(null)
  const [detalleTab, setDetalleTab] = useState('informacion')
  const [movementsLoading, setMovementsLoading] = useState(false)
  const [modal, setModal] = useState(null)
  const [beneficiarioModal, setBeneficiarioModal] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ beneficiario_id: '', fecha_solicitud: '', motivo: '', observaciones: '', detalles: [{ inventario_id: '', cantidad: '' }] })

  async function guardedCall(call, fallback) {
    try { return await call() } catch (err) { if (err?.status === 401) { onSessionInvalid(); return null } throw new Error(mapError(err, fallback), { cause: err }) }
  }

  async function cargarDatos() {
    setLoading(true); setError('')
    try {
      const [solicitudesData, beneficiariesData, inventoryData, entregasData] = await Promise.all([
        guardedCall(() => obtenerSolicitudes(), 'No fue posible cargar las solicitudes.'),
        guardedCall(() => obtenerBeneficiarios(), 'No fue posible cargar los beneficiarios.'),
        guardedCall(() => obtenerInventario(), 'No fue posible cargar el inventario.'),
        guardedCall(() => obtenerEntregas(), 'No fue posible cargar las entregas.'),
      ])
      if (solicitudesData) setSolicitudes(solicitudesData.solicitudes || [])
      if (beneficiariesData) setBeneficiaries(beneficiariesData.beneficiarios || [])
      if (inventoryData) setInventory(inventoryData.inventario || [])
      if (entregasData) setEntregas(entregasData.entregas || [])
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  useEffect(() => { // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function abrirDetalle(id) {
    setMovementsLoading(true)
    try {
      const response = await guardedCall(() => obtenerSolicitud(id), 'No fue posible cargar la solicitud.')
      if (!response) return

      const solicitud = response.solicitud
      const entregasSolicitud = activeTab === 'HISTORICO' ? entregasDeSolicitud(entregas, id).sort((left, right) => Number(left.id) - Number(right.id)) : []
      const entregasDetalle = await Promise.all(entregasSolicitud.map((entrega) => guardedCall(() => obtenerEntrega(entrega.id), 'No fue posible cargar una entrega histórica.')))
      setDetalle({ ...solicitud, historico: entregasDetalle.filter(Boolean).map((item) => item.entrega).filter(Boolean) })
      setDetalleTab('informacion')
    } catch (err) { onToast(err.message, 'error') } finally { setMovementsLoading(false) }
  }

  const filtered = useMemo(() => {
    const term = search.toLowerCase()
    return solicitudes.filter((item) => {
      const entregasSolicitud = entregasDeSolicitud(entregas, item.id)
      const textoEntregas = entregasSolicitud.flatMap((entrega) => [entrega.codigo, entrega.estado?.codigo])
      const texto = [item.codigo, item.beneficiario?.codigo, item.beneficiario?.nombre, item.beneficiario?.tipo, item.estado?.codigo, item.usuario_creacion?.nombres, item.usuario_creacion?.apellidos, ...textoEntregas].filter(Boolean).join(' ').toLowerCase()
      const coincideTab = activeTab === 'HISTORICO' ? entregasSolicitud.length > 0 : item.estado.codigo === activeTab
      return coincideTab && texto.includes(term)
    })
  }, [solicitudes, entregas, activeTab, search])

  const columns = (() => {
    const base = [
      { key: 'codigo', label: 'Código', sortable: true },
      { key: 'fecha_solicitud', label: 'Fecha', sortable: true, render: (item) => formatearFecha(item.fecha_solicitud) },
      { key: 'beneficiario.nombre', label: 'Beneficiario', sortable: true },
      { key: 'beneficiario.tipo', label: 'Tipo', sortable: true },
      { key: 'total_solicitado', label: 'Total solicitado', sortable: true },
    ]
    if (activeTab === 'APROBADA') base.push({ key: 'total_aprobado', label: 'Total aprobado', sortable: true })
    if (activeTab === 'HISTORICO') {
      return [
        { key: 'codigo', label: 'Solicitud', sortable: true },
        { key: 'beneficiario.nombre', label: 'Beneficiario', sortable: true },
        { key: 'estado.codigo', label: 'Estado solicitud', sortable: true, render: (item) => <SolicitudStatusBadge estado={item.estado.codigo} /> },
        { key: 'distribucion', label: 'Distribución', sortable: false, render: (item) => <DistribucionBadges entregas={entregasDeSolicitud(entregas, item.id)} /> },
        { key: 'total_aprobado', label: 'Aprobadas', sortable: true },
        { key: 'total_entregado', label: 'Entregadas', sortable: true, render: (item) => totalEntregadoDeEntregas(entregasDeSolicitud(entregas, item.id)) },
        { key: 'total_pendiente', label: 'Pendientes', sortable: true, render: (item) => Math.max(0, Number(item.total_aprobado || 0) - totalEntregadoDeEntregas(entregasDeSolicitud(entregas, item.id))) },
        { key: 'entregas', label: 'Entregas', sortable: true, render: (item) => entregasDeSolicitud(entregas, item.id).length },
        { key: 'acciones', label: 'Acciones', sortable: false, render: (item) => <button type="button" onClick={() => abrirDetalle(item.id)}>Ver</button> },
      ]
    }
    base.push({ key: 'estado.codigo', label: 'Estado', sortable: true, render: (item) => <SolicitudStatusBadge estado={item.estado.codigo} /> })
    base.push({ key: 'usuario_creacion', label: 'Creado por', sortable: true, sortValue: (item) => `${item.usuario_creacion?.nombres || ''} ${item.usuario_creacion?.apellidos || ''}`, render: (item) => `${item.usuario_creacion?.nombres || ''} ${item.usuario_creacion?.apellidos || ''}` })
    base.push({ key: 'acciones', label: 'Acciones', sortable: false, render: (item) => <button type="button" onClick={() => abrirDetalle(item.id)}>Ver</button> })
    return base
  })()

  function abrirNuevaSolicitud() {
    setForm({ beneficiario_id: '', fecha_solicitud: '', motivo: '', observaciones: '', detalles: [{ inventario_id: '', cantidad: '' }] })
    setModal('crear')
  }

  function updateForm(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })) }
  function updateDetail(index, field, value) { setForm((current) => ({ ...current, detalles: current.detalles.map((detail, detailIndex) => detailIndex === index ? { ...detail, [field]: value } : detail) })) }
  function addDetail() { setForm((current) => ({ ...current, detalles: [...current.detalles, { inventario_id: '', cantidad: '' }] })) }
  function removeDetail(index) { setForm((current) => ({ ...current, detalles: current.detalles.filter((_, detailIndex) => detailIndex !== index) })) }

  async function guardarNuevaSolicitud(event) {
    event.preventDefault()
    const detallesValidos = form.detalles.every((detail) => detail.inventario_id && Number.isInteger(Number(detail.cantidad)) && Number(detail.cantidad) > 0)
    const inventoryIds = form.detalles.map((detail) => detail.inventario_id)
    const hasDuplicates = new Set(inventoryIds).size !== inventoryIds.length
    const exceeds = form.detalles.some((detail) => { const item = inventory.find((entry) => String(entry.id) === String(detail.inventario_id)); return Number(detail.cantidad) > Number(item?.cantidad_disponible || 0) })
    if (!detallesValidos || hasDuplicates || exceeds || !form.motivo.trim()) { onToast(hasDuplicates ? 'No puede repetir el mismo inventario.' : exceeds ? 'La cantidad solicitada supera la cantidad disponible.' : 'Complete los campos obligatorios.', 'error'); return }
    setSaving(true)
    try { await guardedCall(() => crearSolicitud({ beneficiario_id: Number(form.beneficiario_id), fecha_solicitud: form.fecha_solicitud, motivo: form.motivo.trim(), observaciones: form.observaciones.trim() || null, detalles: form.detalles.map((detail) => ({ inventario_id: Number(detail.inventario_id), cantidad: Number(detail.cantidad) })) }), 'No fue posible registrar la solicitud.'); setModal(null); await cargarDatos(); setActiveTab('REGISTRADA'); onToast('Solicitud registrada correctamente.', 'success') } catch (err) { onToast(err.message, 'error') } finally { setSaving(false) }
  }

  function abrirNuevoBeneficiario() { setBeneficiarioModal({ form: { ...EMPTY_BENEFICIARIO } }) }
  function updateBeneficiario(event) { const { name, value } = event.target; setBeneficiarioModal((current) => ({ ...current, form: { ...current.form, [name]: value, ...(name === 'departamento' ? { municipio: '' } : {}) } })) }
  async function guardarBeneficiario(event) { event.preventDefault(); setSaving(true); try { const response = await guardedCall(() => crearBeneficiario({ ...beneficiarioModal.form, departamento: beneficiarioModal.form.departamento || null, municipio: beneficiarioModal.form.municipio || null }), 'No fue posible crear el beneficiario.'); if (response?.beneficiario) { setBeneficiaries((current) => [...current, response.beneficiario]); setForm((current) => ({ ...current, beneficiario_id: response.beneficiario.id })) } setBeneficiarioModal(null); onToast('Beneficiario creado correctamente.', 'success') } catch (err) { onToast(err.message, 'error') } finally { setSaving(false) } }

  async function confirmarAprobacion() { const id = confirmDialog.id; setConfirmDialog((current) => ({ ...current, loading: true })); try { await guardedCall(() => aprobarSolicitud(id), 'No fue posible aprobar la solicitud.'); setConfirmDialog(null); setDetalle(null); await cargarDatos(); onToast('Solicitud aprobada correctamente.', 'success') } catch (err) { setConfirmDialog(null); onToast(err.message, 'error') } }
  function solicitarAprobacion() { setConfirmDialog({ id: detalle.id, title: 'Aprobar solicitud', message: 'Al aprobar esta solicitud se reservarán las plantas solicitadas en el inventario. ¿Desea continuar?', confirmLabel: 'Aprobar solicitud', danger: false }) }

  async function guardarRechazo(event) { event.preventDefault(); const motivo = modal.form.motivo.trim(); if (!motivo) { onToast('El motivo de rechazo es obligatorio.', 'error'); return } setSaving(true); try { await guardedCall(() => rechazarSolicitud(detalle.id, { motivo }), 'No fue posible rechazar la solicitud.'); setModal(null); setDetalle(null); await cargarDatos(); onToast('Solicitud rechazada correctamente.', 'success') } catch (err) { onToast(err.message, 'error') } finally { setSaving(false) } }

  const detailColumns = [
    { key: 'lote.codigo', label: 'Lote', sortable: true },
    { key: 'especie.nombre_comun', label: 'Especie', sortable: true },
    { key: 'cantidad_solicitada', label: 'Cantidad solicitada', sortable: true },
    { key: 'cantidad_aprobada', label: 'Cantidad aprobada', sortable: true },
    { key: 'cantidad_entregada', label: 'Cantidad entregada', sortable: true },
    { key: 'cantidad_pendiente', label: 'Cantidad pendiente', sortable: true, render: (item) => Math.max(0, Number(item.cantidad_aprobada || 0) - Number(item.cantidad_entregada || 0)) },
  ]

  if (detalle) {
    const estado = detalle.estado?.codigo
    return <section className="solicitudes-view solicitud-detail-view" aria-labelledby="solicitud-detail-title">
      <header className="catalogos-header detalle-page-header"><div><button type="button" className="link-back" onClick={() => setDetalle(null)}>← Volver</button><h1 id="solicitud-detail-title">{detalle.codigo}</h1><p>{detalle.beneficiario?.nombre}</p></div><SolicitudStatusBadge estado={estado} /></header>
      <div className="detalle-container">
        <div className="catalog-tabs detalle-tabs" role="tablist" aria-label="Detalle de solicitud"><button type="button" className={`catalog-tab ${detalleTab === 'informacion' ? 'catalog-tab-active' : ''}`} onClick={() => setDetalleTab('informacion')}>Información</button><button type="button" className={`catalog-tab ${detalleTab === 'plantas' ? 'catalog-tab-active' : ''}`} onClick={() => setDetalleTab('plantas')}>Plantas solicitadas</button></div>
        {movementsLoading ? <div className="empty-state">Cargando solicitud...</div> : null}
        {detalleTab === 'informacion' && <div className="detalle-card"><div className="info-grid"><div className="info-card"><div className="info-card-title">Código</div><div className="info-card-value">{detalle.codigo}</div></div><div className="info-card"><div className="info-card-title">Fecha solicitud</div><div className="info-card-value">{formatearFecha(detalle.fecha_solicitud)}</div></div><div className="info-card"><div className="info-card-title">Beneficiario</div><div className="info-card-value">{detalle.beneficiario?.nombre}</div></div><div className="info-card"><div className="info-card-title">Tipo beneficiario</div><div className="info-card-value">{detalle.beneficiario?.tipo}</div></div><div className="info-card"><div className="info-card-title">Creado por</div><div className="info-card-value">{detalle.usuario_creacion?.nombres} {detalle.usuario_creacion?.apellidos}</div></div><div className="info-card"><div className="info-card-title">Fecha creación</div><div className="info-card-value">{formatearFecha(detalle.fecha_creacion)}</div></div></div><div className="detalle-section"><h3>Motivo</h3><p className="observaciones-text">{detalle.motivo || '—'}</p><h3>Observaciones</h3><p className="observaciones-text">{detalle.observaciones || '—'}</p>{detalle.observacion_revision && <><h3>Motivo de revisión</h3><p className="observaciones-text">{detalle.observacion_revision}</p></>}{detalle.fecha_revision && <p><strong>Fecha revisión:</strong> {formatearFecha(detalle.fecha_revision)}</p>}</div>{estado === 'APROBADA' && <div className="solicitud-reserved-note">Las plantas de esta solicitud se encuentran reservadas para su futura entrega.</div>}{canDecide && estado === 'REGISTRADA' && <div className="detalle-actions"><button type="button" className="button-danger" onClick={() => setModal({ kind: 'rechazar', form: { motivo: '' } })}>Rechazar</button><button type="button" onClick={solicitarAprobacion}>Aprobar solicitud</button></div>}</div>}
        {detalleTab === 'plantas' && <div className="detalle-card"><DataTable columns={detailColumns} data={detalle.detalles || []} getRowKey={(item) => item.id} emptyMessage="No hay plantas solicitadas." />{detalle.historico?.length > 0 && <div className="historico-distribucion"><h3>Historial de distribución / entregas</h3>{detalle.historico.map((entrega) => <EntregaHistorica entrega={entrega} key={entrega.id} />)}</div>}</div>}
      </div>
      {modal?.kind === 'rechazar' && <Modal title="Rechazar solicitud" size="wide" onClose={() => setModal(null)}><form className="catalog-form" onSubmit={guardarRechazo}><div className="modal-info"><p><strong>Solicitud:</strong> {detalle.codigo}</p><p><strong>Beneficiario:</strong> {detalle.beneficiario?.nombre}</p><p><strong>Total solicitado:</strong> {(detalle.detalles || []).reduce((sum, item) => sum + Number(item.cantidad_solicitada || 0), 0)} plantas</p></div><div className="catalog-form-grid"><div className="catalog-span-full"><label htmlFor="motivo_rechazo">Motivo de rechazo *</label><textarea id="motivo_rechazo" rows="4" value={modal.form.motivo} onChange={(event) => setModal((current) => ({ ...current, form: { motivo: event.target.value } }))} required /></div></div><div className="modal-actions"><button className="button-secondary" type="button" onClick={() => setModal(null)}>Volver</button><button className="button-danger" type="submit" disabled={saving}>Confirmar rechazo</button></div></form></Modal>}
      <ConfirmDialog dialog={confirmDialog} onCancel={() => setConfirmDialog(null)} onConfirm={confirmarAprobacion} />
    </section>
  }

  return <section className="solicitudes-view" aria-labelledby="solicitudes-title"><header className="solicitudes-header"><div><span className="page-kicker">Solicitudes</span><h1 id="solicitudes-title">Solicitudes</h1><p>Gestión y seguimiento de solicitudes de plantas</p></div>{canCreate && <button type="button" onClick={abrirNuevaSolicitud}>+ Nueva Solicitud</button>}</header><div className="data-card solicitudes-table-card"><div className="solicitudes-toolbar"><input className="user-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar solicitud..." aria-label="Buscar solicitud" /></div><div className="catalog-tabs solicitudes-tabs" role="tablist" aria-label="Estados de solicitudes">{SOLICITUD_TABS.map((tab) => <button key={tab.id} type="button" className={`catalog-tab ${activeTab === tab.id ? 'catalog-tab-active' : ''}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</div>{loading ? <div className="empty-state">Cargando solicitudes...</div> : error ? <div className="empty-state error-state">{error}</div> : <DataTable columns={columns} data={filtered} getRowKey={(item) => item.id} emptyMessage={SOLICITUD_TABS.find((tab) => tab.id === activeTab)?.empty} />}</div>{modal === 'crear' && <SolicitudForm form={form} beneficiaries={beneficiaries} inventory={inventory} saving={saving} onChange={updateForm} onDetailChange={updateDetail} onAddDetail={addDetail} onRemoveDetail={removeDetail} onNewBeneficiary={abrirNuevoBeneficiario} onSubmit={guardarNuevaSolicitud} onClose={() => setModal(null)} />}{beneficiarioModal && <BeneficiarioForm form={beneficiarioModal.form} saving={saving} onChange={updateBeneficiario} onSubmit={guardarBeneficiario} onClose={() => setBeneficiarioModal(null)} />}</section>
}

export default SolicitudesView
