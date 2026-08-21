import { useEffect, useState } from 'react'
import { cerrarSesion, login, obtenerSesion } from './services/api'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import UsuariosView from './features/usuarios/UsuariosView'
import CatalogosView from './features/catalogos/CatalogosView'
import Toast from './components/Toast'
import ConfirmDialog from './components/ConfirmDialog'
import './App.css'

function App() {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [authenticatedUser, setAuthenticatedUser] = useState(null)
  const [verificandoSesion, setVerificandoSesion] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [vistaActual, setVistaActual] = useState('inicio')
  const [toast, setToast] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)

  function showToast(message, type = 'info') {
    setToast({ message, type })
  }

  useEffect(() => {
    let cancelled = false

    async function verificarSesion() {
      try {
        const data = await obtenerSesion()

        if (!cancelled) {
          setAuthenticatedUser(data.usuario)
        }
      } catch (error) {
        if (!cancelled && error.status >= 500) {
          setMessage('No fue posible verificar la sesión.')
        }
      } finally {
        if (!cancelled) {
          setVerificandoSesion(false)
        }
      }
    }

    verificarSesion()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!authenticatedUser) return undefined

    const inactivityLimit = 30 * 60 * 1000
    let timeoutId
    let active = true
    const activityEvents = ['click', 'keydown', 'pointerdown', 'touchstart']

    const expireByInactivity = async () => {
      try { await cerrarSesion() } catch { /* La sesión local se limpia igualmente. */ }
      if (active) {
        setAuthenticatedUser(null)
        setVistaActual('inicio')
        showToast('La sesión se cerró por inactividad.', 'warning')
      }
    }

    const resetTimeout = () => {
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(expireByInactivity, inactivityLimit)
    }

    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetTimeout))
    resetTimeout()

    return () => {
      active = false
      window.clearTimeout(timeoutId)
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetTimeout))
    }
  }, [authenticatedUser])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!usuario.trim() || !password) {
      setMessage('Usuario y contraseña son obligatorios.')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const data = await login(usuario.trim(), password)
      setAuthenticatedUser(data.usuario)
      setPassword('')
      setMessage('Sesión iniciada correctamente')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  if (verificandoSesion) {
    return (
      <main className="session-checking" aria-live="polite">
        <div className="session-spinner" aria-hidden="true" />
        <p>Verificando sesión...</p>
      </main>
    )
  }

  if (authenticatedUser) {
    const requestLogout = () => setConfirmDialog({ type: 'logout', title: 'Cerrar sesión', message: '¿Desea cerrar la sesión actual?', confirmLabel: 'Cerrar sesión', danger: true })
    const confirmLogout = async () => {
      setConfirmDialog((current) => ({ ...current, loading: true }))
      try {
        await cerrarSesion()
        setAuthenticatedUser(null)
        setVistaActual('inicio')
        setConfirmDialog(null)
        showToast('Sesión cerrada correctamente.', 'success')
      } catch (error) {
        setConfirmDialog(null)
        showToast(error.message, 'error')
      }
    }
    const handleSessionInvalid = () => {
      setAuthenticatedUser(null)
      setVistaActual('inicio')
      showToast('La sesión ha expirado. Inicie sesión nuevamente.', 'warning')
    }

    return (
      <div className="authenticated-shell">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeView={vistaActual} onNavigate={setVistaActual} onLogout={requestLogout} />
        <div className="authenticated-main">
          <Topbar usuario={authenticatedUser} onMenuToggle={() => setSidebarOpen(true)} context={vistaActual === 'usuarios' ? 'Seguridad y Usuarios' : vistaActual === 'catalogos' ? 'Catálogos' : 'Inicio'} />
          {vistaActual === 'usuarios' ? <UsuariosView currentUser={authenticatedUser} onToast={showToast} onSessionInvalid={handleSessionInvalid} /> : vistaActual === 'catalogos' ? <CatalogosView currentUser={authenticatedUser} onToast={showToast} onSessionInvalid={handleSessionInvalid} /> : <main className="workspace" aria-labelledby="workspace-title">
            <div className="page-heading">
              <span className="page-kicker">Inicio</span>
              <h1 id="workspace-title">Bienvenido, {authenticatedUser.nombres}</h1>
              <p>Seleccione una opción del menú para comenzar.</p>
            </div>
            <section className="welcome-card" aria-label="Resumen de sesión">
              <div className="welcome-card-mark" aria-hidden="true">SV</div>
              <div>
                <p className="card-kicker">Sesión activa</p>
                <h2>Panel de trabajo preparado</h2>
                <p>Su acceso como {authenticatedUser.rol.nombre} está listo para continuar con la gestión del vivero.</p>
              </div>
            </section>
          </main>}
        </div>
        <Toast toast={toast} onClose={() => setToast(null)} />
        <ConfirmDialog dialog={confirmDialog} onCancel={() => setConfirmDialog(null)} onConfirm={confirmDialog?.type === 'logout' ? confirmLogout : undefined} />
      </div>
    )
  }

  return (
    <>
      <main className="login-shell">
        <section className="login-panel" aria-labelledby="login-title">
          <div className="brand-mark" aria-hidden="true">SV</div>
          <p className="eyebrow">Sistema Vivero Municipal</p>
          <h1 id="login-title">Bienvenido</h1>
          <p className="intro">Ingrese sus credenciales para continuar.</p>

          <form onSubmit={handleSubmit}>
            <label htmlFor="usuario">Usuario o correo</label>
            <input id="usuario" name="usuario" type="text" autoComplete="username" placeholder="admin o correo@ejemplo.com" value={usuario} onChange={(event) => setUsuario(event.target.value)} disabled={loading} />
            <label htmlFor="password">Contraseña</label>
            <input id="password" name="password" type="password" autoComplete="current-password" placeholder="Escribe tu contraseña" value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading} />
            <p className="form-message" role="status" aria-live="polite">{message}</p>
            <button type="submit" disabled={loading}>{loading ? 'Ingresando...' : 'Iniciar sesión'}</button>
          </form>
        </section>

        <aside className="login-aside" aria-label="Información del sistema">
          <div className="plant-symbol" aria-hidden="true">+</div>
          <p className="aside-kicker">VIVERO MUNICIPAL</p>
          <p>Sistema de Gestión de Producción y Distribución de Plantas</p>
          <div className="aside-rule" />
          <span>Gestión institucional</span>
        </aside>
      </main>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  )
}

export default App
