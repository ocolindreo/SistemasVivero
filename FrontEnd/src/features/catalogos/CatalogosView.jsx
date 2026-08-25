import { useEffect, useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import ConfirmDialog from '../../components/ConfirmDialog'
import StatusBadge from '../../components/StatusBadge'
import DataTable from '../../components/DataTable'
import { DEPARTAMENTOS_GUATEMALA, UBICACIONES_GUATEMALA } from '../../data/ubicacionesGuatemala'
import {
  obtenerEspecies,
  crearEspecie,
  editarEspecie,
  inactivarEspecie,
  reactivarEspecie,
  obtenerAreas,
  crearArea,
  editarArea,
  inactivarArea,
  reactivarArea,
  obtenerBeneficiarios,
  crearBeneficiario,
  editarBeneficiario,
  inactivarBeneficiario,
  reactivarBeneficiario,
  obtenerEstados,
} from '../../services/api'

const BENEFICIARIO_TIPOS = [
  { value: 'PERSONA', label: 'Persona' },
  { value: 'ESCUELA', label: 'Escuela' },
  { value: 'COMUNIDAD', label: 'Comunidad' },
  { value: 'INSTITUCION', label: 'Institucion' },
]

const ESTADOS_MODULOS = ['TODOS', 'PRODUCCION', 'SOLICITUD', 'RESERVA', 'ENTREGA']

const TABS = [
  { id: 'especies', label: 'Especies', subtitle: 'Catalogo de especies registradas' },
  { id: 'areas', label: 'Areas del vivero', subtitle: 'Catalogo de areas fisicas del vivero' },
  { id: 'beneficiarios', label: 'Beneficiarios', subtitle: 'Catalogo de beneficiarios institucionales y comunitarios' },
  { id: 'estados', label: 'Estados', subtitle: 'Estados centralizados de solo consulta' },
]

const EMPTY_ESPECIE = { nombre_comun: '', nombre_cientifico: '', descripcion: '' }
const EMPTY_AREA = { nombre: '', descripcion: '', ubicacion: '' }
const EMPTY_BENEFICIARIO = {
  tipo: 'PERSONA',
  nombre: '',
  nit: '',
  dpi: '',
  responsable: '',
  departamento: '',
  municipio: '',
  telefono: '',
  email: '',
  direccion: '',
  descripcion: '',
}

const WRITE_PERMISSIONS = {
  especies: ['ADMIN', 'VIVERO'],
  areas: ['ADMIN', 'VIVERO'],
  beneficiarios: ['ADMIN', 'VIVERO', 'GESTION'],
}

function mapError(error, fallbackMessage) {
  if (error?.status === 403) {
    return 'No tiene permisos para realizar esta operacion.'
  }
  return error?.message || fallbackMessage
}

function normalizePayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => {
      if (typeof value !== 'string') return [key, value]
      const trimmed = value.trim()
      return [key, trimmed === '' ? null : trimmed]
    })
  )
}

function CatalogForm({ children, saving, onCancel, submitLabel = 'Guardar' }) {
  return (
    <>
      <div className="catalog-form-grid">{children}</div>
      <div className="modal-actions">
        <button className="button-secondary" type="button" onClick={onCancel}>Cancelar</button>
        <button type="submit" disabled={saving}>{saving ? 'Guardando...' : submitLabel}</button>
      </div>
    </>
  )
}

function CatalogosView({ currentUser, onToast, onSessionInvalid }) {
  const [activeTab, setActiveTab] = useState('especies')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState({ especies: true, areas: false, beneficiarios: false, estados: false })
  const [error, setError] = useState({ especies: '', areas: '', beneficiarios: '', estados: '' })
  const [data, setData] = useState({ especies: [], areas: [], beneficiarios: [], estados: [] })
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [estadoModuloFilter, setEstadoModuloFilter] = useState('TODOS')

  const userRole = currentUser?.rol?.codigo || ''
  const canWrite = {
    especies: WRITE_PERMISSIONS.especies.includes(userRole),
    areas: WRITE_PERMISSIONS.areas.includes(userRole),
    beneficiarios: WRITE_PERMISSIONS.beneficiarios.includes(userRole),
  }

  async function guardedCall(call, fallbackMessage) {
    try {
      return await call()
    } catch (err) {
      if (err?.status === 401) {
        onSessionInvalid()
        return null
      }
      throw new Error(mapError(err, fallbackMessage), { cause: err })
    }
  }

  async function loadTab(tabId) {
    setLoading((prev) => ({ ...prev, [tabId]: true }))
    setError((prev) => ({ ...prev, [tabId]: '' }))

    const endpoint = {
      especies: obtenerEspecies,
      areas: obtenerAreas,
      beneficiarios: obtenerBeneficiarios,
      estados: obtenerEstados,
    }[tabId]

    const resultKey = {
      especies: 'especies',
      areas: 'areas',
      beneficiarios: 'beneficiarios',
      estados: 'estados',
    }[tabId]

    const fallback = {
      especies: 'No fue posible cargar las especies.',
      areas: 'No fue posible cargar las areas.',
      beneficiarios: 'No fue posible cargar los beneficiarios.',
      estados: 'No fue posible cargar los estados.',
    }[tabId]

    try {
      const response = await guardedCall(() => endpoint(), fallback)
      if (!response) return
      setData((prev) => ({ ...prev, [tabId]: response[resultKey] || [] }))
    } catch (err) {
      setError((prev) => ({ ...prev, [tabId]: err.message }))
    } finally {
      setLoading((prev) => ({ ...prev, [tabId]: false }))
    }
  }

  useEffect(() => {
    loadTab('especies')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (data[activeTab].length || loading[activeTab] || error[activeTab]) return
    loadTab(activeTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const filteredEspecies = useMemo(() => {
    const term = search.toLowerCase()
    return data.especies.filter((item) => `${item.codigo} ${item.nombre_comun} ${item.nombre_cientifico || ''}`.toLowerCase().includes(term))
  }, [data.especies, search])

  const filteredAreas = useMemo(() => {
    const term = search.toLowerCase()
    return data.areas.filter((item) => `${item.codigo} ${item.nombre} ${item.ubicacion || ''}`.toLowerCase().includes(term))
  }, [data.areas, search])

  const filteredBeneficiarios = useMemo(() => {
    const term = search.toLowerCase()
    return data.beneficiarios.filter((item) => `${item.codigo} ${item.nombre} ${item.nit || ''} ${item.dpi || ''} ${item.responsable || ''} ${item.municipio || ''}`.toLowerCase().includes(term))
  }, [data.beneficiarios, search])

  const filteredEstados = useMemo(() => {
    const term = search.toLowerCase()
    return data.estados.filter((item) => {
      const moduloMatch = estadoModuloFilter === 'TODOS' || item.modulo === estadoModuloFilter
      const searchMatch = `${item.codigo} ${item.descripcion} ${item.modulo}`.toLowerCase().includes(term)
      return moduloMatch && searchMatch
    })
  }, [data.estados, search, estadoModuloFilter])

  function resetSearchForTab(tabId) {
    setActiveTab(tabId)
    setSearch('')
    if (tabId === 'estados') {
      setEstadoModuloFilter('TODOS')
    }
  }

  function requestStatusChange({ resource, item, inactivate, execute }) {
    const noun = {
      especies: 'especie',
      areas: 'area',
      beneficiarios: 'beneficiario',
    }[resource]

    const label = item.nombre_comun || item.nombre || item.codigo

    setConfirmDialog({
      title: inactivate ? `Inactivar ${noun}` : `Reactivar ${noun}`,
      message: `Desea ${inactivate ? 'inactivar' : 'reactivar'} ${noun === 'area' ? 'el area' : noun === 'beneficiario' ? 'al beneficiario' : 'la especie'} ${label}?`,
      confirmLabel: inactivate ? 'Inactivar' : 'Reactivar',
      danger: inactivate,
      loading: false,
      run: execute,
      successMessage: `${noun.charAt(0).toUpperCase() + noun.slice(1)} ${inactivate ? 'inactivada' : 'reactivada'} correctamente.`,
      tabToReload: resource,
    })
  }

  async function onConfirmStatusChange() {
    if (!confirmDialog?.run) return
    setConfirmDialog((prev) => ({ ...prev, loading: true }))

    try {
      await guardedCall(() => confirmDialog.run(), 'No fue posible actualizar el estado.')
      await loadTab(confirmDialog.tabToReload)
      setConfirmDialog(null)
      onToast(confirmDialog.successMessage, 'success')
    } catch (err) {
      setConfirmDialog(null)
      onToast(err.message, 'error')
    }
  }

  function renderCatalogActions(resource, item, emptyForm, canEdit, inactivateAction, reactivateAction) {
    if (!canEdit) return <span className="action-note">Solo lectura</span>

    return (
      <>
        <button className="text-button" type="button" onClick={() => setModal({ kind: resource.slice(0, -1), record: item, form: { ...emptyForm, ...item } })}>Editar</button>
        <button
          className="text-button"
          type="button"
          onClick={() => requestStatusChange({
            resource,
            item,
            inactivate: item.estado === 1,
            execute: () => (item.estado === 1 ? inactivateAction(item.id) : reactivateAction(item.id)),
          })}
        >
          {item.estado === 1 ? 'Inactivar' : 'Reactivar'}
        </button>
      </>
    )
  }

  const especiesColumns = [
    { key: 'codigo', label: 'Codigo', sortable: true },
    { key: 'nombre_comun', label: 'Nombre comun', sortable: true },
    { key: 'nombre_cientifico', label: 'Nombre cientifico', sortable: true, render: (item) => item.nombre_cientifico || '-' },
    { key: 'estado', label: 'Estado', sortable: true, render: (item) => <StatusBadge active={item.estado === 1} /> },
    { key: 'acciones', label: 'Acciones', sortable: false, className: 'row-actions', render: (item) => renderCatalogActions('especies', item, EMPTY_ESPECIE, canWrite.especies, inactivarEspecie, reactivarEspecie) },
  ]

  const areasColumns = [
    { key: 'codigo', label: 'Codigo', sortable: true },
    { key: 'nombre', label: 'Nombre', sortable: true },
    { key: 'ubicacion', label: 'Ubicacion', sortable: true, render: (item) => item.ubicacion || '-' },
    { key: 'estado', label: 'Estado', sortable: true, render: (item) => <StatusBadge active={item.estado === 1} /> },
    { key: 'acciones', label: 'Acciones', sortable: false, className: 'row-actions', render: (item) => renderCatalogActions('areas', item, EMPTY_AREA, canWrite.areas, inactivarArea, reactivarArea) },
  ]

  const beneficiariosColumns = [
    { key: 'codigo', label: 'Codigo', sortable: true },
    { key: 'nombre', label: 'Nombre', sortable: true },
    { key: 'tipo', label: 'Tipo', sortable: true, render: (item) => BENEFICIARIO_TIPOS.find((tipo) => tipo.value === item.tipo)?.label || item.tipo },
    { key: 'municipio', label: 'Municipio', sortable: true, render: (item) => item.municipio || '-' },
    { key: 'telefono', label: 'Telefono', sortable: true, render: (item) => item.telefono || '-' },
    { key: 'estado', label: 'Estado', sortable: true, render: (item) => <StatusBadge active={item.estado === 1} /> },
    { key: 'acciones', label: 'Acciones', sortable: false, className: 'row-actions', render: (item) => renderCatalogActions('beneficiarios', item, EMPTY_BENEFICIARIO, canWrite.beneficiarios, inactivarBeneficiario, reactivarBeneficiario) },
  ]

  const estadosColumns = [
    { key: 'codigo', label: 'Codigo', sortable: true },
    { key: 'descripcion', label: 'Descripcion', sortable: true },
    { key: 'modulo', label: 'Modulo', sortable: true },
    { key: 'orden', label: 'Orden', sortable: true },
  ]

  async function saveModalForm(event) {
    event.preventDefault()
    if (!modal) return

    setSaving(true)

    const submitters = {
      especie: async () => {
        const payload = normalizePayload(modal.form)
        const body = {
          nombre_comun: payload.nombre_comun,
          nombre_cientifico: payload.nombre_cientifico,
          descripcion: payload.descripcion,
        }
        if (modal.record) {
          await editarEspecie(modal.record.id, body)
          onToast('Especie actualizada correctamente.', 'success')
        } else {
          await crearEspecie(body)
          onToast('Especie creada correctamente.', 'success')
        }
        await loadTab('especies')
      },
      area: async () => {
        const payload = normalizePayload(modal.form)
        const body = {
          nombre: payload.nombre,
          descripcion: payload.descripcion,
          ubicacion: payload.ubicacion,
        }
        if (modal.record) {
          await editarArea(modal.record.id, body)
          onToast('Area actualizada correctamente.', 'success')
        } else {
          await crearArea(body)
          onToast('Area creada correctamente.', 'success')
        }
        await loadTab('areas')
      },
      beneficiario: async () => {
        const payload = normalizePayload(modal.form)
        const body = {
          tipo: payload.tipo,
          nombre: payload.nombre,
          nit: payload.nit,
          dpi: payload.dpi,
          responsable: payload.responsable,
          departamento: payload.departamento,
          municipio: payload.municipio,
          telefono: payload.telefono,
          email: payload.email,
          direccion: payload.direccion,
          descripcion: payload.descripcion,
        }
        if (modal.record) {
          await editarBeneficiario(modal.record.id, body)
          onToast('Beneficiario actualizado correctamente.', 'success')
        } else {
          await crearBeneficiario(body)
          onToast('Beneficiario creado correctamente.', 'success')
        }
        await loadTab('beneficiarios')
      },
    }

    try {
      await guardedCall(submitters[modal.kind], 'No fue posible guardar el registro.')
      setModal(null)
    } catch (err) {
      onToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function updateModalField(event) {
    const { name, value } = event.target
    setModal((prev) => {
      const nextForm = { ...prev.form, [name]: value }

      if (name === 'departamento') {
        nextForm.municipio = ''
      }

      return { ...prev, form: nextForm }
    })
  }

  const currentTab = TABS.find((tab) => tab.id === activeTab)

  return (
    <section className="catalogos-view" aria-labelledby="catalogos-title">
      <header className="catalogos-header">
        <div>
          <span className="page-kicker">Catalogos</span>
          <h1 id="catalogos-title">Catalogos</h1>
          <p>Administre la informacion maestra utilizada por el sistema.</p>
        </div>
      </header>

      <div className="catalog-tabs" role="tablist" aria-label="Secciones de catalogos">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`catalog-tab ${activeTab === tab.id ? 'catalog-tab-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => resetSearchForTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="catalog-card" role="region" aria-live="polite">
        <div className="catalog-card-header">
          <div>
            <h2>{currentTab?.label}</h2>
            <p>{currentTab?.subtitle}</p>
          </div>

          <div className="catalog-card-actions">
            <input
              className="catalog-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                activeTab === 'especies'
                  ? 'Buscar especie...'
                  : activeTab === 'areas'
                    ? 'Buscar area...'
                    : activeTab === 'beneficiarios'
                      ? 'Buscar beneficiario...'
                      : 'Buscar estado...'
              }
            />

            {activeTab === 'estados' ? (
              <select
                className="catalog-filter"
                value={estadoModuloFilter}
                onChange={(event) => setEstadoModuloFilter(event.target.value)}
              >
                {ESTADOS_MODULOS.map((modulo) => (
                  <option key={modulo} value={modulo}>{modulo === 'TODOS' ? 'Todos' : modulo}</option>
                ))}
              </select>
            ) : null}

            {activeTab === 'especies' && canWrite.especies ? (
              <button type="button" onClick={() => setModal({ kind: 'especie', record: null, form: EMPTY_ESPECIE })}>+ Nueva Especie</button>
            ) : null}
            {activeTab === 'areas' && canWrite.areas ? (
              <button type="button" onClick={() => setModal({ kind: 'area', record: null, form: EMPTY_AREA })}>+ Nueva Area</button>
            ) : null}
            {activeTab === 'beneficiarios' && canWrite.beneficiarios ? (
              <button type="button" onClick={() => setModal({ kind: 'beneficiario', record: null, form: EMPTY_BENEFICIARIO })}>+ Nuevo Beneficiario</button>
            ) : null}
          </div>
        </div>

        {activeTab === 'especies' && (
          <>
            {error.especies ? <p className="users-alert">{error.especies}</p> : null}
            {loading.especies ? <div className="empty-state">Cargando especies...</div> : null}
            {!loading.especies ? <DataTable columns={especiesColumns} data={filteredEspecies} getRowKey={(item) => item.id} emptyMessage={data.especies.length ? 'No hay resultados para la busqueda.' : 'No hay especies registradas.'} /> : null}
          </>
        )}

        {activeTab === 'areas' && (
          <>
            {error.areas ? <p className="users-alert">{error.areas}</p> : null}
            {loading.areas ? <div className="empty-state">Cargando areas...</div> : null}
            {!loading.areas ? <DataTable columns={areasColumns} data={filteredAreas} getRowKey={(item) => item.id} emptyMessage={data.areas.length ? 'No hay resultados para la busqueda.' : 'No hay areas registradas.'} /> : null}
          </>
        )}

        {activeTab === 'beneficiarios' && (
          <>
            {error.beneficiarios ? <p className="users-alert">{error.beneficiarios}</p> : null}
            {loading.beneficiarios ? <div className="empty-state">Cargando beneficiarios...</div> : null}
            {!loading.beneficiarios ? <DataTable columns={beneficiariosColumns} data={filteredBeneficiarios} getRowKey={(item) => item.id} emptyMessage={data.beneficiarios.length ? 'No hay resultados para la busqueda.' : 'No hay beneficiarios registrados.'} /> : null}
          </>
        )}

        {activeTab === 'estados' && (
          <>
            {error.estados ? <p className="users-alert">{error.estados}</p> : null}
            {loading.estados ? <div className="empty-state">Cargando estados...</div> : null}
            {!loading.estados ? <DataTable columns={estadosColumns} data={filteredEstados} getRowKey={(item) => item.id} emptyMessage={data.estados.length ? 'No hay resultados para la busqueda.' : 'No hay estados registrados.'} /> : null}
          </>
        )}
      </div>

      {modal?.kind === 'especie' ? (
        <Modal title={modal.record ? 'Editar especie' : 'Nueva especie'} onClose={() => setModal(null)}>
          <form className="user-form" onSubmit={saveModalForm}>
            <CatalogForm saving={saving} onCancel={() => setModal(null)}>
              {modal.record ? <label className="catalog-span-full">Codigo asignado<input value={modal.record.codigo || ''} readOnly disabled /></label> : null}
              <label>
                Nombre comun *
                <input name="nombre_comun" value={modal.form.nombre_comun || ''} onChange={updateModalField} required />
              </label>
              <label>
                Nombre cientifico
                <input name="nombre_cientifico" value={modal.form.nombre_cientifico || ''} onChange={updateModalField} />
              </label>
              <label className="catalog-span-full">
                Descripcion
                <textarea name="descripcion" rows="3" value={modal.form.descripcion || ''} onChange={updateModalField} />
              </label>
            </CatalogForm>
          </form>
        </Modal>
      ) : null}

      {modal?.kind === 'area' ? (
        <Modal title={modal.record ? 'Editar area' : 'Nueva area'} onClose={() => setModal(null)}>
          <form className="user-form" onSubmit={saveModalForm}>
            <CatalogForm saving={saving} onCancel={() => setModal(null)}>
              {modal.record ? <label className="catalog-span-full">Codigo asignado<input value={modal.record.codigo || ''} readOnly disabled /></label> : null}
              <label>
                Nombre *
                <input name="nombre" value={modal.form.nombre || ''} onChange={updateModalField} required />
              </label>
              <label className="catalog-span-full">
                Ubicacion
                <input name="ubicacion" value={modal.form.ubicacion || ''} onChange={updateModalField} />
              </label>
              <label className="catalog-span-full">
                Descripcion
                <textarea name="descripcion" rows="3" value={modal.form.descripcion || ''} onChange={updateModalField} />
              </label>
            </CatalogForm>
          </form>
        </Modal>
      ) : null}

      {modal?.kind === 'beneficiario' ? (
        <Modal title={modal.record ? 'Editar beneficiario' : 'Nuevo beneficiario'} onClose={() => setModal(null)}>
          <form className="user-form" onSubmit={saveModalForm}>
            <CatalogForm saving={saving} onCancel={() => setModal(null)}>
              {modal.record ? <label className="catalog-span-full">Codigo asignado<input value={modal.record.codigo || ''} readOnly disabled /></label> : null}
              <label>
                Tipo *
                <select name="tipo" value={modal.form.tipo || 'PERSONA'} onChange={updateModalField} required>
                  {BENEFICIARIO_TIPOS.map((tipo) => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}
                </select>
              </label>
              <label>
                Nombre *
                <input name="nombre" value={modal.form.nombre || ''} onChange={updateModalField} required />
              </label>
              <label>
                Responsable
                <input name="responsable" value={modal.form.responsable || ''} onChange={updateModalField} />
              </label>
              <label>
                NIT
                <input name="nit" value={modal.form.nit || ''} onChange={updateModalField} />
              </label>
              <label>
                DPI
                <input name="dpi" value={modal.form.dpi || ''} onChange={updateModalField} />
              </label>
              <label>
                Departamento
                <select name="departamento" value={modal.form.departamento || ''} onChange={updateModalField}>
                  <option value="">Seleccione un departamento</option>
                  {DEPARTAMENTOS_GUATEMALA.map((departamento) => <option key={departamento} value={departamento}>{departamento}</option>)}
                </select>
              </label>
              <label>
                Municipio
                <select name="municipio" value={modal.form.municipio || ''} onChange={updateModalField} disabled={!modal.form.departamento}>
                  <option value="">Seleccione un municipio</option>
                  {(UBICACIONES_GUATEMALA[modal.form.departamento] || []).map((municipio) => <option key={municipio} value={municipio}>{municipio}</option>)}
                </select>
              </label>
              <label>
                Telefono
                <input name="telefono" value={modal.form.telefono || ''} onChange={updateModalField} />
              </label>
              <label>
                Correo electronico
                <input type="email" name="email" value={modal.form.email || ''} onChange={updateModalField} />
              </label>
              <label className="catalog-span-full">
                Direccion
                <textarea name="direccion" rows="2" value={modal.form.direccion || ''} onChange={updateModalField} />
              </label>
              <label className="catalog-span-full">
                Descripcion
                <textarea name="descripcion" rows="3" value={modal.form.descripcion || ''} onChange={updateModalField} />
              </label>
            </CatalogForm>
          </form>
        </Modal>
      ) : null}

      <ConfirmDialog dialog={confirmDialog} onCancel={() => setConfirmDialog(null)} onConfirm={onConfirmStatusChange} />
    </section>
  )
}

export default CatalogosView
