function StatusBadge({ active }) {
  return <span className={`status-badge ${active ? 'status-active' : 'status-inactive'}`}>{active ? 'Activo' : 'Inactivo'}</span>
}

export default StatusBadge
