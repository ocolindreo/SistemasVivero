import { useEffect, useState } from 'react'
import { cerrarSesion, login, obtenerSesion } from './services/api'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import UsuariosView from './features/usuarios/UsuariosView'
import AdministracionView from './features/administracion/AdministracionView'
import CatalogosView from './features/catalogos/CatalogosView'
import ProduccionView from './features/produccion/ProduccionView'
import InventarioView from './features/inventario/InventarioView'
import SolicitudesView from './features/solicitudes/SolicitudesView'
import EntregasView from './features/entregas/EntregasView'
import ReportesView from './features/reportes/ReportesView'
import Toast from './components/Toast'
import ConfirmDialog from './components/ConfirmDialog'
import iconoHoja from './assets/images/icono-hoja.png'
import './App.css'

function App() {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
        setMessage('')
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
      setMessage('')
      showToast('La sesión ha expirado. Inicie sesión nuevamente.', 'warning')
    }
    const canViewReportes = ['ADMIN', 'VIVERO'].includes(authenticatedUser.rol?.codigo)
    const canViewAdministracion = authenticatedUser.rol?.codigo === 'ADMIN'

    return (
      <div className="authenticated-shell">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeView={vistaActual} currentUser={authenticatedUser} onNavigate={setVistaActual} onLogout={requestLogout} />
        <div className="authenticated-main">
          <Topbar usuario={authenticatedUser} onMenuToggle={() => setSidebarOpen(true)} context={vistaActual === 'usuarios' ? 'Seguridad y Usuarios' : vistaActual === 'administracion' ? 'Administración' : vistaActual === 'catalogos' ? 'Catálogos' : vistaActual === 'produccion' ? 'Producción' : vistaActual === 'inventario' ? 'Inventario' : vistaActual === 'solicitudes' ? 'Solicitudes' : vistaActual === 'entregas' ? 'Distribución / Entregas' : vistaActual === 'reportes' ? 'Reportes' : 'Inicio'} />
          {vistaActual === 'usuarios' ? <UsuariosView currentUser={authenticatedUser} onToast={showToast} onSessionInvalid={handleSessionInvalid} /> : vistaActual === 'administracion' && canViewAdministracion ? <AdministracionView currentUser={authenticatedUser} onToast={showToast} onSessionInvalid={handleSessionInvalid} /> : vistaActual === 'catalogos' ? <CatalogosView currentUser={authenticatedUser} onToast={showToast} onSessionInvalid={handleSessionInvalid} /> : vistaActual === 'produccion' ? <ProduccionView currentUser={authenticatedUser} onToast={showToast} onSessionInvalid={handleSessionInvalid} /> : vistaActual === 'inventario' ? <InventarioView currentUser={authenticatedUser} onToast={showToast} onSessionInvalid={handleSessionInvalid} /> : vistaActual === 'solicitudes' ? <SolicitudesView currentUser={authenticatedUser} onToast={showToast} onSessionInvalid={handleSessionInvalid} /> : vistaActual === 'entregas' ? <EntregasView currentUser={authenticatedUser} onToast={showToast} onSessionInvalid={handleSessionInvalid} /> : vistaActual === 'reportes' && canViewReportes ? <ReportesView currentUser={authenticatedUser} onSessionInvalid={handleSessionInvalid} /> : <main className="workspace" aria-labelledby="workspace-title">
            <div className="page-heading">
              <span className="page-kicker">Inicio</span>
              <h1 id="workspace-title">Bienvenido, {authenticatedUser.nombres}</h1>
              <p>Seleccione una opción del menú para comenzar.</p>
            </div>
            <section className="welcome-card" aria-label="Resumen de sesión">
              <div className="welcome-card-mark"><img src={iconoHoja} alt="" /></div>
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
        <aside className="login-aside" aria-label="Información del sistema">
          <div className="login-aside-content">
            <div className="brand-mark"><img src="/src/assets/images/icono-hoja.png" alt="" /></div>
            <p className="aside-kicker">VIVERO MUNICIPAL</p>
            <p>Sistema de Gestión de Producción y Distribución de Plantas.</p>
          </div>
        </aside>

        <section className="login-panel" aria-labelledby="login-title">
          <p className="eyebrow">Sistema Vivero Municipal</p>
          <h1 id="login-title">Bienvenido</h1>
          <p className="intro">Ingrese sus credenciales para continuar.</p>

          <form onSubmit={handleSubmit}>
            <label htmlFor="usuario">Usuario o correo</label>
            <input id="usuario" name="usuario" type="text" autoComplete="username" placeholder="admin o correo@ejemplo.com" value={usuario} onChange={(event) => setUsuario(event.target.value)} disabled={loading} />
            <label htmlFor="password">Contraseña</label>
            <div className="password-field"><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Escribe tu contraseña" value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading} /><button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)} disabled={loading} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.1A10.7 10.7 0 0 1 12 5c5.5 0 9.2 4.5 10 7-0.3 0.9-1 2.2-2.1 3.4M6.2 6.2C4 7.7 2.6 10.1 2 12c0.8 2.5 4.5 7 10 7 1.3 0 2.5-0.2 3.5-0.7" /><circle cx="12" cy="12" r="3" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>}</button></div>
            <a className="forgot-password" href="#recuperar-contrasena">¿Olvidaste tu contraseña?</a>
            <p className="form-message" role="status" aria-live="polite">{message}</p>
            <button type="submit" disabled={loading}>{loading ? 'Ingresando...' : 'Iniciar sesión'}</button>
          </form>
          <p className="login-footer">© 2026 Vivero Municipal. Todos los derechos reservados.</p>
        </section>
      </main>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  )
}

export default App
