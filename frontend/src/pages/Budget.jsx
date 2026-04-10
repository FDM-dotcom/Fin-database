import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api'

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('nl-NL', { month: 'long', year: 'numeric' })
}

function fmtAmt(v) {
  if (v === null || v === undefined) return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ------------------------------------------------------------------
// Inline-editable budget cell
// ------------------------------------------------------------------

function BudgetCell({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  function startEdit() {
    setDraft(value !== null && value !== undefined ? parseFloat(value).toFixed(2) : '')
    setEditing(true)
  }

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  function commit() {
    const n = parseFloat(draft.replace(',', '.'))
    if (!isNaN(n)) {
      onSave(n)
    } else if (draft.trim() === '') {
      onSave(null) // delete entry
    }
    setEditing(false)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className="w-24 text-right bg-[var(--surface)] border border-blue-500 rounded px-1 py-0.5 text-xs font-mono outline-none"
      />
    )
  }

  return (
    <button
      onClick={startEdit}
      className="w-full text-right text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] rounded px-1 py-0.5 transition-colors group"
      title="Klik om budget in te stellen"
    >
      {value !== null && value !== undefined
        ? fmtAmt(value)
        : <span className="opacity-0 group-hover:opacity-50">+</span>}
    </button>
  )
}

// ------------------------------------------------------------------
// Actual amount cell — color coded
// ------------------------------------------------------------------

function ActualCell({ actual, budgeted }) {
  const a = parseFloat(actual) || 0
  const b = budgeted !== null && budgeted !== undefined ? parseFloat(budgeted) : null

  let colorCls = 'text-[var(--text-primary)]'
  if (b !== null) {
    // For expenses (negative): red if over budget (|actual| > |budget|)
    // For income (positive): green if actual >= budget
    const absA = Math.abs(a)
    const absB = Math.abs(b)
    if (a >= 0) {
      colorCls = a >= b ? 'text-green-400' : 'text-orange-400'
    } else {
      colorCls = absA <= absB ? 'text-green-400' : 'text-red-400'
    }
  } else {
    colorCls = a >= 0 ? 'text-green-400' : 'text-[var(--text-primary)]'
  }

  return (
    <span className={`text-xs font-mono ${colorCls}`}>
      {fmtAmt(actual)}
    </span>
  )
}

// ------------------------------------------------------------------
// Category group (collapsible)
// ------------------------------------------------------------------

function CategoryGroup({ group, months, onSaveBudget, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)

  // Compute group totals per month
  const groupBudgeted = {}
  const groupActual = {}
  for (const m of months) {
    groupBudgeted[m] = group.rows.reduce((sum, row) => {
      const v = row.budgeted[m]
      return sum + (v !== null && v !== undefined ? parseFloat(v) : 0)
    }, 0)
    groupActual[m] = group.rows.reduce((sum, row) => {
      const v = row.actual[m]
      return sum + (parseFloat(v) || 0)
    }, 0)
  }

  return (
    <div className="mb-1">
      {/* Group header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--surface-2)] hover:bg-[var(--surface)] rounded-lg text-sm font-semibold transition-colors text-left"
      >
        <span className="material-symbols-outlined text-sm text-[var(--text-muted)]">
          {open ? 'expand_more' : 'chevron_right'}
        </span>
        <span className="flex-1">{group.category}</span>
        {months.map((m) => (
          <div key={m} className="flex gap-3" style={{ width: `${months.length > 1 ? 180 : 220}px` }}>
            <span className="w-24 text-right text-xs font-mono text-[var(--text-muted)]">
              {groupBudgeted[m] !== 0 ? fmtAmt(groupBudgeted[m]) : '—'}
            </span>
            <span className="w-24 text-right text-xs font-mono">
              {fmtAmt(groupActual[m])}
            </span>
          </div>
        ))}
      </button>

      {/* Rows */}
      {open && (
        <div className="mt-0.5 ml-4 flex flex-col gap-px">
          {group.rows.map((row) => (
            <div
              key={row.category_id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--surface-2)] group"
            >
              {/* Category label */}
              <div className="flex-1 min-w-0">
                <span className="text-xs text-[var(--text-primary)]">
                  {row.subcategory || row.category}
                </span>
                {row.destination && (
                  <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">
                    › {row.destination}
                  </span>
                )}
              </div>

              {/* Per-month columns */}
              {months.map((m) => (
                <div key={m} className="flex gap-3" style={{ width: `${months.length > 1 ? 180 : 220}px` }}>
                  <div className="w-24 text-right">
                    <BudgetCell
                      value={row.budgeted[m]}
                      onSave={(amt) => onSaveBudget(m, row.category_id, amt)}
                    />
                  </div>
                  <div className="w-24 text-right">
                    <ActualCell actual={row.actual[m]} budgeted={row.budgeted[m]} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// Main Budget page
// ------------------------------------------------------------------

export default function Budget() {
  const [anchorMonth, setAnchorMonth] = useState(currentYearMonth)
  const [monthCount, setMonthCount] = useState(1)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Derive the list of months to display
  const months = Array.from({ length: monthCount }, (_, i) => addMonths(anchorMonth, i))

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.budget.report(months)
      setReport(data)
    } catch (e) {
      setError(e.message || 'Fout bij laden')
    } finally {
      setLoading(false)
    }
  }, [months.join(',')])

  useEffect(() => { load() }, [load])

  async function handleSaveBudget(yearMonth, categoryId, amount) {
    try {
      if (amount === null) {
        await api.budget.deleteEntry(yearMonth, categoryId)
      } else {
        await api.budget.setEntry(yearMonth, categoryId, amount)
      }
      // Optimistic update of the local report state
      setReport((prev) => {
        if (!prev) return prev
        function updateRows(groups) {
          return groups.map((g) => ({
            ...g,
            rows: g.rows.map((r) => {
              if (r.category_id !== categoryId) return r
              return {
                ...r,
                budgeted: { ...r.budgeted, [yearMonth]: amount !== null ? String(amount) : null },
              }
            }),
          }))
        }
        return {
          ...prev,
          income: updateRows(prev.income),
          expenses: updateRows(prev.expenses),
        }
      })
    } catch (e) {
      console.error('Budget opslaan mislukt:', e)
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-5xl mx-auto pb-10">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Budget</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Vergelijk geplande en werkelijke bedragen per categorie.
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {/* Month count selector */}
          <select
            value={monthCount}
            onChange={(e) => setMonthCount(Number(e.target.value))}
            className="text-sm rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 outline-none"
          >
            {[1, 2, 3, 6].map((n) => (
              <option key={n} value={n}>{n} {n === 1 ? 'maand' : 'maanden'}</option>
            ))}
          </select>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setAnchorMonth((m) => addMonths(m, -monthCount))}
              className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-colors"
              title="Vorige periode"
            >
              <span className="material-symbols-outlined text-base">chevron_left</span>
            </button>
            <button
              onClick={() => setAnchorMonth(currentYearMonth())}
              className="px-3 py-1.5 text-sm rounded-lg hover:bg-[var(--surface-2)] transition-colors font-medium"
            >
              Vandaag
            </button>
            <button
              onClick={() => setAnchorMonth((m) => addMonths(m, monthCount))}
              className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-colors"
              title="Volgende periode"
            >
              <span className="material-symbols-outlined text-base">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* Column headers */}
      {!loading && report && (
        <div className="flex items-center gap-2 px-3 text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide border-b border-[var(--border)] pb-2">
          <div className="flex-1">Categorie</div>
          {months.map((m) => (
            <div key={m} className="flex gap-3" style={{ width: `${monthCount > 1 ? 180 : 220}px` }}>
              <div className="w-full text-center" style={{ minWidth: '180px' }}>
                {fmtMonth(m)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sub-headers: Begroot / Besteed */}
      {!loading && report && (
        <div className="flex items-center gap-2 px-3 -mt-4 text-[10px] text-[var(--text-muted)] uppercase tracking-wide">
          <div className="flex-1" />
          {months.map((m) => (
            <div key={m} className="flex gap-3" style={{ width: `${monthCount > 1 ? 180 : 220}px` }}>
              <div className="w-24 text-right">Begroot</div>
              <div className="w-24 text-right">Besteed</div>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2.5 text-sm text-[var(--text-muted)] bg-[var(--surface-2)] rounded-lg px-4 py-3">
          <span className="material-symbols-outlined animate-spin text-base shrink-0">progress_activity</span>
          Budgetrapport laden…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-500/30 rounded-lg px-3 py-2.5">
          <span className="material-symbols-outlined text-base shrink-0">error</span>
          {error}
        </div>
      )}

      {/* Report */}
      {!loading && report && (
        <>
          {/* Income section */}
          {report.income.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-base text-green-400">trending_up</span>
                <h2 className="text-sm font-semibold text-green-400">Inkomsten</h2>
              </div>
              {report.income.map((group) => (
                <CategoryGroup
                  key={group.category}
                  group={group}
                  months={months}
                  onSaveBudget={handleSaveBudget}
                  defaultOpen
                />
              ))}
            </section>
          )}

          {/* Expenses section */}
          {report.expenses.length > 0 && (
            <section className="mt-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-base text-red-400">trending_down</span>
                <h2 className="text-sm font-semibold text-red-400">Uitgaven</h2>
              </div>
              {report.expenses.map((group) => (
                <CategoryGroup
                  key={group.category}
                  group={group}
                  months={months}
                  onSaveBudget={handleSaveBudget}
                  defaultOpen
                />
              ))}
            </section>
          )}

          {/* Uncategorized */}
          <section className="mt-2">
            <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-2)] rounded-lg">
              <span className="material-symbols-outlined text-sm text-[var(--text-muted)]">help_outline</span>
              <span className="flex-1 text-sm font-semibold text-[var(--text-muted)]">Ongecategoriseerd</span>
              {months.map((m) => (
                <div key={m} className="flex gap-3" style={{ width: `${monthCount > 1 ? 180 : 220}px` }}>
                  <span className="w-24 text-right text-xs font-mono text-[var(--text-muted)]">—</span>
                  <span className="w-24 text-right text-xs font-mono text-orange-400">
                    {fmtAmt(report.uncategorized[m])}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Empty state */}
          {report.income.length === 0 && report.expenses.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-[var(--text-muted)]">
              <span className="material-symbols-outlined text-4xl">account_balance_wallet</span>
              <p className="text-sm">Geen gecategoriseerde transacties gevonden voor deze periode.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
