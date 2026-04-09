import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { api } from '@/api'

const columnHelper = createColumnHelper()

function AmountCell({ value }) {
  const num = parseFloat(value)
  const color = num < 0 ? 'text-red-400' : 'text-green-400'
  return (
    <span className={`font-mono tabular-nums ${color}`}>
      {num < 0 ? '−' : '+'}€{Math.abs(num).toFixed(2)}
    </span>
  )
}

const COLUMNS = [
  columnHelper.accessor('date', {
    header: 'Datum',
    size: 110,
    cell: (i) => <span className="tabular-nums text-xs">{i.getValue()}</span>,
  }),
  columnHelper.accessor('amount', {
    header: 'Bedrag',
    size: 110,
    cell: (i) => <AmountCell value={i.getValue()} />,
  }),
  columnHelper.accessor('counterparty_name', {
    header: 'Naam tegenpartij',
    size: 200,
  }),
  columnHelper.accessor('counterparty_iban', {
    header: 'IBAN',
    size: 170,
    cell: (i) => <span className="font-mono text-xs">{i.getValue() || ''}</span>,
  }),
  columnHelper.accessor('description', {
    header: 'Omschrijving',
    size: 300,
    cell: (i) => (
      <span className="truncate block max-w-xs" title={i.getValue() || ''}>
        {i.getValue() || ''}
      </span>
    ),
  }),
  columnHelper.accessor('category', {
    header: 'Categorie',
    size: 180,
    cell: (i) => {
      const cat = i.getValue()
      if (!cat) return <span className="text-[var(--text-muted)] text-xs">—</span>
      return (
        <span className="text-xs">
          {[cat.category, cat.subcategory, cat.destination].filter(Boolean).join(' › ')}
        </span>
      )
    },
  }),
  columnHelper.accessor('account_name', {
    header: 'Rekening',
    size: 150,
    cell: (i) => <span className="text-xs text-[var(--text-muted)]">{i.getValue() || ''}</span>,
  }),
]

function SortIcon({ dir }) {
  if (!dir) return <span className="material-symbols-outlined text-xs opacity-30">unfold_more</span>
  return (
    <span className="material-symbols-outlined text-xs text-blue-400">
      {dir === 'asc' ? 'expand_less' : 'expand_more'}
    </span>
  )
}

export default function Transactions({ dark }) {
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [sorting, setSorting] = useState([{ id: 'date', desc: true }])

  // Filters
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const tableContainerRef = useRef(null)

  const sortState = sorting[0]

  async function load(p = 1) {
    setLoading(true)
    try {
      const result = await api.transactions.list({
        page: p,
        page_size: 100,
        sort_by: sortState?.id || 'date',
        sort_dir: sortState?.desc ? 'desc' : 'asc',
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        amount_min: amountMin || undefined,
        amount_max: amountMax || undefined,
        category_id: categoryFilter || undefined,
      })
      setData(result.items)
      setTotal(result.total)
      setPages(result.pages)
      setPage(result.page)
    } catch (e) {
      console.error('Laden mislukt:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1)
  }, [sortState?.id, sortState?.desc])

  function handleSearch(e) {
    e.preventDefault()
    setPage(1)
    load(1)
  }

  const table = useReactTable({
    data,
    columns: COLUMNS,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: true,
    manualPagination: true,
    pageCount: pages,
  })

  const { rows } = table.getRowModel()

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 36,
    overscan: 10,
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const paddingTop = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0
  const paddingBottom = virtualRows.length > 0
    ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)
    : 0

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Transacties</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {loading ? 'Laden…' : `${total.toLocaleString('nl-NL')} transacties`}
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-base text-[var(--text-muted)]">
              search
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoeken…"
              className="pl-8 pr-3 py-1.5 text-sm bg-[var(--surface-2)] border border-[var(--border)] rounded-lg w-56"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Zoeken
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors flex items-center gap-1 ${
              showFilters ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'border-[var(--border)] hover:bg-[var(--surface-2)]'
            }`}
          >
            <span className="material-symbols-outlined text-sm">filter_list</span>
            Filters
          </button>
        </form>
      </div>

      {/* Extended filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)]">Datum van</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)]">Datum tot</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)]">Bedrag min</label>
            <input
              type="number"
              placeholder="-999"
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1 text-sm w-24"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)]">Bedrag max</label>
            <input
              type="number"
              placeholder="9999"
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1 text-sm w-24"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)]">Categorie-ID</label>
            <input
              type="number"
              placeholder="0 = geen"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1 text-sm w-24"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={() => load(1)}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Toepassen
            </button>
            <button
              onClick={() => {
                setDateFrom('')
                setDateTo('')
                setAmountMin('')
                setAmountMax('')
                setCategoryFilter('')
                setSearch('')
                load(1)
              }}
              className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--surface-2)]"
            >
              Wissen
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div
        ref={tableContainerRef}
        className="flex-1 overflow-auto rounded-xl border border-[var(--border)] min-h-0"
      >
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--surface-2)]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ width: header.getSize() }}
                    className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-muted)] whitespace-nowrap cursor-pointer select-none hover:text-[var(--text-primary)] border-b border-[var(--border)]"
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <SortIcon dir={header.column.getIsSorted()} />
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading && data.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="text-center py-12 text-[var(--text-muted)] text-sm">
                  <span className="material-symbols-outlined animate-spin text-2xl block mx-auto mb-2">
                    progress_activity
                  </span>
                  Laden…
                </td>
              </tr>
            )}
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="text-center py-12 text-[var(--text-muted)] text-sm">
                  Geen transacties gevonden
                </td>
              </tr>
            )}
            {paddingTop > 0 && (
              <tr>
                <td style={{ height: paddingTop }} />
              </tr>
            )}
            {virtualRows.map((vr) => {
              const row = rows[vr.index]
              return (
                <tr
                  key={row.id}
                  data-index={vr.index}
                  ref={rowVirtualizer.measureElement}
                  className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-2 max-w-xs overflow-hidden"
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              )
            })}
            {paddingBottom > 0 && (
              <tr>
                <td style={{ height: paddingBottom }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm shrink-0">
        <span className="text-[var(--text-muted)] text-xs">
          Pagina {page} van {pages} · {total.toLocaleString('nl-NL')} rijen
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setPage(1); load(1) }}
            disabled={page === 1 || loading}
            className="px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-40 text-xs"
          >
            «
          </button>
          <button
            onClick={() => { setPage((p) => p - 1); load(page - 1) }}
            disabled={page === 1 || loading}
            className="px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-40 text-xs"
          >
            ‹
          </button>
          <span className="px-3 text-xs">{page}</span>
          <button
            onClick={() => { setPage((p) => p + 1); load(page + 1) }}
            disabled={page === pages || loading}
            className="px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-40 text-xs"
          >
            ›
          </button>
          <button
            onClick={() => { setPage(pages); load(pages) }}
            disabled={page === pages || loading}
            className="px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-40 text-xs"
          >
            »
          </button>
        </div>
      </div>
    </div>
  )
}
