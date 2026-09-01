const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '')

async function parseResponseBody(response) {
  if (response.status === 204) {
    return null
  }

  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()

  if (!text) {
    return null
  }

  if (!contentType.includes('application/json')) {
    return { mensaje: text }
  }

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function login(usuario, password) {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ usuario, password }),
  })

  const data = await parseResponseBody(response)

  if (!response.ok) {
    const error = new Error(data?.mensaje || 'No fue posible iniciar sesión')
    error.status = response.status
    throw error
  }

  return data
}

export async function obtenerSesion() {
  const response = await fetch(`${API_URL}/api/auth/me`, {
    method: 'GET',
    credentials: 'include',
  })

  const data = await parseResponseBody(response)

  if (!response.ok) {
    const error = new Error(data?.mensaje || 'No fue posible verificar la sesión')
    error.status = response.status
    throw error
  }

  return data
}

async function request(url, options = {}) {
  const response = await fetch(`${API_URL}${url}`, { ...options, credentials: 'include' })
  const data = await parseResponseBody(response)
  if (!response.ok) {
    const error = new Error(data?.mensaje || 'No fue posible completar la operación')
    error.status = response.status
    throw error
  }
  return data
}

export const obtenerUsuarios = () => request('/api/usuarios')
export const obtenerUsuario = (id) => request(`/api/usuarios/${id}`)
export const obtenerRoles = () => request('/api/roles')
export const crearUsuario = (datos) => request('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
export const editarUsuario = (id, datos) => request(`/api/usuarios/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
export const inactivarUsuario = (id) => request(`/api/usuarios/${id}/inactivar`, { method: 'PATCH' })
export const reactivarUsuario = (id) => request(`/api/usuarios/${id}/reactivar`, { method: 'PATCH' })
export const cerrarSesion = () => request('/api/auth/logout', { method: 'POST' })

export const obtenerEspecies = () => request('/api/especies')
export const obtenerEspecie = (id) => request(`/api/especies/${id}`)
export const crearEspecie = (datos) => request('/api/especies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
export const editarEspecie = (id, datos) => request(`/api/especies/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
export const inactivarEspecie = (id) => request(`/api/especies/${id}/inactivar`, { method: 'PATCH' })
export const reactivarEspecie = (id) => request(`/api/especies/${id}/reactivar`, { method: 'PATCH' })

export const obtenerAreas = () => request('/api/areas')
export const obtenerArea = (id) => request(`/api/areas/${id}`)
export const crearArea = (datos) => request('/api/areas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
export const editarArea = (id, datos) => request(`/api/areas/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
export const inactivarArea = (id) => request(`/api/areas/${id}/inactivar`, { method: 'PATCH' })
export const reactivarArea = (id) => request(`/api/areas/${id}/reactivar`, { method: 'PATCH' })

export const obtenerBeneficiarios = () => request('/api/beneficiarios')
export const obtenerBeneficiario = (id) => request(`/api/beneficiarios/${id}`)
export const crearBeneficiario = (datos) => request('/api/beneficiarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
export const editarBeneficiario = (id, datos) => request(`/api/beneficiarios/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
export const inactivarBeneficiario = (id) => request(`/api/beneficiarios/${id}/inactivar`, { method: 'PATCH' })
export const reactivarBeneficiario = (id) => request(`/api/beneficiarios/${id}/reactivar`, { method: 'PATCH' })

export const obtenerEstados = () => request('/api/estados')
export const obtenerEstado = (id) => request(`/api/estados/${id}`)

export const obtenerLotes = () => request('/api/produccion/lotes')
export const obtenerLote = (id) => request(`/api/produccion/lotes/${id}`)
export const obtenerEtapasLote = (id) => request(`/api/produccion/lotes/${id}/etapas`)
export const obtenerResponsablesProduccion = () => request('/api/produccion/responsables')
export const crearLote = (datos) => request('/api/produccion/lotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
export const editarObservacionesLote = (id, datos) => request(`/api/produccion/lotes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
export const avanzarEtapaLote = (id, datos) => request(`/api/produccion/lotes/${id}/avanzar-etapa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
export const cancelarLote = (id, datos) => request(`/api/produccion/lotes/${id}/cancelar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })

export const obtenerInventario = () => request('/api/inventario')
export const obtenerInventarioDetalle = (id) => request(`/api/inventario/${id}`)
export const obtenerMovimientosInventario = (id) => request(`/api/inventario/${id}/movimientos`)
export const registrarPerdidaInventario = (id, datos) => request(`/api/inventario/${id}/perdida`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
export const registrarAjustePositivoInventario = (id, datos) => request(`/api/inventario/${id}/ajuste-positivo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
export const registrarAjusteNegativoInventario = (id, datos) => request(`/api/inventario/${id}/ajuste-negativo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })

export const obtenerSolicitudes = () => request('/api/solicitudes')
export const obtenerSolicitud = (id) => request(`/api/solicitudes/${id}`)
export const crearSolicitud = (datos) => request('/api/solicitudes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
export const aprobarSolicitud = (id) => request(`/api/solicitudes/${id}/aprobar`, { method: 'POST' })
export const rechazarSolicitud = (id, datos) => request(`/api/solicitudes/${id}/rechazar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })

export const obtenerDashboardReportes = () => request('/api/reportes/dashboard')
const obtenerReporte = (nombre, fechaDesde, fechaHasta) => {
  const parametros = fechaDesde && fechaHasta ? `?fecha_desde=${encodeURIComponent(fechaDesde)}&fecha_hasta=${encodeURIComponent(fechaHasta)}` : ''
  return request(`/api/reportes/${nombre}${parametros}`)
}
export const obtenerReporteGeneral = (fechaDesde, fechaHasta) => obtenerReporte('general', fechaDesde, fechaHasta)
export const obtenerReporteProduccion = (fechaDesde, fechaHasta) => obtenerReporte('produccion', fechaDesde, fechaHasta)
export const obtenerReporteInventario = (fechaDesde, fechaHasta) => obtenerReporte('inventario', fechaDesde, fechaHasta)
export const obtenerReporteSolicitudes = (fechaDesde, fechaHasta) => obtenerReporte('solicitudes', fechaDesde, fechaHasta)
export const obtenerReporteEntregas = (fechaDesde, fechaHasta) => obtenerReporte('entregas', fechaDesde, fechaHasta)

export const obtenerEntregas = () => request('/api/entregas')
export const obtenerEntrega = (id) => request(`/api/entregas/${id}`)
export const crearEntrega = (datos) => request('/api/entregas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
export const prepararEntrega = (id) => request(`/api/entregas/${id}/preparar`, { method: 'POST' })
export const marcarEntregaLista = (id) => request(`/api/entregas/${id}/lista`, { method: 'POST' })
export const confirmarEntrega = (id, datos) => request(`/api/entregas/${id}/confirmar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })

