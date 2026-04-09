import { useEffect, useState } from 'react'
import { api } from '@/api'
import { applyMappingToRows, computeExternalId, getDefaultMappings } from '@/lib/importHelpers'

function SimilarityBar({ pct }) {
  const color = pct === 1 ? 'bg-red-500' : pct >= 0.75 ? 'bg-orange-400' : 'bg-yellow-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--surface)]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="text-xs tabular-nums w-10 text-right">{Math.round(pct * 100)}%</span>
    </div>
  )
}

export default function StepDuplicates({ parsedFiles, mappings, accountIban, duplicateState, onDuplicateStateChange }) {
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)

  // duplicateState: {existingIds: Set, excludedIds: Set, totalNew, totalDup}
  const { existingIds = new Set(), excludedIds = new Set(), rows = [], totalNew = 0, totalDup = 0 } = duplicateState || {}

  useEffect(() => {
    if (!accountIban || parsedFiles.length === 0) return
    runCheck()
  }, [])

  async function runCheck() {
    setLoading(true)
    try {
      // Build all mapped rows with external IDs across all files
      const allRows = []
      for (const pf of parsedFiles) {
        const fileMappings = mappings[pf.id] || getDefaultMappings(pf.bankType)
        const mapped = applyMappingToRows(pf.rows, fileMappings, pf.bankType)
        for (const row of mapped) {
          const extId = await computeExternalId(row._raw, pf.bankType)
          allRows.push({ ...row, _extId: extId, _bankType: pf.bankType, _fileName: pf.fileName })
        }
      }

      const extIds = allRows.map((r) => r._extId).filter(Boolean)
      const result = accountIban
        ? await api.transactions.checkDuplicates(accountIban, extIds)
        : { existing: [], new: extIds }

      const existSet = new Set(result.existing)
      const excludeSet = new Set(result.existing) // pre-exclude confirmed dups

      onDuplicateStateChange({
        existingIds: existSet,
        excludedIds: excludeSet,
        rows: allRows,
        totalNew: result.new.length,
        totalDup: result.existing.length,
      })
      setChecked(true)
    } catch (e) {
      console.error('Duplicatencheck mislukt:', e)
    } finally {
      setLoading(false)
    }
  }

  function toggleExclude(extId) {
    onDuplicateStateChange((prev) => {
      const next = new Set(prev.excludedIds)
      if (next.has(extId)) next.delete(extId)
      else next.add(extId)
      return { ...prev, excludedIds: next }
    })
  }

  const dupRows = rows.filter((r) => existingIds.has(r._extId))
  const newCount = rows.length - dupRows.length

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold mb-1">Dubbele transacties</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Vergelijking met bestaande transacties op basis van datum, bedrag en IBAN.
          Transacties die al bestaan worden standaard uitgesloten.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{loading ? '…' : newCount}</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">Nieuwe transacties</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center">
          <div className="text-2xl font-bold text-orange-400">{loading ? '…' : dupRows.length}</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">Al aanwezig</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center">
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {loading ? '…' : rows.length - (excludedIds?.size || 0)}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">Te importeren</div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
          Controleren op duplicaten…
        </div>
      )}

      {!loading && (
        <button
          onClick={runCheck}
          className="self-start text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-xs">refresh</span>
          Opnieuw controleren
        </button>
      )}

      {/* Duplicate list */}
      {dupRows.length > 0 && (
        <div>
          <div className="text-sm font-medium mb-2">
            Gevonden duplicaten
            <span className="text-xs text-[var(--text-muted)] ml-2">
              (aangevinkt = uitsluiten van import)
            </span>
          </div>
          <div className="rounded-xl border border-[var(--border)] overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[var(--surface-2)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left w-8">
                    <span title="Uitsluiten">✗</span>
                  </th>
                  <th className="px-3 py-2 text-left">Datum</th>
                  <th className="px-3 py-2 text-left">Bedrag</th>
                  <th className="px-3 py-2 text-left">Omschrijving</th>
                  <th className="px-3 py-2 text-left">Bestand</th>
                </tr>
              </thead>
              <tbody>
                {dupRows.map((row, i) => {
                  const excl = excludedIds.has(row._extId)
                  return (
                    <tr
                      key={i}
                      className={`border-t border-[var(--border)] transition-colors ${
                        excl ? 'opacity-50' : 'hover:bg-[var(--surface-2)]'
                      }`}
                    >
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={excl}
                          onChange={() => toggleExclude(row._extId)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{row['Datum'] || ''}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap font-mono">{row['Bedrag'] || ''}</td>
                      <td className="px-3 py-1.5 max-w-[240px] truncate">
                        {row['Transactiedetails'] || row['Naam naar rekening'] || ''}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-muted)]">{row._fileName}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {checked && dupRows.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <span className="material-symbols-outlined text-base">check_circle</span>
          Geen duplicaten gevonden — alle transacties zijn nieuw.
        </div>
      )}
    </div>
  )
}
