function Modal({ title, children, onClose, size = 'default' }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        {children}
      </section>
    </div>
  )
}

export default Modal
