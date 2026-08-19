function ConfirmDialog({ dialog, onCancel, onConfirm }) {
  if (!dialog) return null

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <p className="card-kicker">Confirmación</p>
        <h2 id="confirm-title">{dialog.title}</h2>
        <p id="confirm-message">{dialog.message}</p>
        <div className="modal-actions">
          <button className="button-secondary" type="button" onClick={onCancel}>Cancelar</button>
          <button className={dialog.danger ? 'button-danger' : ''} type="button" onClick={onConfirm} disabled={dialog.loading}>{dialog.loading ? 'Procesando...' : dialog.confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}

export default ConfirmDialog
