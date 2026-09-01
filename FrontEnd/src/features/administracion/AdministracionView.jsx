import { useEffect, useMemo, useState } from 'react'
import ConfirmDialog from '../../components/ConfirmDialog'
import DataTable from '../../components/DataTable'
import Modal from '../../components/Modal'
import {
  obtenerSysadminAreas,
  obtenerSysadminBeneficiarios,
  obtenerSysadminEspecies,
  obtenerSysadminUsuarios,
  restablecerPasswordSysadmin,
  actualizarVisibilidadSysadmin,
} from '../../services/api'

const TABS = {
  USUARIO: { label: 'Usuarios', obtener: obtenerSysadminUsuarios },
  ESPECIE: { label: 'Especies', obtener: obtenerSysadminEspecies },
  AREA: { label: 'Áreas', obtener: obtenerSysadminAreas },
  BENEFICIARIO: { label: 'Beneficiarios', obtener: obtenerSysadminBeneficiarios },
}

function mapError(error, fallbackMessage) {
  if (error?.status === 403) return 'No tiene permisos para administrar estos registros.'
  return error?.message || fallbackMessage
}

function VisibilidadBadge({ visible }) {
  return <span className={`status-badge ${visible ? 'status-active' : 'status-inactive'}`}>{visible ? 'Visible' : 'Oculto'}</span>
}

function PasswordField({ id, label, value, onChange }) {
  const [visible, setVisible] = useState(false)
  return <label htmlFor={id}>{label}<div className="password-field"><input id={id} type={visible ? 'text' : 'password'} value={value} onChange={onChange} minLength="8" required /><button type="button" className="password-toggle" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{visible ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.1A10.7 10.7 0 0 1 12 5c5.5 0 9.2 4.5 10 7-0.3 0.9-1 2.2-2.1 3.4M6.2 6.2C4 7.7 2.6 10.1 2 12c0.8 2.5 4.5 7 10 7 1.3 0 2.5-0.2 3.5-0.7" /><circle cx="12" cy="12" r="3" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>}</button></div></label>
}

function AdministracionView({ currentUser, onToast, onSessionInvalid }) {
  const [tab, setTab] = useState('USUARIO')
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filtroVisibilidad, setFiltroVisibilidad] = useState('TODOS')
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)

  async function guardedCall(call, fallbackMessage) {
    try { return await call() } catch (err) {
      if (err?.status === 401) { onSessionInvalid?.(); return null }
      throw new Error(mapError(err, fallbackMessage), { cause: err })
    }
  }

  async function cargarRegistros(tabSeleccionado = tab) {
    setLoading(true)
    setError('')
    try {
      const response = await guardedCall(() => TABS[tabSeleccionado].obtener(), 'No fue posible cargar los registros.')
      if (response) setRegistros(response.registros || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarRegistros(tab)
    setSearch('')
    setFiltroVisibilidad('TODOS')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const filtered = useMemo(() => {
    const term = search.toLowerCase()
    return registros.filter((item) => {
      const visibilityOk = filtroVisibilidad === 'TODOS' || (filtroVisibilidad === 'VISIBLES' ? item.visible : !item.visible)
      const text = Object.values(item).filter((value) => typeof value === 'string' || typeof value === 'number').join(' ').toLowerCase()
      return visibilityOk && (!term || text.includes(term))
    })
  }, [registros, search, filtroVisibilidad])

  async function confirmarVisibilidad() {
    if (!confirmDialog) return
    setConfirmDialog((current) => ({ ...current, loading: true }))
    try {
      await guardedCall(() => actualizarVisibilidadSysadmin(tab, confirmDialog.id, confirmDialog.visible), 'No fue posible actualizar la visibilidad.')
      setRegistros((current) => current.map((item) => item.id === confirmDialog.id ? { ...item, visible: confirmDialog.visible } : item))
      setConfirmDialog(null)
      onToast(confirmDialog.visible ? 'Registro mostrado correctamente.' : 'Registro ocultado correctamente.', 'success')
    } catch (err) {
      setConfirmDialog(null)
      onToast(err.message, 'error')
    }
  }

  async function guardarPassword(event) {
    event.preventDefault()
    if (!modal || modal.kind !== 'password') return
    const { password, confirmacion } = modal.form
    if (!password || !confirmacion) return onToast('Ambos campos son obligatorios.', 'error')
    if (password.length < 8) return onToast('La contraseña debe tener al menos 8 caracteres.', 'error')
    if (password !== confirmacion) return onToast('Las contraseñas no coinciden.', 'error')
    setSaving(true)
    try {
      const response = await guardedCall(() => restablecerPasswordSysadmin(modal.id, { password, confirmacion_password: confirmacion }), 'No fue posible restablecer la contraseña.')
      setModal(null)
      onToast(response?.mensaje || 'Contraseña restablecida correctamente.', 'success')
    } catch (err) {
      onToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const actionsColumn = { key: 'acciones', label: 'Acciones', sortable: false, render: (item) => <div className="row-actions">{item.visible ? (tab === 'USUARIO' && item.id === currentUser?.id ? <span className="action-note">No puede ocultarse</span> : <button className="text-button" type="button" onClick={() => setConfirmDialog({ id: item.id, visible: false, title: 'Ocultar registro', message: '¿Desea ocultar este registro de la vista normal del sistema? Esta acción no elimina ni desactiva el registro.', confirmLabel: 'Ocultar', danger: true })}>Ocultar</button>) : <button className="text-button" type="button" onClick={() => setConfirmDialog({ id: item.id, visible: true, title: 'Mostrar registro', message: '¿Desea volver a mostrar este registro en la vista normal del sistema?', confirmLabel: 'Mostrar', danger: false })}>Mostrar</button>}{tab === 'USUARIO' && <button className="text-button" type="button" onClick={() => setModal({ kind: 'password', id: item.id, username: item.username, form: { password: '', confirmacion: '' } })}>Restablecer contraseña</button>}</div> }
  const columns = tab === 'USUARIO' ? [{ key: 'username', label: 'Usuario', sortable: true }, { key: 'nombres', label: 'Nombre', sortable: true, render: (item) => `${item.nombres} ${item.apellidos}` }, { key: 'email', label: 'Correo', sortable: true }, { key: 'rol_codigo', label: 'Rol', sortable: true }, { key: 'estado', label: 'Estado', sortable: true, render: (item) => item.estado === 1 ? 'Activo' : 'Inactivo' }, { key: 'visible', label: 'Visibilidad', sortable: true, render: (item) => <VisibilidadBadge visible={item.visible} /> }, actionsColumn] : tab === 'ESPECIE' ? [{ key: 'codigo', label: 'Código', sortable: true }, { key: 'nombre_comun', label: 'Especie', sortable: true }, { key: 'nombre_cientifico', label: 'Nombre científico', sortable: true, render: (item) => item.nombre_cientifico || '—' }, { key: 'estado', label: 'Estado', sortable: true, render: (item) => item.estado === 1 ? 'Activa' : 'Inactiva' }, { key: 'visible', label: 'Visibilidad', sortable: true, render: (item) => <VisibilidadBadge visible={item.visible} /> }, actionsColumn] : tab === 'AREA' ? [{ key: 'codigo', label: 'Código', sortable: true }, { key: 'nombre', label: 'Área', sortable: true }, { key: 'ubicacion', label: 'Ubicación', sortable: true, render: (item) => item.ubicacion || '—' }, { key: 'estado', label: 'Estado', sortable: true, render: (item) => item.estado === 1 ? 'Activa' : 'Inactiva' }, { key: 'visible', label: 'Visibilidad', sortable: true, render: (item) => <VisibilidadBadge visible={item.visible} /> }, actionsColumn] : [{ key: 'codigo', label: 'Código', sortable: true }, { key: 'nombre', label: 'Beneficiario', sortable: true }, { key: 'tipo', label: 'Tipo', sortable: true }, { key: 'telefono', label: 'Teléfono', sortable: true, render: (item) => item.telefono || '—' }, { key: 'estado', label: 'Estado', sortable: true, render: (item) => item.estado === 1 ? 'Activo' : 'Inactivo' }, { key: 'visible', label: 'Visibilidad', sortable: true, render: (item) => <VisibilidadBadge visible={item.visible} /> }, actionsColumn]

  return <section className="administracion-view" aria-labelledby="administracion-title"><header className="administracion-header"><div><span className="page-kicker">SYSADMIN</span><h1 id="administracion-title">SYSADMIN</h1><p>Control de visibilidad administrativa de registros del sistema.</p></div></header><div className="data-card administracion-table-card"><div className="catalog-tabs administracion-tabs" role="tablist" aria-label="Secciones de administración">{Object.entries(TABS).map(([codigo, item]) => <button key={codigo} type="button" className={`catalog-tab ${tab === codigo ? 'catalog-tab-active' : ''}`} onClick={() => setTab(codigo)}>{item.label}</button>)}</div><div className="administracion-toolbar"><input className="user-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar..." aria-label="Buscar registros" /><select className="catalog-filter" value={filtroVisibilidad} onChange={(event) => setFiltroVisibilidad(event.target.value)} aria-label="Filtrar por visibilidad"><option value="TODOS">Todos</option><option value="VISIBLES">Visibles</option><option value="OCULTOS">Ocultos</option></select></div>{loading ? <div className="empty-state">Cargando registros...</div> : error ? <div className="empty-state error-state">{error}</div> : <DataTable columns={columns} data={filtered} getRowKey={(item) => item.id} emptyMessage="No hay registros para mostrar." />}</div>{modal?.kind === 'password' && <Modal title={`Restablecer contraseña: ${modal.username}`} onClose={() => setModal(null)}><form className="catalog-form" onSubmit={guardarPassword}><div className="catalog-form-grid"><PasswordField id="sysadmin_password" label="Nueva contraseña" value={modal.form.password} onChange={(event) => setModal((current) => ({ ...current, form: { ...current.form, password: event.target.value } }))} /><PasswordField id="sysadmin_confirmacion" label="Confirmar contraseña" value={modal.form.confirmacion} onChange={(event) => setModal((current) => ({ ...current, form: { ...current.form, confirmacion: event.target.value } }))} /></div><div className="modal-actions"><button className="button-secondary" type="button" onClick={() => setModal(null)}>Cancelar</button><button type="submit" disabled={saving}>Restablecer contraseña</button></div></form></Modal>}<ConfirmDialog dialog={confirmDialog} onCancel={() => setConfirmDialog(null)} onConfirm={confirmarVisibilidad} /></section>
}

export default AdministracionView
