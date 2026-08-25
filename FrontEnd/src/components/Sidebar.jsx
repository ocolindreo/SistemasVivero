const navigationItems = [
  { label: 'Inicio', view: 'inicio', available: true },
  { label: 'Seguridad y Usuarios', view: 'usuarios', available: true },
  { label: 'Catálogos', view: 'catalogos', available: true },
  { label: 'Producción', view: 'produccion', available: true },
  { label: 'Inventario', view: 'inventario', available: true },
  { label: 'Solicitudes', view: 'solicitudes', available: true },
  { label: 'Reservas', available: false },
  { label: 'Entregas', available: false },
  { label: 'Reportes', available: false },
]

function Sidebar({ open, onClose, activeView, onNavigate, onLogout }) {
  return (
    <>
      <button className={`sidebar-scrim ${open ? 'sidebar-scrim-open' : ''}`} type="button" aria-label="Cerrar menú" onClick={onClose} />
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`} aria-label="Navegación principal">
        <div className="sidebar-brand">
          <div className="sidebar-mark" aria-hidden="true">SV</div>
          <div>
            <strong>VIVERO</strong>
            <span>MUNICIPAL</span>
          </div>
        </div>

        <nav>
          <p className="sidebar-label">Módulos</p>
          {navigationItems.map((item) => (
            <button
              className={`nav-item ${item.available ? '' : 'nav-item-disabled'} ${item.view === activeView ? 'nav-item-active' : ''}`}
              disabled={!item.available}
              key={item.label}
              type="button"
              onClick={() => { onNavigate(item.view); onClose() }}
            >
              <span className="nav-glyph" aria-hidden="true">{item.label === 'Inicio' ? '•' : '—'}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <button className="nav-item sidebar-logout" type="button" onClick={onLogout}>
          <span className="nav-glyph" aria-hidden="true">×</span>
          Cerrar sesión
        </button>
      </aside>
    </>
  )
}

export default Sidebar
