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

// ------------------------------------------------------------------
// Kleine herbruikbare cellen
// ------------------------------------------------------------------

function AmountCell({ value }) {
  const num = parseFloat(value)
  if (isNaN(num)) return <span className="text-[var(--text-muted)] text-xs">—</span>
  const neg = num < 0
  return (
    <span className={`font-mono tabular-nums text-sm ${neg ? 'text-red-400' : 'text-green-400'}`}>
      {neg ? '−' : '+'}€{Math.abs(num).toFixed(2)}
    </span>
  )
}

function BalanceCell({ value }) {
  if (value == null) return <span className="text-[var(--text-muted)] text-xs">—</span>
  return (
    <span className="font-mono tabular-nums text-xs">
      €{parseFloat(value).toFixed(2)}
    </span>
  )
}

function LabelChips({ labels }) {
  if (!labels?.length) return <span className="text-[var(--text-muted)] text-xs">—</span>
  const shown = labels.slice(0, 2)
  const rest = labels.length - 2
  return (
    <div className="flex gap-1 flex-wrap">
      {shown.map((l) => (
        <span
          key={l.id}
          className="inline-block bg-purple-500/20 text-purple-300 text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap"
        >
          {l.name}
        </span>
      ))}
      {rest > 0 && <span className="text-[var(--text-muted)] text-xs self-center">+{rest}</span>}
    </div>
  )
}

function SortIcon({ dir }) {
  if (!dir) return <span className="material-symbols-outlined text-xs opacity-30">unfold_more</span>
  return (
    <span className="material-symbols-outlined text-xs text-blue-400">
      {dir === 'asc' ? 'expand_less' : 'expand_more'}
    </span>
  )
}

// ------------------------------------------------------------------
// Kolom-definities (stabiele module-scope constante)
// ------------------------------------------------------------------

const COLUMNS = [
  // Checkbox-kolom (TanStack Table ingebouwde selectie)
  columnHelper.display({
    id: 'select',
    size: 40,
    enableSorting: false,
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        ref={(el) => {
          if (el) el.indeterminate = table.getIsSomePageRowsSelected()
        }}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
        className="accent-blue-500 cursor-pointer"
        aria-label="Selecteer alles"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        onClick={(e) => e.stopPropagation()}
        className="accent-blue-500 cursor-pointer"
      />
    ),
  }),

  columnHelper.accessor('date', {
    header: 'Datum',
    size: 105,
    cell: (i) => <span className="tabular-nums text-xs">{i.getValue()}</span>,
  }),

  columnHelper.accessor('amount', {
    header: 'Bedrag',
    size: 115,
    cell: (i) => <AmountCell value={i.getValue()} />,
  }),

  columnHelper.accessor('balance_after', {
    header: 'Saldo na trn',
    size: 115,
    enableSorting: false,
    cell: (i) => <BalanceCell value={i.getValue()} />,
  }),

  columnHelper.accessor('account_name', {
    header: 'Rekening',
    size: 140,
    enableSorting: false,
    cell: (i) => (
      <span className="text-xs text-[var(--text-muted)]">{i.getValue() || '—'}</span>
    ),
  }),

  columnHelper.accessor('account_institution', {
    header: 'Bank',
    size: 90,
    enableSorting: false,
    cell: (i) => (
      <span className="text-xs text-[var(--text-muted)]">{i.getValue() || '—'}</span>
    ),
  }),

  columnHelper.accessor('counterparty_name', {
    header: 'Naam tegenpartij',
    size: 180,
    cell: (i) => <span className="text-sm">{i.getValue() || '—'}</span>,
  }),

  columnHelper.accessor('counterparty_iban', {
    header: 'IBAN',
    size: 160,
    enableSorting: false,
    cell: (i) => (
      <span className="font-mono text-xs">{i.getValue() || '—'}</span>
    ),
  }),

  columnHelper.accessor('description', {
    header: 'Omschrijving',
    size: 230,
    cell: (i) => (
      <span
        className="truncate block max-w-[230px] text-sm"
        title={i.getValue() || ''}
      >
        {i.getValue() || '—'}
      </span>
    ),
  }),

  columnHelper.accessor((row) => row.category?.category, {
    id: 'category',
    header: 'Categorie',
    size: 130,
    enableSorting: false,
    cell: (i) =>
      i.getValue() ? (
        <span className="text-xs">{i.getValue()}</span>
      ) : (
        <span className="text-[var(--text-muted)] text-xs">—</span>
      ),
  }),

  columnHelper.accessor((row) => row.category?.subcategory, {
    id: 'subcategory',
    header: 'Subcategorie',
    size: 125,
    enableSorting: false,
    cell: (i) =>
      i.getValue() ? (
        <span className="text-xs">{i.getValue()}</span>
      ) : (
        <span className="text-[var(--text-muted)] text-xs">—</span>
      ),
  }),

  columnHelper.accessor((row) => row.category?.destination, {
    id: 'destination',
    header: 'Bestemming',
    size: 120,
    enableSorting: false,
    cell: (i) =>
      i.getValue() ? (
        <span className="text-xs">{i.getValue()}</span>
      ) : (
        <span className="text-[var(--text-muted)] text-xs">—</span>
      ),
  }),

  columnHelper.accessor('labels', {
    header: 'Labels',
    size: 160,
    enableSorting: false,
    cell: (i) => <LabelChips labels={i.getValue()} />,
  }),

  // Bewerk-knop (via table.options.meta.onEdit)
  columnHelper.display({
    id: 'edit',
    size: 48,
    enableSorting: false,
    header: () => null,
    cell: ({ row, table }) => (
      <button
        onClick={() => table.options.meta?.onEdit(row.original)}
        className="text-[var(--text-muted)] hover:text-blue-400 transition-colors p-1"
        title="Bewerken"
      >
        <span className="material-symbols-outlined text-base">edit</span>
      </button>
    ),
  }),
]

// ------------------------------------------------------------------
// Bevestigingsdialoog verwijderen
// ------------------------------------------------------------------

function DeleteDialog({ count, onConfirm, onCancel, deleting }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 w-96 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <span className="material-symbols-outlined text-2xl text-red-400">delete_forever</span>
          <h3 className="font-semibold text-lg">Transacties verwijderen</h3>
        </div>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          Weet je zeker dat je{' '}
          <strong className="text-[var(--text-primary)]">
            {count} {count === 1 ? 'transactie' : 'transacties'}
          </strong>{' '}
          wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
          >
            Annuleren
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {deleting && (
              <span className="material-symbols-outlined text-sm animate-spin">
                progress_activity
              </span>
            )}
            {deleting ? 'Verwijderen…' : 'Verwijderen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// Bewerkpaneel (rechterzijbalk)
// ------------------------------------------------------------------

function EditPanel({ transaction, categories, allLabels, onSave, onClose, onNewLabel }) {
  const currentCat = transaction.category

  const [selCat, setSelCat] = useState(currentCat?.category || '')
  const [selSub, setSelSub] = useState(currentCat?.subcategory || '')
  const [selDest, setSelDest] = useState(currentCat?.destination || '')
  const [selLabelIds, setSelLabelIds] = useState(
    (transaction.labels || []).map((l) => l.id),
  )
  const [notes, setNotes] = useState(transaction.notes || '')
  const [saving, setSaving] = useState(false)
  const [newLabelInput, setNewLabelInput] = useState('')
  const [creatingLabel, setCreatingLabel] = useState(false)

  // Cascerende opties op basis van bestaande categorieën
  const catOptions = useMemo(
    () => [...new Set(categories.map((c) => c.category))].sort(),
    [categories],
  )
  const subOptions = useMemo(() => {
    if (!selCat) return []
    return [
      ...new Set(
        categories.filter((c) => c.category === selCat && c.subcategory).map((c) => c.subcategory),
      ),
    ].sort()
  }, [categories, selCat])

  const destOptions = useMemo(() => {
    if (!selCat) return []
    const sub = selSub || null
    return [
      ...new Set(
        categories
          .filter((c) => c.category === selCat && (c.subcategory || null) === sub && c.destination)
          .map((c) => c.destination),
      ),
    ].sort()
  }, [categories, selCat, selSub])

  // Zoek het bijbehorende category_id op basis van geselecteerde waarden
  const resolvedCatId = useMemo(() => {
    if (!selCat) return null
    const sub = selSub || null
    const dest = selDest || null
    const match = categories.find(
      (c) =>
        c.category === selCat &&
        (c.subcategory || null) === sub &&
        (c.destination || null) === dest,
    )
    return match?.id || null
  }, [categories, selCat, selSub, selDest])

  function handleCatChange(val) {
    setSelCat(val)
    setSelSub('')
    setSelDest('')
  }
  function handleSubChange(val) {
    setSelSub(val)
    setSelDest('')
  }

  function toggleLabel(id) {
    setSelLabelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function handleCreateLabel() {
    const name = newLabelInput.trim()
    if (!name || creatingLabel) return
    setCreatingLabel(true)
    try {
      const newLabel = await onNewLabel(name)
      setSelLabelIds((prev) => [...prev, newLabel.id])
      setNewLabelInput('')
    } catch (e) {
      alert('Label aanmaken mislukt: ' + e.message)
    } finally {
      setCreatingLabel(false)
    }
  }

  const canSave = !selCat || resolvedCatId !== null

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      await onSave(transaction.id, {
        category_id: resolvedCatId,
        label_ids: selLabelIds,
        notes: notes.trim() || null,
      })
      onClose()
    } catch (e) {
      alert('Opslaan mislukt: ' + e.message)
      setSaving(false)
    }
  }

  const amount = parseFloat(transaction.amount)
  const amtColor = amount < 0 ? 'text-red-400' : 'text-green-400'

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-end">
      {/* Achtergrond-overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Zijpaneel */}
      <div className="relative z-10 w-[400px] bg-[var(--surface)] border-l border-[var(--border)] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-start justify-between shrink-0">
          <div>
            <div className={`text-xl font-semibold font-mono ${amtColor}`}>
              {amount < 0 ? '−' : '+'}€{Math.abs(amount).toFixed(2)}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">
              {transaction.date}
              {(transaction.counterparty_name || transaction.counterparty_iban) && (
                <> · {transaction.counterparty_name || transaction.counterparty_iban}</>
              )}
            </div>
            {transaction.description && (
              <div className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">
                {transaction.description}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors ml-3 shrink-0"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Inhoud */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6">

          {/* Categorie */}
          <section>
            <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2.5">
              Categorie
            </div>
            <div className="flex flex-col gap-2">
              <select
                value={selCat}
                onChange={(e) => handleCatChange(e.target.value)}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              >
                <option value="">— Geen categorie —</option>
                {catOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {subOptions.length > 0 && (
                <select
                  value={selSub}
                  onChange={(e) => handleSubChange(e.target.value)}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">— Geen subcategorie —</option>
                  {subOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}

              {destOptions.length > 0 && (
                <select
                  value={selDest}
                  onChange={(e) => setSelDest(e.target.value)}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">— Geen bestemming —</option>
                  {destOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}

              {selCat && resolvedCatId === null && (
                <p className="text-xs text-orange-400 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">warning</span>
                  Combinatie bestaat niet — kies een geldige combinatie
                </p>
              )}
            </div>
          </section>

          {/* Labels */}
          <section>
            <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2.5">
              Labels
            </div>
            {allLabels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {allLabels.map((label) => (
                  <button
                    key={label.id}
                    onClick={() => toggleLabel(label.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      selLabelIds.includes(label.id)
                        ? 'bg-purple-600/30 border-purple-500 text-purple-300'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:border-purple-400 hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {label.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                placeholder="Nieuw label aanmaken…"
                value={newLabelInput}
                onChange={(e) => setNewLabelInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateLabel()}
                className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs"
              />
              <button
                onClick={handleCreateLabel}
                disabled={!newLabelInput.trim() || creatingLabel}
                className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {creatingLabel ? '…' : 'Toevoegen'}
              </button>
            </div>
          </section>

          {/* Notities */}
          <section>
            <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2.5">
              Notities
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Voeg een notitie toe…"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm resize-none"
            />
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--border)] flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {saving && (
              <span className="material-symbols-outlined text-sm animate-spin">
                progress_activity
              </span>
            )}
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// Hoofdcomponent
// ------------------------------------------------------------------

export default function Transactions() {
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [sorting, setSorting] = useState([{ id: 'date', desc: true }])
  const [rowSelection, setRowSelection] = useState({})

  // Filters
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Verwijderen
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Bewerken
  const [editTransaction, setEditTransaction] = useState(null)
  const [savedIds, setSavedIds] = useState(new Set())

  // Referentiedata
  const [categories, setCategories] = useState([])
  const [allLabels, setAllLabels] = useState([])

  const tableContainerRef = useRef(null)
  const sortState = sorting[0]

  // Laad referentiedata één keer
  useEffect(() => {
    api.categories.list().then(setCategories).catch(console.error)
    api.labels.list().then(setAllLabels).catch(console.error)
  }, [])

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
      setRowSelection({})
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
    load(1)
  }

  // Geselecteerde ID's afleiden uit TanStack Table rowSelection
  const selectedIds = Object.keys(rowSelection)
    .filter((k) => rowSelection[k])
    .map(Number)

  // Verwijderen
  async function handleDelete() {
    setDeleting(true)
    try {
      await api.transactions.delete(selectedIds)
      setShowDeleteConfirm(false)
      setRowSelection({})
      await load(page)
    } catch (e) {
      alert('Verwijderen mislukt: ' + e.message)
    } finally {
      setDeleting(false)
    }
  }

  // Opslaan vanuit bewerkpaneel
  async function handleSaveEdit(id, patch) {
    const updated = await api.transactions.patch(id, patch)
    setData((prev) => prev.map((t) => (t.id === id ? updated : t)))
    // Groen flash-effect
    setSavedIds((prev) => new Set([...prev, id]))
    setTimeout(() => {
      setSavedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 1500)
  }

  // Nieuw label aanmaken vanuit bewerkpaneel
  async function handleNewLabel(name) {
    const newLabel = await api.labels.create(name)
    setAllLabels((prev) =>
      [...prev, newLabel].sort((a, b) => a.name.localeCompare(b.name)),
    )
    return newLabel
  }

  const table = useReactTable({
    data,
    columns: COLUMNS,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: true,
    manualPagination: true,
    pageCount: pages,
    meta: { onEdit: setEditTransaction },
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
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)
      : 0

  return (
    <div className="flex flex-col h-full gap-4">

      {/* ---- Header ---- */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Transacties</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {loading ? 'Laden…' : `${total.toLocaleString('nl-NL')} transacties`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Verwijderknop verschijnt bij selectie */}
          {selectedIds.length > 0 && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-red-600/15 text-red-400 border border-red-500/40 hover:bg-red-600/25 transition-colors"
            >
              <span className="material-symbols-outlined text-base">delete</span>
              {selectedIds.length} verwijderen
            </button>
          )}

          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-base text-[var(--text-muted)]">
                search
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoeken…"
                className="pl-8 pr-3 py-1.5 text-sm bg-[var(--surface-2)] border border-[var(--border)] rounded-lg w-52"
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
                showFilters
                  ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                  : 'border-[var(--border)] hover:bg-[var(--surface-2)]'
              }`}
            >
              <span className="material-symbols-outlined text-sm">filter_list</span>
              Filters
            </button>
          </form>
        </div>
      </div>

      {/* ---- Uitgebreide filters ---- */}
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

      {/* ---- Tabel ---- */}
      <div
        ref={tableContainerRef}
        className="flex-1 overflow-auto rounded-xl border border-[var(--border)] min-h-0"
      >
        <table className="w-full text-sm border-collapse" style={{ minWidth: 1820 }}>
          <thead className="sticky top-0 z-10 bg-[var(--surface-2)]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  return (
                    <th
                      key={header.id}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      style={{ width: header.getSize() }}
                      className={`px-3 py-2.5 text-left text-xs font-medium text-[var(--text-muted)] whitespace-nowrap border-b border-[var(--border)] select-none ${
                        canSort ? 'cursor-pointer hover:text-[var(--text-primary)]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && <SortIcon dir={header.column.getIsSorted()} />}
                      </div>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading && data.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="text-center py-12 text-[var(--text-muted)] text-sm"
                >
                  <span className="material-symbols-outlined animate-spin text-2xl block mx-auto mb-2">
                    progress_activity
                  </span>
                  Laden…
                </td>
              </tr>
            )}
            {!loading && data.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="text-center py-12 text-[var(--text-muted)] text-sm"
                >
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
              const isFlashed = savedIds.has(row.original.id)
              return (
                <tr
                  key={row.id}
                  data-index={vr.index}
                  ref={rowVirtualizer.measureElement}
                  className={`border-b border-[var(--border)] transition-colors duration-500 ${
                    isFlashed
                      ? 'bg-green-500/15'
                      : row.getIsSelected()
                      ? 'bg-blue-500/10'
                      : 'hover:bg-[var(--surface-2)]'
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-2 overflow-hidden"
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

      {/* ---- Paginering ---- */}
      <div className="flex items-center justify-between text-sm shrink-0">
        <span className="text-[var(--text-muted)] text-xs">
          Pagina {page} van {pages} · {total.toLocaleString('nl-NL')} rijen
          {selectedIds.length > 0 && (
            <> · <span className="text-blue-400">{selectedIds.length} geselecteerd</span></>
          )}
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
            onClick={() => { const p = page - 1; setPage(p); load(p) }}
            disabled={page === 1 || loading}
            className="px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-40 text-xs"
          >
            ‹
          </button>
          <span className="px-3 text-xs">{page}</span>
          <button
            onClick={() => { const p = page + 1; setPage(p); load(p) }}
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

      {/* ---- Bevestigingsdialoog verwijderen ---- */}
      {showDeleteConfirm && (
        <DeleteDialog
          count={selectedIds.length}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          deleting={deleting}
        />
      )}

      {/* ---- Bewerkpaneel ---- */}
      {editTransaction && (
        <EditPanel
          transaction={editTransaction}
          categories={categories}
          allLabels={allLabels}
          onSave={handleSaveEdit}
          onClose={() => setEditTransaction(null)}
          onNewLabel={handleNewLabel}
        />
      )}
    </div>
  )
}
