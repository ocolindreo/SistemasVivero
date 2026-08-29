function formatearFecha(fecha) {
  if (!fecha) return '—'
  const [year, month, day] = String(fecha).split('T')[0].split('-')
  return year && month && day ? `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}` : '—'
}

function nombreUsuario(usuario) {
  return `${usuario?.nombres || ''} ${usuario?.apellidos || ''}`.trim() || usuario?.username || '—'
}

function DatoBeneficiario({ label, value }) {
  if (!value) return null
  return <p><strong>{label}:</strong> {value}</p>
}

function formatearFechaHora(fecha) {
  if (!fecha) return '—'
  const day = String(fecha.getDate()).padStart(2, '0')
  const month = String(fecha.getMonth() + 1).padStart(2, '0')
  const year = fecha.getFullYear()
  const hours = String(fecha.getHours()).padStart(2, '0')
  const minutes = String(fecha.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

function ConstanciaEntrega({ entrega, impresion }) {
  const esEntregaConfirmada = ['ENTREGA_PARCIAL', 'ENTREGADA'].includes(entrega?.estado?.codigo)
  const detalles = entrega?.detalles || []
  const totalEntregado = detalles.reduce((total, detalle) => total + Number(detalle.cantidad_entregada || 0), 0)

  if (!esEntregaConfirmada || detalles.length === 0) return null

  return (
    <article className="constancia-entrega" aria-label="Constancia de entrega de plantas">
      <header className="constancia-header">
        <p>Vivero Municipal</p>
        <h1>Constancia de Entrega de Plantas</h1>
      </header>

      <div className="constancia-reference">
        <p><strong>Solicitud:</strong> {entrega.solicitud?.codigo}</p>
        <p><strong>Entrega:</strong> {entrega.codigo}</p>
        <p><strong>Fecha de entrega:</strong> {formatearFecha(entrega.fecha_entrega)}</p>
        <p><strong>Tipo:</strong> {entrega.estado?.codigo === 'ENTREGA_PARCIAL' ? 'Entrega parcial' : 'Entrega final'}</p>
      </div>

      <section>
        <h2>Beneficiario</h2>
        <DatoBeneficiario label="Nombre" value={entrega.beneficiario?.nombre} />
        <DatoBeneficiario label="Tipo" value={entrega.beneficiario?.tipo} />
        <DatoBeneficiario label="DPI" value={entrega.beneficiario?.dpi} />
        <DatoBeneficiario label="NIT" value={entrega.beneficiario?.nit} />
        <DatoBeneficiario label="Teléfono" value={entrega.beneficiario?.telefono} />
        <DatoBeneficiario label="Dirección" value={entrega.beneficiario?.direccion} />
      </section>

      <section>
        <h2>Datos de recepción</h2>
        <DatoBeneficiario label="Recibido por" value={entrega.receptor?.nombre} />
        <DatoBeneficiario label="DPI" value={entrega.receptor?.dpi} />
        <DatoBeneficiario label="Lugar de entrega" value={entrega.lugar_entrega} />
        <DatoBeneficiario label="Observaciones" value={entrega.observaciones} />
        <p><strong>Responsable del vivero:</strong> {nombreUsuario(entrega.responsable)}</p>
      </section>

      <section className="constancia-detalle">
        <h2>Detalle de plantas</h2>
        <table>
          <thead>
            <tr>
              <th>Especie</th>
              <th>Lote</th>
              <th>Cantidad entregada</th>
            </tr>
          </thead>
          <tbody>
            {detalles.map((detalle) => (
              <tr key={detalle.id}>
                <td>{detalle.especie?.nombre_comun || detalle.especie?.codigo}</td>
                <td>{detalle.lote?.codigo || '—'}</td>
                <td>{detalle.cantidad_entregada}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan="2">Total entregado</th>
              <th>{totalEntregado}</th>
            </tr>
          </tfoot>
        </table>
      </section>

      <footer className="constancia-firmas">
        <div>
          <div className="constancia-firma-linea" />
          <strong>Firma receptor</strong>
          <span>Nombre: ______________________________</span>
        </div>
        <div>
          <div className="constancia-firma-linea" />
          <strong>Firma responsable del vivero</strong>
          <span>Nombre: ______________________________</span>
        </div>
      </footer>

      {impresion && (
        <div className="constancia-trazabilidad">
          <span>Constancia impresa el: {formatearFechaHora(impresion.fecha)}</span>
          <span>Impreso por: {impresion.username}</span>
        </div>
      )}
    </article>
  )
}

export default ConstanciaEntrega
