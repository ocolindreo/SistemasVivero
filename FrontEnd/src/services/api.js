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
