import { useState } from 'react'
import { api } from '@/api'
import { applyMappingToRows, getDefaultMappings } from '@/lib/importHelpers'

// Rabobank en bunq worden door de Python-backend zelf verwerkt (eigen importer).
// ING, ABN AMRO en overigen gaan als voorgemapte JSON via /api/import/mapped.
const NATIVE_BANKS = ['rabobank', 'bunq']

export default function StepConfirm({ parsedFiles, mappings, duplicateState, detectedIban, onDone }) {
  const [runCategorize, setRunCategorize] = useState(false)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)

  // duplicateState gebruikt nu excludedIndices (op basis van array-index, niet _extId)
  const { excludedIndices = new Set(), rows = [] } = duplicateState || {}
  const toImport = rows.filter((_, i) => !excludedIndices.has(i))

  // Haal actieve rijen per bestand op; val terug op herberekening als stap 3 is overgeslagen
  function getFileActiveRows(pf) {
    if (rows.length > 0) {
      return toImport.filter((r) => r._fileName === pf.fileName)
    }
    // Fallback: stap 3 overgeslagen — alle rijen importeren
    const fileMappings = mappings[pf.id] || getDefaultMappings(pf.bankType)
    return applyMappingToRows(pf.rows, fileMappings, pf.bankType)
  }

  const byFile = parsedFiles.map((pf) => ({ pf, count: getFileActiveRows(pf).length }))

  // Bepaal het eigen IBAN per bestand: detectedIban (uit mappings) of eerste rij Van IBAN
  function getOwnIban(pf) {
    if (detectedIban) return detectedIban
    const fileMappings = mappings[pf.id] || getDefaultMappings(pf.bankType)
    const vanIbanMapping = fileMappings.find((m) => m.targetColumn === 'Van IBAN')
    if (!vanIbanMapping?.sourceColumns.length) return ''
    return (pf.rows[0]?.[vanIbanMapping.sourceColumns[0]] || '').trim().toUpperCase()
  }

  async function runImport() {
    setImporting(true)
    setError(null)
    setResults(null)

    const allResults = []

    try {
      for (const pf of parsedFiles) {
        const ownIban = getOwnIban(pf)
        const activeRows = getFileActiveRows(pf)

        if (activeRows.length === 0) continue

        if (NATIVE_BANKS.includes(pf.bankType)) {
          // Rabobank/bunq: stuur het ruwe CSV-bestand naar de Python-importer.
          // Geef het gedetecteerde IBAN mee — de backend slaat import over als
          // het account niet bestaat en maakt het anders automatisch aan.
          const result = await api.import(pf.file, ownIban || undefined, runCategorize)
          allResults.push({ file: pf.fileName, ...result })
        } else {
          // ING, ABN AMRO, onbekend: stuur voorgemapte JSON-transacties.
          const transactions = activeRows.map((row) => ({
            date: row['Datum'] || '',
            amount: row['Bedrag'] || '0',
            own_iban: ownIban || null,
            counterparty_iban: row['Naar IBAN'] || null,
            counterparty_name: row['Naam naar rekening'] || null,
            description: row['Transactiedetails'] || null,
            external_id: row._extId || null,
            bank_type: pf.bankType,
            raw: row._raw || {},
          }))

          const result = await api.importMapped({
            account_iban: ownIban || null,
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

  const totalToImport = byFile.reduce((sum, { count }) => sum + count, 0)
  const totalExcluded = (rows.length || 0) - toImport.length

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
          <span className="text-[var(--text-muted)]">Eigen rekening (IBAN)</span>
          <span className="font-mono text-xs">
            {detectedIban || <span className="italic text-orange-400">nog niet gedetecteerd</span>}
          </span>
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

      {!detectedIban && (
        <div className="flex items-start gap-2 text-sm text-orange-400 bg-orange-400/10 rounded-lg px-4 py-3">
          <span className="material-symbols-outlined text-base shrink-0">warning</span>
          Geen eigen IBAN gedetecteerd. Ga terug naar stap 2 en koppel de kolom <strong>Van IBAN</strong>.
          De backend kan het account dan automatisch aanmaken.
        </div>
      )}

      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input
          type="checkbox"
          checked={runCategorize}
          onChange={(e) => setRunCategorize(e.target.checked)}
          className="rounded"
        />
        Categorisatieregels direct toepassen na import
      </label>

      {!results && (
        <button
          onClick={runImport}
          disabled={importing || totalToImport === 0}
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
