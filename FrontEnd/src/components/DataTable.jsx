import { useMemo, useState } from 'react'

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100]

function getValue(row, key) {
  if (typeof key !== 'string') return undefined
  return key.split('.').reduce((value, part) => value?.[part], row)
}

function normalizeSortValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0

  const text = String(value).trim()
  if (!text) return ''

  const numericValue = Number(text)
  if (!Number.isNaN(numericValue) && text !== '') return numericValue

  const dateValue = Date.parse(text)
  if (!Number.isNaN(dateValue) && /\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4}/.test(text)) return dateValue

  return text.toLowerCase()
}

function compareValues(leftValue, rightValue) {
  const left = normalizeSortValue(leftValue)
  const right = normalizeSortValue(rightValue)

  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right), 'es', { numeric: true, sensitivity: 'base' })
}

function DataTable({ columns, data, getRowKey, emptyMessage = 'No hay registros.', initialPageSize = 10 }) {
  const [sortConfig, setSortConfig] = useState(null)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [currentPage, setCurrentPage] = useState(1)

  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data])

  const sortedRows = useMemo(() => {
    if (!sortConfig) return rows

    const column = columns.find((item) => item.key === sortConfig.key)
    if (!column) return rows

    return [...rows].sort((leftRow, rightRow) => {
      const leftValue = column.sortValue ? column.sortValue(leftRow) : getValue(leftRow, column.key)
      const rightValue = column.sortValue ? column.sortValue(rightRow) : getValue(rightRow, column.key)
      const result = compareValues(leftValue, rightValue)
      return sortConfig.direction === 'asc' ? result : -result
    })
  }, [columns, rows, sortConfig])

  const totalRows = sortedRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const effectivePage = Math.min(currentPage, totalPages)
  const startIndex = totalRows === 0 ? 0 : (effectivePage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalRows)
  const pageRows = sortedRows.slice(startIndex, endIndex)

  function toggleSort(column) {
    if (column.sortable === false) return
    setCurrentPage(1)
    setSortConfig((current) => {
      if (!current || current.key !== column.key) return { key: column.key, direction: 'asc' }
      return { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    })
  }

  function changePageSize(event) {
    setPageSize(Number(event.target.value))
    setCurrentPage(1)
  }

  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1)

  if (totalRows === 0) {
    return <div className="empty-state">{emptyMessage}</div>
  }

  return (
    <div className="data-table">
      <div className="table-wrap data-table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => {
                const sortable = column.sortable !== false
                const activeSort = sortConfig?.key === column.key
                const indicator = activeSort ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''

                return (
                  <th key={column.key}>
                    {sortable ? (
                      <button className="data-table-sort" type="button" onClick={() => toggleSort(column)}>
                        {column.label}{indicator}
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, index) => (
              <tr key={getRowKey ? getRowKey(row) : row.id ?? `${startIndex + index}`}>
                {columns.map((column) => (
                  <td key={column.key} className={column.className || undefined}>
                    {column.render ? column.render(row) : getValue(row, column.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="data-table-footer">
        <label className="data-table-size">
          Mostrar
          <select value={pageSize} onChange={changePageSize}>
            {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          registros
        </label>

        <div className="data-table-summary">
          Mostrando {startIndex + 1}-{endIndex} de {totalRows} registros
        </div>

        <div className="data-table-pagination" aria-label="Paginacion de tabla">
          <button type="button" className="button-secondary" disabled={effectivePage === 1} onClick={() => setCurrentPage(effectivePage - 1)}>Anterior</button>
          {pageNumbers.map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              className={`data-table-page ${effectivePage === pageNumber ? 'data-table-page-active' : ''}`}
              onClick={() => setCurrentPage(pageNumber)}
              aria-current={effectivePage === pageNumber ? 'page' : undefined}
            >
              {pageNumber}
            </button>
          ))}
          <button type="button" className="button-secondary" disabled={effectivePage === totalPages} onClick={() => setCurrentPage(effectivePage + 1)}>Siguiente</button>
        </div>
      </div>
    </div>
  )
}

export default DataTable
