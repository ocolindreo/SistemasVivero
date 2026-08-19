import { useEffect } from 'react'

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined
    const timeoutId = window.setTimeout(onClose, 4000)
    return () => window.clearTimeout(timeoutId)
  }, [toast, onClose])

  if (!toast) return null

  return (
    <div className={`toast toast-${toast.type}`} role="status" aria-live="polite">
      <span>{toast.message}</span>
      <button type="button" onClick={onClose} aria-label="Cerrar notificación">×</button>
    </div>
  )
}

export default Toast
