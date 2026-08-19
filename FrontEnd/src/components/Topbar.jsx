function Topbar({ usuario, onMenuToggle, context = 'Inicio' }) {
  return (
    <header className="topbar">
      <button className="menu-toggle" type="button" aria-label="Mostrar menú" onClick={onMenuToggle}>
        <span aria-hidden="true">☰</span>
      </button>
      <div className="topbar-context">
        <span className="topbar-kicker">Área de trabajo</span>
        <strong>{context}</strong>
      </div>
      <div className="topbar-user">
        <div className="user-avatar" aria-hidden="true">
          {usuario.nombres?.charAt(0)}{usuario.apellidos?.charAt(0)}
        </div>
        <div className="user-summary">
          <strong>{usuario.nombres} {usuario.apellidos}</strong>
          <span>{usuario.rol.nombre}</span>
        </div>
      </div>
    </header>
  )
}

export default Topbar
