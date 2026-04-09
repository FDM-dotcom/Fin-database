import { useState } from 'react'
import { api } from '@/api'
import { applyMappingToRows, computeExternalId, getDefaultMappings } from '@/lib/importHelpers'

const KNOWN_BANKS = ['rabobank', 'bunq']

export default function StepConfirm({ parsedFiles, mappings, duplicateState, accountIban, onDone }) {
  const [runCategorize, setRunCategorize] = useState(false)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)

  const { excludedIds = new Set(), rows = [] } = duplicateState || {}
  const toImport = rows.filter((r) => !excludedIds.has(r._extId))

  // Group by file
  const byFile = parsedFiles.map((pf) => {
    const fileRows = toImport.filter((r) => r._fileName === pf.fileName)
    return { pf, count: fileRows.length }
  })

  async function runImport() {
    if (!accountIban) {
      setError('Selecteer eerst een rekening-IBAN.')
      return
    }
    setImporting(true)
    setError(null)
    setResults(null)

    const allResults = []

    try {
      for (const pf of parsedFiles) {
        const fileMappings = mappings[pf.id] || getDefaultMappings(pf.bankType)
        const mapped = applyMappingToRows(pf.rows, fileMappings, pf.bankType)
        const activeRows = mapped.filter((r) => !excludedIds.has(r._extId))

        if (activeRows.length === 0) continue

        if (KNOWN_BANKS.includes(pf.bankType)) {
          // Known banks: send raw CSV file to the Python importer
          const result = await api.import(pf.file, accountIban, runCategorize)
          allResults.push({ file: pf.fileName, ...result })
        } else {
          // Unknown banks (ING, ABN AMRO): send pre-mapped JSON transactions
          const transactions = await Promise.all(
            activeRows.map(async (row) => ({
              date: row['Datum'] || '',
              amount: row['Bedrag'] || '0',
              counterparty_iban: row['Naar IBAN'] || null,
              counterparty_name: row['Naam naar rekening'] || null,
              description: row['Transactiedetails'] || null,
              external_id: row._extId || null,
              bank_type: pf.bankType,
              raw: row._raw || {},
            }))
          )

          const result = await api.importMapped({
            account_iban: accountIban,
            run_categorize: runCategorize,
            transactions,
          })
          allResults.push({ file: pf.fileName, ...result })
        }
      }

      setResults(allResults)
      if (onDone) onDone(allResults)
    } catch (e) {
      setError(e.message || 'Importfout')
    } finally {
      setImporting(false)
    }
  }

  const totalToImport = toImport.length
  const totalExcluded = (duplicateState?.rows?.length || 0) - totalToImport

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold mb-1">Bevestigen &amp; importeren</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Controleer de samenvatting en start de import.
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] divide-y divide-[var(--border)]">
        <div className="px-4 py-3 flex justify-between text-sm">
          <span className="text-[var(--text-muted)]">Rekening</span>
          <span className="font-mono text-xs">{accountIban || '—'}</span>
        </div>
        <div className="px-4 py-3 flex justify-between text-sm">
          <span className="text-[var(--text-muted)]">Bestanden</span>
          <span>{parsedFiles.length}</span>
        </div>
        {byFile.map(({ pf, count }) => (
          <div key={pf.id} className="px-4 py-2 flex justify-between text-xs text-[var(--text-muted)]">
            <span className="pl-4">{pf.fileName}</span>
            <span>{count} te importeren</span>
          </div>
        ))}
        <div className="px-4 py-3 flex justify-between text-sm font-medium">
          <span>Totaal te importeren</span>
          <span className="text-green-400">{totalToImport}</span>
        </div>
        {totalExcluded > 0 && (
          <div className="px-4 py-3 flex justify-between text-sm">
            <span className="text-[var(--text-muted)]">Uitgesloten (duplicaten)</span>
            <span className="text-orange-400">{totalExcluded}</span>
          </div>
        )}
      </div>

      {/* Options */}
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input
          type="checkbox"
          checked={runCategorize}
          onChange={(e) => setRunCategorize(e.target.checked)}
          className="rounded"
        />
        Categorisatieregels direct toepassen na import
      </label>

      {/* Import button */}
      {!results && (
        <button
          onClick={runImport}
          disabled={importing || totalToImport === 0 || !accountIban}
          className="self-start px-6 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {importing ? (
            <>
              <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
              Importeren…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-base">upload</span>
              {totalToImport} transacties importeren
            </>
          )}
        </button>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-400 bg-red-400/10 rounded-lg px-4 py-3">
          <span className="material-symbols-outlined text-base shrink-0">error</span>
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-green-400 font-medium">
            <span className="material-symbols-outlined">check_circle</span>
            Import voltooid!
          </div>
          {results.map((r, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm"
            >
              <div className="font-medium mb-2">{r.file}</div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-xl font-bold text-green-400">{r.inserted}</div>
                  <div className="text-xs text-[var(--text-muted)]">Geïmporteerd</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-[var(--text-muted)]">{r.skipped}</div>
                  <div className="text-xs text-[var(--text-muted)]">Overgeslagen</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-red-400">{r.errors?.length || 0}</div>
                  <div className="text-xs text-[var(--text-muted)]">Fouten</div>
                </div>
              </div>
              {r.errors?.length > 0 && (
                <details className="mt-2 text-xs text-red-400">
                  <summary className="cursor-pointer">Fouten tonen</summary>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">
                    {r.errors.map((e, j) => <li key={j}>{e}</li>)}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
