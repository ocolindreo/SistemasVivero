import { useEffect, useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import DataTable from '../../components/DataTable'
import {
  obtenerLotes,
  obtenerLote,
  obtenerEtapasLote,
  obtenerResponsablesProduccion,
  obtenerEspecies,
  obtenerAreas,
  crearLote,
  editarObservacionesLote,
  avanzarEtapaLote,
  cancelarLote,
} from '../../services/api'

const ETAPAS_PRODUCCION = ['PLANIFICADO', 'SIEMBRA', 'GERMINACION', 'CRECIMIENTO', 'ENDURECIMIENTO', 'DISPONIBLE', 'FINALIZADO']
const ETAPAS_CON_CANCELADO = [...ETAPAS_PRODUCCION, 'CANCELADO']
const ETAPAS_ACTUALES = ['PLANIFICADO', 'SIEMBRA', 'GERMINACION', 'CRECIMIENTO', 'ENDURECIMIENTO', 'DISPONIBLE']

const WRITE_PERMISSIONS = {
  crear: ['ADMIN', 'VIVERO'],
  avanzar: ['ADMIN', 'VIVERO'],
  editar: ['ADMIN', 'VIVERO'],
  cancelar: ['ADMIN', 'VIVERO'],
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

function formatearFecha(fecha) {
  if (!fecha) return '—'

  const datePart = String(fecha).split('T')[0]
  const [year, month, day] = datePart.split('-')

  if (!year || !month || !day) return '—'

  return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`
}

function TimelineEtapas({ etapaActual }) {
  const cancelado = etapaActual === 'CANCELADO'

  const isCompleted = (codigo) => {
    const etapaIndex = ETAPAS_PRODUCCION.indexOf(codigo)
    const actualIndex = ETAPAS_PRODUCCION.indexOf(etapaActual)
    return etapaIndex < actualIndex
  }

  const isCurrent = (codigo) => codigo === etapaActual

  const isPending = (codigo) => {
    const etapaIndex = ETAPAS_PRODUCCION.indexOf(codigo)
    const actualIndex = ETAPAS_PRODUCCION.indexOf(etapaActual)
    return etapaIndex > actualIndex
  }

  return (
    <div className="timeline-container">
      <div className="timeline-track">
        {ETAPAS_PRODUCCION.map((etapa) => {
          const completed = isCompleted(etapa)
          const current = isCurrent(etapa)
          const pending = isPending(etapa)

          return (
            <div key={etapa} className={`timeline-stage ${completed ? 'completed' : current ? 'current' : pending ? 'pending' : ''}`}>
              <span className="timeline-arrow" aria-hidden="true">{pending ? '▷' : '▶'}</span>
              {completed && <span className="timeline-check" aria-hidden="true">✓</span>}
              <span className="timeline-label">{etapa}</span>
            </div>
          )
        })}
      </div>
      {cancelado && <div className="timeline-cancelled">Lote cancelado</div>}
    </div>
  )
}

function InfoCard({ title, value, variant = 'normal' }) {
  return (
    <div className={`info-card info-card-${variant}`}>
      <div className="info-card-title">{title}</div>
      <div className="info-card-value">{value}</div>
    </div>
  )
}

function ProduccionView({ currentUser, onToast, onSessionInvalid }) {
  const [lotes, setLotes] = useState([])
  const [loadingLotes, setLoadingLotes] = useState(true)
  const [errorLotes, setErrorLotes] = useState('')
  const [search, setSearch] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState('TODOS')
  const [pestana, setPestana] = useState('ACTUAL')

  const [species, setSpecies] = useState([])
  const [areas, setAreas] = useState([])
  const [responsables, setResponsables] = useState([])

  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)

  const [detalleLote, setDetalleLote] = useState(null)
  const [etapasLote, setEtapasLote] = useState([])
  const [detalleTab, setDetalleTab] = useState('informacion')

  const userRole = currentUser?.rol?.codigo || ''
  const canWrite = {
    crear: WRITE_PERMISSIONS.crear.includes(userRole),
    avanzar: WRITE_PERMISSIONS.avanzar.includes(userRole),
    editar: WRITE_PERMISSIONS.editar.includes(userRole),
    cancelar: WRITE_PERMISSIONS.cancelar.includes(userRole),
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

  // Carga inicial de lotes y recursos
  async function cargarLotes() {
    setLoadingLotes(true)
    setErrorLotes('')

    try {
      const response = await guardedCall(() => obtenerLotes(), 'No fue posible cargar los lotes.')
      if (!response) return
      setLotes(response.lotes || [])
    } catch (err) {
      setErrorLotes(err.message)
    } finally {
      setLoadingLotes(false)
    }
  }

  async function cargarRecursos() {
    try {
      const [specData, areaData, respData] = await Promise.all([
        guardedCall(() => obtenerEspecies(), 'Error cargando especies'),
        guardedCall(() => obtenerAreas(), 'Error cargando áreas'),
        guardedCall(() => obtenerResponsablesProduccion(), 'Error cargando responsables'),
      ])

      if (specData) setSpecies(specData.especies || [])
      if (areaData) setAreas(areaData.areas || [])
      if (respData) setResponsables(respData.responsables || [])
    } catch {
      // Los recursos son opcionales para UI, solo si es crítico mostrar error
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarLotes()
    cargarRecursos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Carga de detalle de lote
  async function abrirDetalle(loteId) {
    setEtapasLote([])
    setDetalleTab('informacion')

    try {
      const [loteData, etapasData] = await Promise.all([
        guardedCall(() => obtenerLote(loteId), 'No fue posible cargar el lote'),
        guardedCall(() => obtenerEtapasLote(loteId), 'No fue posible cargar las etapas'),
      ])

      if (loteData) setDetalleLote(loteData.lote)
      if (etapasData) setEtapasLote(etapasData.etapas || [])
    } catch (err) {
      onToast(err.message, 'error')
    }
  }

  function cerrarDetalle() {
    setDetalleLote(null)
    setEtapasLote([])
    setDetalleTab('informacion')
  }

  // Búsqueda y filtro
  const lotesFiltered = useMemo(() => {
    const termino = search.toLowerCase()
    return lotes.filter((lote) => {
      const esHistorico = !ETAPAS_ACTUALES.includes(lote.etapa?.codigo)
      const pestanaOk = pestana === 'ACTUAL' ? !esHistorico : esHistorico
      const filtroEtapaOk = filtroEtapa === 'TODOS' || lote.etapa?.codigo === filtroEtapa
      const busquedaOk = !termino || [
        lote.codigo,
        lote.especie?.codigo,
        lote.especie?.nombre_comun,
        lote.area?.nombre,
        lote.responsable?.nombres,
        lote.responsable?.apellidos,
        lote.etapa?.codigo,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(termino)

      return pestanaOk && filtroEtapaOk && busquedaOk
    })
  }, [lotes, search, filtroEtapa, pestana])

  const responsableColumn = {
    key: 'responsable',
    label: 'Responsable',
    sortable: true,
    sortValue: (lote) => `${lote.responsable?.nombres || ''} ${lote.responsable?.apellidos || ''}`,
    render: (lote) => `${lote.responsable?.nombres || ''} ${lote.responsable?.apellidos || ''}`,
  }

  const accionesColumn = {
    key: 'acciones',
    label: 'Acciones',
    sortable: false,
    render: (lote) => <button type="button" onClick={() => abrirDetalle(lote.id)}>Ver</button>,
  }

  const produccionActualColumns = [
    { key: 'codigo', label: 'Código', sortable: true },
    { key: 'especie.nombre_comun', label: 'Especie', sortable: true },
    { key: 'cantidad_inicial', label: 'Cantidad inicial', sortable: true },
    { key: 'cantidad_actual', label: 'Cantidad actual', sortable: true },
    { key: 'etapa.codigo', label: 'Etapa', sortable: true },
    { key: 'area.nombre', label: 'Área', sortable: true },
    responsableColumn,
    accionesColumn,
  ]

  const produccionHistoricoColumns = [
    { key: 'codigo', label: 'Código', sortable: true },
    { key: 'especie.nombre_comun', label: 'Especie', sortable: true },
    { key: 'cantidad_inicial', label: 'Cantidad inicial', sortable: true },
    { key: 'cantidad_actual', label: 'Cantidad final', sortable: true },
    {
      key: 'etapa.codigo',
      label: 'Estado final',
      sortable: true,
      render: (lote) => (
        <span className={`status-badge ${lote.etapa?.codigo === 'CANCELADO' ? 'status-inactive' : 'status-active'}`}>
          {lote.etapa?.codigo}
        </span>
      ),
    },
    responsableColumn,
    accionesColumn,
  ]

  const lotesColumns = pestana === 'ACTUAL' ? produccionActualColumns : produccionHistoricoColumns

  const historialColumns = [
    { key: 'estado.codigo', label: 'Etapa', sortable: true },
    { key: 'fecha_inicio', label: 'Fecha inicio', sortable: true, render: (etapa) => formatearFecha(etapa.fecha_inicio) },
    { key: 'fecha_fin', label: 'Fecha fin', sortable: true, render: (etapa) => formatearFecha(etapa.fecha_fin) },
    { key: 'cantidad', label: 'Cantidad', sortable: true, render: (etapa) => etapa.cantidad || '—' },
    { key: 'merma', label: 'Merma', sortable: true, render: (etapa) => etapa.merma !== null ? etapa.merma : '—' },
    { key: 'area.nombre', label: 'Área', sortable: true },
    { key: 'responsable', label: 'Responsable', sortable: true, sortValue: (etapa) => `${etapa.responsable?.nombres || ''} ${etapa.responsable?.apellidos || ''}`, render: (etapa) => `${etapa.responsable?.nombres || ''} ${etapa.responsable?.apellidos || ''}` },
  ]

  // Crear lote
  async function guardarCrearLote(event) {
    event.preventDefault()
    if (!modal || modal.kind !== 'crear') return

    setSaving(true)

    try {
      const payload = normalizePayload(modal.form)
      const body = {
        especie_id: payload.especie_id ? parseInt(payload.especie_id) : null,
        cantidad_inicial: payload.cantidad_inicial ? parseInt(payload.cantidad_inicial) : null,
        fecha_inicio: payload.fecha_inicio,
        responsable_id: payload.responsable_id ? parseInt(payload.responsable_id) : null,
        area_id: payload.area_id ? parseInt(payload.area_id) : null,
        observaciones: payload.observaciones,
      }

      if (!body.especie_id || !body.cantidad_inicial || !body.fecha_inicio || !body.responsable_id || !body.area_id) {
        onToast('Todos los campos marcados con * son obligatorios.', 'error')
        setSaving(false)
        return
      }

      await guardedCall(() => crearLote(body), 'No fue posible crear el lote.')
      onToast('Lote creado correctamente.', 'success')
      setModal(null)
      await cargarLotes()
    } catch (err) {
      onToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Editar observaciones
  async function guardarEditarObservaciones(event) {
    event.preventDefault()
    if (!modal || modal.kind !== 'editar-observaciones') return

    setSaving(true)

    try {
      const payload = normalizePayload(modal.form)
      const body = {
        observaciones: payload.observaciones,
      }

      await guardedCall(() => editarObservacionesLote(modal.loteId, body), 'No fue posible actualizar las observaciones.')
      onToast('Observaciones actualizadas correctamente.', 'success')
      setModal(null)
      await abrirDetalle(modal.loteId)
      await cargarLotes()
    } catch (err) {
      onToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Avanzar etapa
  async function guardarAvanzarEtapa(event) {
    event.preventDefault()
    if (!modal || modal.kind !== 'avanzar-etapa') return

    setSaving(true)

    try {
      const payload = normalizePayload(modal.form)
      const body = {
        fecha_inicio: payload.fecha_inicio,
        cantidad: payload.cantidad ? parseInt(payload.cantidad) : null,
        area_id: payload.area_id ? parseInt(payload.area_id) : null,
        responsable_id: payload.responsable_id ? parseInt(payload.responsable_id) : null,
        observaciones: payload.observaciones,
      }

      if (!body.fecha_inicio || !body.cantidad || !body.area_id || !body.responsable_id) {
        onToast('Todos los campos marcados con * son obligatorios.', 'error')
        setSaving(false)
        return
      }

      await guardedCall(() => avanzarEtapaLote(modal.loteId, body), 'No fue posible avanzar la etapa.')
      onToast(`Lote avanzado a ${modal.siguienteEtapa} correctamente.`, 'success')
      setModal(null)
      await abrirDetalle(modal.loteId)
      await cargarLotes()
    } catch (err) {
      onToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Cancelar lote
  async function guardarCancelarLote(event) {
    event.preventDefault()
    if (!modal || modal.kind !== 'cancelar') return

    setSaving(true)

    try {
      const payload = normalizePayload(modal.form)
      const motivo = payload.motivo

      if (!motivo) {
        onToast('El motivo de cancelación es obligatorio.', 'error')
        setSaving(false)
        return
      }

      const body = { motivo }

      await guardedCall(() => cancelarLote(modal.loteId, body), 'No fue posible cancelar el lote.')
      onToast('Lote cancelado correctamente.', 'success')
      setModal(null)
      cerrarDetalle()
      await cargarLotes()
    } catch (err) {
      onToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function updateModalField(event) {
    const { name, value } = event.target
    setModal((prev) => ({
      ...prev,
      form: { ...prev.form, [name]: value },
    }))
  }

  const mermaAcumulada = detalleLote ? detalleLote.cantidad_inicial - detalleLote.cantidad_actual : 0
  const detalleEsHistorico = detalleLote ? !ETAPAS_ACTUALES.includes(detalleLote.etapa_actual?.codigo) : false

  return (
    <section className={`produccion-view ${!detalleLote ? 'produccion-view-listado' : ''}`} aria-labelledby="produccion-title">
      {!detalleLote ? (
        // LISTADO PRINCIPAL
        <>
          <header className="produccion-header">
            <div>
              <span className="page-kicker">Producción</span>
              <h1 id="produccion-title">Producción</h1>
              <p>Gestión y seguimiento de lotes de plantas</p>
            </div>
            {canWrite.crear && (
              <button
                type="button"
                onClick={() => {
                  setModal({
                    kind: 'crear',
                    form: {
                      especie_id: '',
                      cantidad_inicial: '',
                      fecha_inicio: '',
                      responsable_id: '',
                      area_id: '',
                      observaciones: '',
                    },
                  })
                }}
              >
                + Nuevo Lote
              </button>
            )}
          </header>

          <div className="data-card produccion-table-card" role="region" aria-live="polite">
            <div className="produccion-toolbar">
              <input
                className="user-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar lote..."
                aria-label="Buscar lote por código, especie, área o responsable"
              />

              <select
                className="catalog-filter"
                value={filtroEtapa}
                onChange={(event) => setFiltroEtapa(event.target.value)}
                aria-label="Filtrar por etapa"
              >
                <option value="TODOS">Todos</option>
                {ETAPAS_CON_CANCELADO.map((etapa) => (
                  <option key={etapa} value={etapa}>
                    {etapa}
                  </option>
                ))}
              </select>
            </div>

            <div className="catalog-tabs produccion-tabs" role="tablist" aria-label="Vistas de producción">
              <button type="button" className={`catalog-tab ${pestana === 'ACTUAL' ? 'catalog-tab-active' : ''}`} onClick={() => setPestana('ACTUAL')}>Actual</button>
              <button type="button" className={`catalog-tab ${pestana === 'HISTORICO' ? 'catalog-tab-active' : ''}`} onClick={() => setPestana('HISTORICO')}>Histórico</button>
            </div>

            {loadingLotes ? (
              <div className="empty-state">Cargando lotes...</div>
            ) : errorLotes ? (
              <div className="empty-state error-state">{errorLotes}</div>
            ) : (
              <DataTable columns={lotesColumns} data={lotesFiltered} getRowKey={(lote) => lote.id} emptyMessage={pestana === 'ACTUAL' ? 'No hay lotes actuales de producción registrados.' : 'No hay lotes históricos de producción registrados.'} />
            )}
          </div>
        </>
      ) : (
        // DETALLE DE LOTE
        <>
          <header className="catalogos-header detalle-page-header">
            <div>
              <button
                type="button"
                className="link-back"
                onClick={cerrarDetalle}
                aria-label="Volver al listado de lotes"
              >
                ← Volver
              </button>
              <h1 id="produccion-title">{detalleLote.codigo}</h1>
              <p>{detalleLote.especie?.nombre_comun}</p>
            </div>
            {detalleLote.etapa_actual && (
              <span className={`status-badge ${detalleLote.etapa_actual.codigo === 'CANCELADO' ? 'status-inactive' : 'status-active'}`}>
                {detalleLote.etapa_actual.codigo}
              </span>
            )}
          </header>

          <div className="detalle-container">
            <div className="catalog-tabs detalle-tabs" role="tablist" aria-label="Detalle del lote">
              <button type="button" className={`catalog-tab ${detalleTab === 'informacion' ? 'catalog-tab-active' : ''}`} onClick={() => setDetalleTab('informacion')}>Información</button>
              <button type="button" className={`catalog-tab ${detalleTab === 'progreso' ? 'catalog-tab-active' : ''}`} onClick={() => setDetalleTab('progreso')}>Progreso de producción</button>
              <button type="button" className={`catalog-tab ${detalleTab === 'historial' ? 'catalog-tab-active' : ''}`} onClick={() => setDetalleTab('historial')}>Historial</button>
            </div>

            {detalleTab === 'informacion' && (
              <div className="detalle-card">
                <div className="detalle-header">
                  <h2>Información general</h2>
                </div>

                <div className="info-grid">
                  <InfoCard title="Cantidad inicial" value={`${detalleLote.cantidad_inicial} plantas`} />
                  <InfoCard title="Cantidad actual" value={`${detalleLote.cantidad_actual} plantas`} />
                  <InfoCard title="Merma acumulada" value={`${mermaAcumulada} plantas`} variant="warning" />
                  <InfoCard title="Fecha de inicio" value={formatearFecha(detalleLote.fecha_inicio)} />
                  <InfoCard title="Área actual" value={detalleLote.area?.nombre} />
                  <InfoCard
                    title="Responsable"
                    value={`${detalleLote.responsable?.nombres} ${detalleLote.responsable?.apellidos}`}
                  />
                </div>

                {detalleLote.observaciones && (
                  <div className="detalle-section">
                    <h3>Observaciones</h3>
                    <p className="observaciones-text">{detalleLote.observaciones}</p>
                  </div>
                )}

                <div className="detalle-actions">
                  {canWrite.editar && !detalleEsHistorico && (
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => {
                        setModal({
                          kind: 'editar-observaciones',
                          loteId: detalleLote.id,
                          form: {
                            observaciones: detalleLote.observaciones || '',
                          },
                        })
                      }}
                    >
                      Editar observaciones
                    </button>
                  )}
                </div>
              </div>
            )}

            {detalleTab === 'progreso' && (
              <div className="detalle-card detalle-card-wide">
                <div className="detalle-header">
                  <h2>Progreso de producción</h2>
                </div>
                <TimelineEtapas etapaActual={detalleLote.etapa_actual?.codigo} />

                <div className="detalle-section etapa-actual-card">
                  <h3>Etapa actual</h3>
                  {detalleLote.etapa_actual ? (
                    <>
                      <div className="etapa-current-name">{detalleLote.etapa_actual.codigo}</div>
                      <div className="etapa-details">
                        <div>
                          <strong>Fecha de inicio:</strong> {formatearFecha(detalleLote.etapa_actual.fecha_inicio)}
                        </div>
                        <div>
                          <strong>Cantidad:</strong> {detalleLote.etapa_actual.cantidad} plantas
                        </div>
                        <div>
                          <strong>Área:</strong> {detalleLote.area?.nombre}
                        </div>
                        <div>
                          <strong>Responsable:</strong> {detalleLote.responsable?.nombres} {detalleLote.responsable?.apellidos}
                        </div>
                        {detalleLote.etapa_actual.observaciones && (
                          <div>
                            <strong>Observaciones:</strong> {detalleLote.etapa_actual.observaciones}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <p>No hay información de etapa actual.</p>
                  )}
                </div>

                {detalleLote.etapa_actual && detalleLote.siguiente_etapa && canWrite.avanzar && !detalleEsHistorico && (
                  <div className="siguiente-etapa">
                    <h3>Siguiente etapa</h3>
                    <p>{detalleLote.siguiente_etapa.codigo}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setModal({
                          kind: 'avanzar-etapa',
                          loteId: detalleLote.id,
                          siguienteEtapa: detalleLote.siguiente_etapa.codigo,
                          cantidadActual: detalleLote.cantidad_actual,
                          form: {
                            fecha_inicio: '',
                            cantidad: '',
                            area_id: '',
                            responsable_id: '',
                            observaciones: '',
                          },
                        })
                      }}
                    >
                      Avanzar a {detalleLote.siguiente_etapa.codigo}
                    </button>
                  </div>
                )}

                {detalleLote.etapa_actual && canWrite.cancelar && !detalleEsHistorico && detalleLote.etapa_actual.codigo !== 'DISPONIBLE' && (
                  <div className="cancelar-section">
                    <button
                      type="button"
                      className="button-danger"
                      onClick={() => {
                        setModal({
                          kind: 'cancelar',
                          loteId: detalleLote.id,
                          form: {
                            motivo: '',
                          },
                        })
                      }}
                    >
                      Cancelar lote
                    </button>
                  </div>
                )}
              </div>
            )}

            {detalleTab === 'historial' && (
              <div className="detalle-card">
                <h2>Historial de producción</h2>
                <DataTable columns={historialColumns} data={etapasLote} getRowKey={(etapa) => etapa.id} emptyMessage="No hay etapas registradas." />
              </div>
            )}
          </div>
        </>
      )}

      {/* MODALES */}

      {/* Modal Crear Lote */}
      {modal?.kind === 'crear' && (
        <Modal title="Nuevo lote" size="wide" onClose={() => setModal(null)}>
          <form className="catalog-form" onSubmit={guardarCrearLote}>
            <div className="catalog-form-grid">
              <div>
                <label htmlFor="especie_id">Especie *</label>
                <select
                  id="especie_id"
                  name="especie_id"
                  value={modal.form.especie_id}
                  onChange={updateModalField}
                  required
                >
                  <option value="">Seleccionar especie...</option>
                  {species.map((spec) => (
                    <option key={spec.id} value={spec.id}>
                      {spec.codigo} - {spec.nombre_comun}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="cantidad_inicial">Cantidad inicial (plantas) *</label>
                <input
                  id="cantidad_inicial"
                  name="cantidad_inicial"
                  type="number"
                  min="1"
                  value={modal.form.cantidad_inicial}
                  onChange={updateModalField}
                  required
                />
              </div>

              <div>
                <label htmlFor="fecha_inicio">Fecha de inicio *</label>
                <input
                  id="fecha_inicio"
                  name="fecha_inicio"
                  type="date"
                  value={modal.form.fecha_inicio}
                  onChange={updateModalField}
                  required
                />
              </div>

              <div>
                <label htmlFor="responsable_id">Responsable *</label>
                <select
                  id="responsable_id"
                  name="responsable_id"
                  value={modal.form.responsable_id}
                  onChange={updateModalField}
                  required
                >
                  <option value="">Seleccionar responsable...</option>
                  {responsables.map((resp) => (
                    <option key={resp.id} value={resp.id}>
                      {resp.nombres} {resp.apellidos} — {resp.rol.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="area_id">Área *</label>
                <select
                  id="area_id"
                  name="area_id"
                  value={modal.form.area_id}
                  onChange={updateModalField}
                  required
                >
                  <option value="">Seleccionar área...</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.codigo} - {area.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="catalog-span-full">
                <label htmlFor="observaciones">Observaciones</label>
                <textarea
                  id="observaciones"
                  name="observaciones"
                  value={modal.form.observaciones}
                  onChange={updateModalField}
                  rows="3"
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="button-secondary" type="button" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button type="submit" disabled={saving}>
                {saving ? 'Creando...' : 'Crear lote'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Editar Observaciones */}
      {modal?.kind === 'editar-observaciones' && (
        <Modal title="Editar observaciones" size="wide" onClose={() => setModal(null)}>
          <form className="catalog-form" onSubmit={guardarEditarObservaciones}>
            <div className="catalog-form-grid">
              <div className="catalog-span-full">
                <label htmlFor="observaciones">Observaciones</label>
                <textarea
                  id="observaciones"
                  name="observaciones"
                  value={modal.form.observaciones}
                  onChange={updateModalField}
                  rows="4"
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="button-secondary" type="button" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button type="submit" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Avanzar Etapa */}
      {modal?.kind === 'avanzar-etapa' && (
        <Modal title={`Avanzar lote a ${modal.siguienteEtapa}`} size="wide" onClose={() => setModal(null)}>
          <form className="catalog-form" onSubmit={guardarAvanzarEtapa}>
            <div className="modal-info">
              <p>
                <strong>Lote:</strong> {detalleLote?.codigo}
              </p>
              <p>
                <strong>Etapa actual:</strong> {detalleLote?.etapa_actual?.codigo}
              </p>
              <p>
                <strong>Cantidad actual:</strong> {detalleLote?.cantidad_actual} plantas
              </p>
              <p>
                <strong>Siguiente etapa:</strong> {modal.siguienteEtapa}
              </p>
            </div>

            <div className="catalog-form-grid">
              <div>
                <label htmlFor="fecha_inicio_etapa">Fecha de inicio *</label>
                <input
                  id="fecha_inicio_etapa"
                  name="fecha_inicio"
                  type="date"
                  value={modal.form.fecha_inicio}
                  onChange={updateModalField}
                  required
                />
              </div>

              <div>
                <label htmlFor="cantidad_etapa">Cantidad que continúa (plantas) *</label>
                <input
                  id="cantidad_etapa"
                  name="cantidad"
                  type="number"
                  min="1"
                  max={modal.cantidadActual}
                  value={modal.form.cantidad}
                  onChange={updateModalField}
                  required
                />
                {modal.form.cantidad && modal.cantidadActual && (
                  <div className="merma-info">
                    <strong>Merma en esta transición:</strong> {Math.max(0, modal.cantidadActual - parseInt(modal.form.cantidad)) || 0} plantas
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="area_id_etapa">Área *</label>
                <select
                  id="area_id_etapa"
                  name="area_id"
                  value={modal.form.area_id}
                  onChange={updateModalField}
                  required
                >
                  <option value="">Seleccionar área...</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.codigo} - {area.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="responsable_id_etapa">Responsable *</label>
                <select
                  id="responsable_id_etapa"
                  name="responsable_id"
                  value={modal.form.responsable_id}
                  onChange={updateModalField}
                  required
                >
                  <option value="">Seleccionar responsable...</option>
                  {responsables.map((resp) => (
                    <option key={resp.id} value={resp.id}>
                      {resp.nombres} {resp.apellidos} — {resp.rol.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="catalog-span-full">
                <label htmlFor="observaciones_etapa">Observaciones</label>
                <textarea
                  id="observaciones_etapa"
                  name="observaciones"
                  value={modal.form.observaciones}
                  onChange={updateModalField}
                  rows="3"
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="button-secondary" type="button" onClick={() => setModal(null)}>
                Volver
              </button>
              <button type="submit" disabled={saving}>
                {saving ? 'Guardando...' : `Avanzar a ${modal.siguienteEtapa}`}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Cancelar Lote */}
      {modal?.kind === 'cancelar' && (
        <Modal title="Cancelar lote" size="wide" onClose={() => setModal(null)}>
          <form className="catalog-form" onSubmit={guardarCancelarLote}>
            <div className="modal-alert-danger">
              <p>
              Esta acción detendrá el proceso productivo del lote. El registro permanecerá en el sistema para conservar su trazabilidad.
              </p>
            </div>

            <div className="modal-info">
              <p>
                <strong>Lote:</strong> {detalleLote?.codigo}
              </p>
              <p>
                <strong>Especie:</strong> {detalleLote?.especie?.nombre_comun}
              </p>
              <p>
                <strong>Etapa actual:</strong> {detalleLote?.etapa_actual?.codigo}
              </p>
            </div>

            <div className="catalog-form-grid">
              <div className="catalog-span-full">
                <label htmlFor="motivo">Motivo de cancelación *</label>
                <textarea
                  id="motivo"
                  name="motivo"
                  value={modal.form.motivo}
                  onChange={updateModalField}
                  rows="4"
                  placeholder="Describa la causa por la que se cancela el lote..."
                  required
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="button-secondary" type="button" onClick={() => setModal(null)}>
                Volver
              </button>
              <button type="submit" disabled={saving} className="button-danger">
                {saving ? 'Cancelando...' : 'Confirmar cancelación'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

export default ProduccionView
