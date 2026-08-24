import { useEffect, useMemo, useState } from 'react'
import DataTable from '../../components/DataTable'
import Modal from '../../components/Modal'
import StatusBadge from '../../components/StatusBadge'
import {
  obtenerInventario,
  obtenerInventarioDetalle,
  obtenerMovimientosInventario,
  registrarPerdidaInventario,
  registrarAjustePositivoInventario,
  registrarAjusteNegativoInventario,
} from '../../services/api'

const WRITE_ROLES = ['ADMIN', 'VIVERO']
const ESTADO_FILTROS = ['TODOS', 'ACTIVOS', 'SIN_EXISTENCIA']

function mapError(error, fallbackMessage) {
  if (error?.status === 403) return 'No tiene permisos para realizar esta operación.'
  return error?.message || fallbackMessage
}

function formatearFecha(fecha) {
  if (!fecha) return '—'

  const datePart = String(fecha).split('T')[0]
  const [year, month, day] = datePart.split('-')

  if (!year || !month || !day) return '—'

  return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`
}

function estadoInventario(inventario) {
  return Number(inventario?.estado) === 1 && Number(inventario?.cantidad_total) > 0 ? 'ACTIVO' : 'SIN_EXISTENCIA'
}

function EstadoInventarioBadge({ inventario }) {
  return estadoInventario(inventario) === 'ACTIVO'
    ? <StatusBadge active />
    : <span className="status-badge status-inactive">Sin existencia</span>
}

function tipoMovimientoLabel(tipo) {
  const labels = {
    INGRESO: 'Ingreso',
    PERDIDA: 'Pérdida',
    AJUSTE_POSITIVO: 'Ajuste positivo',
    AJUSTE_NEGATIVO: 'Ajuste negativo',
    RESERVA: 'Reserva',
    LIBERACION_RESERVA: 'Liberación reserva',
    SALIDA_ENTREGA: 'Salida entrega',
  }

  return labels[tipo] || tipo
}

function OperacionInventarioModal({ modal, inventario, saving, onClose, onSubmit, onFieldChange }) {
  const config = {
    perdida: {
      title: 'Registrar pérdida',
      submit: 'Registrar pérdida',
      buttonClass: 'button-danger',
      context: [
        ['Lote', inventario?.lote?.codigo],
        ['Especie', inventario?.especie?.nombre_comun],
        ['Cantidad disponible', `${inventario?.cantidad_disponible ?? 0} plantas`],
      ],
    },
    ajustePositivo: {
      title: 'Registrar ajuste positivo',
      submit: 'Registrar ajuste positivo',
      buttonClass: '',
      context: [
        ['Cantidad actual', `${inventario?.cantidad_total ?? 0} plantas`],
        ['Cantidad disponible', `${inventario?.cantidad_disponible ?? 0} plantas`],
      ],
    },
    ajusteNegativo: {
      title: 'Registrar ajuste negativo',
      submit: 'Registrar ajuste negativo',
      buttonClass: 'button-danger',
      context: [
        ['Cantidad total', `${inventario?.cantidad_total ?? 0} plantas`],
        ['Cantidad reservada', `${inventario?.cantidad_reservada ?? 0} plantas`],
        ['Cantidad disponible', `${inventario?.cantidad_disponible ?? 0} plantas`],
      ],
    },
  }[modal.kind]

  return (
    <Modal title={config.title} size="wide" onClose={onClose}>
      <form className="catalog-form" onSubmit={onSubmit}>
        <div className="modal-info">
          {config.context.map(([label, value]) => (
            <p key={label}><strong>{label}:</strong> {value}</p>
          ))}
        </div>

        <div className="catalog-form-grid">
          <div>
            <label htmlFor="cantidad_movimiento">Cantidad *</label>
            <input
              id="cantidad_movimiento"
              name="cantidad"
              type="number"
              min="1"
              value={modal.form.cantidad}
              onChange={onFieldChange}
              required
            />
          </div>

          <div>
            <label htmlFor="motivo_movimiento">Motivo *</label>
            <input
              id="motivo_movimiento"
              name="motivo"
              value={modal.form.motivo}
              onChange={onFieldChange}
              required
            />
          </div>

          <div className="catalog-span-full">
            <label htmlFor="observaciones_movimiento">Observaciones</label>
            <textarea
              id="observaciones_movimiento"
              name="observaciones"
              rows="3"
              value={modal.form.observaciones}
              onChange={onFieldChange}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button className="button-secondary" type="button" onClick={onClose}>Volver</button>
          <button className={config.buttonClass} type="submit" disabled={saving}>{saving ? 'Guardando...' : config.submit}</button>
        </div>
      </form>
    </Modal>
  )
}

function InventarioView({ currentUser, onToast, onSessionInvalid }) {
  const [inventario, setInventario] = useState([])
  const [detalle, setDetalle] = useState(null)
  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('TODOS')
  const [detalleTab, setDetalleTab] = useState('informacion')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)

  const canWrite = WRITE_ROLES.includes(currentUser?.rol?.codigo)

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

  async function cargarInventario() {
    setLoading(true)
    setError('')

    try {
      const response = await guardedCall(() => obtenerInventario(), 'No fue posible cargar el inventario.')
      if (response) setInventario(response.inventario || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function cargarDetalle(id) {
    setLoadingDetalle(true)

    try {
      const [detalleResponse, movimientosResponse] = await Promise.all([
        guardedCall(() => obtenerInventarioDetalle(id), 'No fue posible cargar el inventario.'),
        guardedCall(() => obtenerMovimientosInventario(id), 'No fue posible cargar los movimientos.'),
      ])

      if (detalleResponse) setDetalle(detalleResponse.inventario)
      if (movimientosResponse) setMovimientos(movimientosResponse.movimientos || [])
    } catch (err) {
      onToast(err.message, 'error')
    } finally {
      setLoadingDetalle(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarInventario()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function abrirDetalle(item) {
    setDetalleTab('informacion')
    setDetalle(item)
    setMovimientos([])
    cargarDetalle(item.id)
  }

  function cerrarDetalle() {
    setDetalle(null)
    setMovimientos([])
    setDetalleTab('informacion')
  }

  const filteredInventario = useMemo(() => {
    const term = search.toLowerCase()

    return inventario.filter((item) => {
      const estado = estadoInventario(item)
      const estadoOk = estadoFiltro === 'TODOS' || estadoFiltro === estado
      const searchOk = !term || [
        item.lote?.codigo,
        item.especie?.codigo,
        item.especie?.nombre_comun,
        item.area?.codigo,
        item.area?.nombre,
        estado === 'ACTIVO' ? 'Activo' : 'Sin existencia',
      ].filter(Boolean).join(' ').toLowerCase().includes(term)

      return estadoOk && searchOk
    })
  }, [inventario, search, estadoFiltro])

  const inventarioColumns = [
    { key: 'lote.codigo', label: 'Lote', sortable: true },
    { key: 'especie.nombre_comun', label: 'Especie', sortable: true },
    { key: 'area.nombre', label: 'Área', sortable: true },
    { key: 'cantidad_total', label: 'Cantidad total', sortable: true },
    { key: 'cantidad_reservada', label: 'Cantidad reservada', sortable: true },
    { key: 'cantidad_disponible', label: 'Cantidad disponible', sortable: true },
    { key: 'fecha_disponibilidad', label: 'Fecha disponibilidad', sortable: true, render: (item) => formatearFecha(item.fecha_disponibilidad) },
    { key: 'estado', label: 'Estado', sortable: true, sortValue: (item) => estadoInventario(item), render: (item) => <EstadoInventarioBadge inventario={item} /> },
    { key: 'acciones', label: 'Acciones', sortable: false, render: (item) => <button type="button" onClick={() => abrirDetalle(item)}>Ver</button> },
  ]

  const movimientosColumns = [
    { key: 'tipo', label: 'Tipo', sortable: true, render: (item) => tipoMovimientoLabel(item.tipo) },
    { key: 'cantidad', label: 'Cantidad', sortable: true },
    { key: 'fecha', label: 'Fecha', sortable: true, render: (item) => formatearFecha(item.fecha) },
    { key: 'motivo', label: 'Motivo', sortable: true, render: (item) => item.motivo || '—' },
    { key: 'referencia', label: 'Referencia', sortable: true, render: (item) => item.referencia ? `${item.referencia} ${item.id_referencia || ''}` : '—' },
    { key: 'usuario', label: 'Usuario', sortable: true, sortValue: (item) => `${item.usuario?.nombres || ''} ${item.usuario?.apellidos || ''}`, render: (item) => `${item.usuario?.nombres || ''} ${item.usuario?.apellidos || ''}`.trim() || item.usuario?.username || '—' },
    { key: 'estado', label: 'Estado', sortable: true, render: (item) => <StatusBadge active={Number(item.estado) === 1} /> },
  ]

  function abrirModal(kind) {
    setModal({ kind, form: { cantidad: '', motivo: '', observaciones: '' } })
  }

  function updateModalField(event) {
    const { name, value } = event.target
    setModal((prev) => ({ ...prev, form: { ...prev.form, [name]: value } }))
  }

  async function guardarMovimiento(event) {
    event.preventDefault()
    if (!modal || !detalle) return

    const cantidad = Number(modal.form.cantidad)
    const motivo = modal.form.motivo.trim()
    const disponible = Number(detalle.cantidad_disponible)

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      onToast('La cantidad debe ser un entero positivo.', 'error')
      return
    }

    if (!motivo) {
      onToast('El motivo es obligatorio.', 'error')
      return
    }

    if ((modal.kind === 'perdida' || modal.kind === 'ajusteNegativo') && cantidad > disponible) {
      onToast('La cantidad no puede superar la cantidad disponible.', 'error')
      return
    }

    const payload = {
      cantidad,
      motivo,
      observaciones: modal.form.observaciones.trim() || null,
    }

    const handlers = {
      perdida: {
        call: registrarPerdidaInventario,
        success: 'Pérdida registrada correctamente.',
      },
      ajustePositivo: {
        call: registrarAjustePositivoInventario,
        success: 'Ajuste positivo registrado correctamente.',
      },
      ajusteNegativo: {
        call: registrarAjusteNegativoInventario,
        success: 'Ajuste negativo registrado correctamente.',
      },
    }

    const handler = handlers[modal.kind]
    if (!handler) return

    setSaving(true)

    try {
      await guardedCall(() => handler.call(detalle.id, payload), 'No fue posible registrar el movimiento.')
      setModal(null)
      await Promise.all([cargarInventario(), cargarDetalle(detalle.id)])
      onToast(handler.success, 'success')
    } catch (err) {
      onToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const sinExistencia = detalle ? estadoInventario(detalle) === 'SIN_EXISTENCIA' : false
  const sinDisponible = detalle ? Number(detalle.cantidad_disponible) <= 0 : true

  return (
    <section className={`inventario-view ${!detalle ? 'inventario-view-listado' : ''}`} aria-labelledby="inventario-title">
      {!detalle ? (
        <>
          <header className="inventario-header">
            <div>
              <span className="page-kicker">Inventario</span>
              <h1 id="inventario-title">Inventario</h1>
              <p>Control y trazabilidad de existencias disponibles</p>
            </div>
          </header>

          <div className="data-card inventario-table-card" role="region" aria-live="polite">
            <div className="inventario-toolbar">
              <input
                className="user-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar..."
                aria-label="Buscar inventario por lote, especie, área o estado"
              />

              <select
                className="catalog-filter"
                value={estadoFiltro}
                onChange={(event) => setEstadoFiltro(event.target.value)}
                aria-label="Filtrar por estado de inventario"
              >
                {ESTADO_FILTROS.map((estado) => (
                  <option key={estado} value={estado}>{estado === 'TODOS' ? 'Todos' : estado === 'ACTIVOS' ? 'Activos' : 'Sin existencia'}</option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className="empty-state">Cargando inventario...</div>
            ) : error ? (
              <div className="empty-state error-state">{error}</div>
            ) : (
              <DataTable columns={inventarioColumns} data={filteredInventario} getRowKey={(item) => item.id} emptyMessage="No hay existencias disponibles registradas." />
            )}
          </div>
        </>
      ) : (
        <>
          <header className="catalogos-header detalle-page-header">
            <div>
              <button type="button" className="link-back" onClick={cerrarDetalle} aria-label="Volver al listado de inventario">← Volver</button>
              <h1 id="inventario-title">{detalle.lote?.codigo}</h1>
              <p>{detalle.especie?.nombre_comun}</p>
            </div>
            <EstadoInventarioBadge inventario={detalle} />
          </header>

          <div className="detalle-container">
            <div className="catalog-tabs detalle-tabs" role="tablist" aria-label="Detalle del inventario">
              <button type="button" className={`catalog-tab ${detalleTab === 'informacion' ? 'catalog-tab-active' : ''}`} onClick={() => setDetalleTab('informacion')}>Información</button>
              <button type="button" className={`catalog-tab ${detalleTab === 'movimientos' ? 'catalog-tab-active' : ''}`} onClick={() => setDetalleTab('movimientos')}>Movimientos</button>
            </div>

            {loadingDetalle ? <div className="empty-state">Cargando detalle...</div> : null}

            {detalleTab === 'informacion' && (
              <div className="detalle-card">
                <div className="detalle-header">
                  <h2>Información de inventario</h2>
                </div>

                <div className="info-grid">
                  <div className="info-card"><div className="info-card-title">Cantidad total</div><div className="info-card-value">{detalle.cantidad_total}</div></div>
                  <div className="info-card"><div className="info-card-title">Cantidad reservada</div><div className="info-card-value">{detalle.cantidad_reservada}</div></div>
                  <div className="info-card"><div className="info-card-title">Cantidad disponible</div><div className="info-card-value">{detalle.cantidad_disponible}</div></div>
                </div>

                <div className="detalle-section">
                  <h3>Datos generales</h3>
                  <div className="etapa-details">
                    <div><strong>Lote:</strong> {detalle.lote?.codigo}</div>
                    <div><strong>Especie:</strong> {detalle.especie?.codigo} - {detalle.especie?.nombre_comun}</div>
                    <div><strong>Área:</strong> {detalle.area?.codigo} - {detalle.area?.nombre}</div>
                    <div><strong>Fecha disponibilidad:</strong> {formatearFecha(detalle.fecha_disponibilidad)}</div>
                    <div><strong>Estado:</strong> {estadoInventario(detalle) === 'ACTIVO' ? 'Activo' : 'Sin existencia'}</div>
                  </div>
                </div>

                {canWrite && (
                  <div className="detalle-actions inventario-actions">
                    {!sinExistencia && !sinDisponible && <button type="button" className="button-danger" onClick={() => abrirModal('perdida')}>Registrar pérdida</button>}
                    <button type="button" onClick={() => abrirModal('ajustePositivo')}>Ajuste positivo</button>
                    {!sinExistencia && !sinDisponible && <button type="button" className="button-danger" onClick={() => abrirModal('ajusteNegativo')}>Ajuste negativo</button>}
                  </div>
                )}
              </div>
            )}

            {detalleTab === 'movimientos' && (
              <div className="detalle-card">
                <h2>Movimientos</h2>
                <DataTable columns={movimientosColumns} data={movimientos} getRowKey={(item) => item.id} emptyMessage="No hay movimientos registrados." />
              </div>
            )}
          </div>
        </>
      )}

      {modal && detalle && (
        <OperacionInventarioModal
          modal={modal}
          inventario={detalle}
          saving={saving}
          onClose={() => setModal(null)}
          onSubmit={guardarMovimiento}
          onFieldChange={updateModalField}
        />
      )}
    </section>
  )
}

export default InventarioView
