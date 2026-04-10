import { useEffect, useState } from 'react'
import { api } from '@/api'
import { applyMappingToRows, computeExternalId, getDefaultMappings } from '@/lib/importHelpers'

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function fmtAmt(v) {
  const n = parseFloat(v)
  if (isNaN(n)) return v || '—'
  return (n < 0 ? '−' : '+') + '€' + Math.abs(n).toFixed(2)
}

// ------------------------------------------------------------------
// Transactie-kaart (één kant van het vergelijkingspaneel)
// ------------------------------------------------------------------

function TrxCard({ label, isNew, date, amount, name, iban, description }) {
  const n = parseFloat(amount)
  const amtColor = n < 0 ? 'text-red-400' : 'text-green-400'
  const borderCls = isNew
    ? 'border-green-500/25 bg-green-500/5'
    : 'border-orange-500/25 bg-orange-500/5'
  const labelCls = isNew ? 'text-green-400' : 'text-orange-400'

  return (
    <div className={`flex-1 min-w-0 rounded-lg border px-3 py-2.5 ${borderCls}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${labelCls}`}>
        {label}
      </div>
      <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
        <span className="tabular-nums text-xs font-mono text-[var(--text-muted)]">{date}</span>
        <span className={`font-mono text-sm font-semibold ${amtColor}`}>{fmtAmt(amount)}</span>
      </div>
      {name && (
        <div className="text-xs truncate">{name}</div>
      )}
      {iban && (
        <div className="text-xs text-[var(--text-muted)] font-mono truncate">{iban}</div>
      )}
      {description && (
        <div className="text-xs text-[var(--text-muted)] truncate">{description}</div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// Hoofdcomponent
// ------------------------------------------------------------------

export default function StepDuplicates({
  parsedFiles,
  mappings,
  detectedIban,
  duplicateState,
  onDuplicateStateChange,
}) {
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState(null)

  // duplicateState: {rows, duplicates, excludedIndices}
  const {
    rows = [],
    duplicates = [],
    excludedIndices = new Set(),
  } = duplicateState || {}

  const dupCount = duplicates.length
  const toImportCount = rows.length - excludedIndices.size

  // Automatisch controleren bij het betreden van stap 3
  useEffect(() => {
    if (parsedFiles.length === 0) return
    // Sla over als al gecontroleerd (duplicateState is al gezet)
    if (duplicateState) {
      setChecked(true)
      return
    }
    runCheck()
  }, [])

  async function runCheck() {
    setLoading(true)
    setChecked(false)
    setError(null)

    try {
      // Bouw gecombineerde rij-array over alle bestanden
      const allRows = []
      for (const pf of parsedFiles) {
        const fileMappings = mappings[pf.id] || getDefaultMappings(pf.bankType)
        const mapped = applyMappingToRows(pf.rows, fileMappings, pf.bankType)
        for (const row of mapped) {
          // Bewaar _extId voor gebruik in stap 5 (import)
          const extId = await computeExternalId(row._raw, pf.bankType)
          allRows.push({
            ...row,
            _extId: extId,
            _bankType: pf.bankType,
            _fileName: pf.fileName,
          })
        }
      }

      // Stuur genormaliseerde velden naar de backend voor content-gebaseerde matching
      const txsForCheck = allRows.map((row, idx) => ({
        idx,
        date:               row['Datum'] || '',
        amount:             row['Bedrag'] || '',
        counterparty_iban:  row['Naar IBAN'] || null,
        description:        row['Transactiedetails'] || null,
      }))

      console.log(
        '[StepDuplicates] check-duplicates →',
        txsForCheck.length,
        'transacties, account:',
        detectedIban || '(alle)',
      )

      const result = await api.transactions.checkDuplicates(txsForCheck, detectedIban || null)

      console.log(
        '[StepDuplicates] ← resultaat:',
        result.duplicates.length,
        'duplicaten van',
        txsForCheck.length,
      )

      // Verrijk duplicaten met de volledige rij-data
      const enriched = result.duplicates.map((d) => ({
        ...d,
        row: allRows[d.idx],
      }))

      // Pre-exclude alle gevonden duplicaten
      const excludeSet = new Set(enriched.map((d) => d.idx))

      onDuplicateStateChange({
        rows: allRows,
        duplicates: enriched,
        excludedIndices: excludeSet,
      })
      setChecked(true)
    } catch (e) {
      console.error('[StepDuplicates] controle mislukt:', e)
      setError(e.message || 'Controle mislukt')
    } finally {
      setLoading(false)
    }
  }

  function toggleExclude(idx) {
    onDuplicateStateChange((prev) => {
      const next = new Set(prev.excludedIndices)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return { ...prev, excludedIndices: next }
    })
  }

  function excludeAll() {
    onDuplicateStateChange((prev) => ({
      ...prev,
      excludedIndices: new Set(prev.duplicates.map((d) => d.idx)),
    }))
  }

  function includeAll() {
    onDuplicateStateChange((prev) => ({
      ...prev,
      excludedIndices: new Set(),
    }))
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Dubbele transacties</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Vergelijking met bestaande transacties op datum, bedrag en IBAN/omschrijving.
          Gemarkeerde transacties worden standaard uitgesloten van import.
        </p>
      </div>

      {/* Samenvatting */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center">
          <div className="text-2xl font-bold text-green-400">
            {loading ? '…' : rows.length - dupCount}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">Nieuwe transacties</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center">
          <div className="text-2xl font-bold text-orange-400">
            {loading ? '…' : dupCount}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">Al aanwezig</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center">
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {loading ? '…' : toImportCount}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">Te importeren</div>
        </div>
      </div>

      {/* Laden */}
      {loading && (
        <div className="flex items-center gap-2.5 text-sm text-[var(--text-muted)] bg-[var(--surface-2)] rounded-lg px-4 py-3">
          <span className="material-symbols-outlined animate-spin text-base shrink-0">
            progress_activity
          </span>
          Controleren op duplicaten…
        </div>
      )}

      {/* Foutmelding */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-500/30 rounded-lg px-3 py-2.5">
          <span className="material-symbols-outlined text-base shrink-0">error</span>
          {error}
        </div>
      )}

      {/* Opnieuw-knop (na eerste check) */}
      {!loading && checked && (
        <button
          onClick={runCheck}
          className="self-start text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] flex items-center gap-1 transition-colors"
        >
          <span className="material-symbols-outlined text-xs">refresh</span>
          Opnieuw controleren
        </button>
      )}

      {/* Duplicatenlijst */}
      {checked && duplicates.length > 0 && (
        <div>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">
              {dupCount} {dupCount === 1 ? 'duplicaat' : 'duplicaten'} gevonden
              <span className="text-xs text-[var(--text-muted)] ml-2">
                ✓ = uitsluiten van import
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={excludeAll}
                className="text-xs px-2.5 py-1 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors"
              >
                Alles overslaan
              </button>
              <button
                onClick={includeAll}
                className="text-xs px-2.5 py-1 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors"
              >
                Niets overslaan
              </button>
            </div>
          </div>

          {/* Kaarten */}
          <div className="flex flex-col gap-2.5">
            {duplicates.map((d) => {
              const excl = excludedIndices.has(d.idx)
              const row = d.row || {}
              const match = d.match || {}
              return (
                <div
                  key={d.idx}
                  className={`rounded-xl border border-[var(--border)] p-3 transition-opacity ${
                    excl ? 'opacity-55' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <div className="pt-0.5 shrink-0">
                      <input
                        type="checkbox"
                        checked={excl}
                        onChange={() => toggleExclude(d.idx)}
                        className="accent-blue-500 cursor-pointer w-4 h-4"
                        title="Uitsluiten van import"
                      />
                    </div>

                    {/* Vergelijking */}
                    <div className="flex-1 flex items-stretch gap-2 min-w-0">
                      <TrxCard
                        label="Nieuw (CSV)"
                        isNew
                        date={row['Datum'] || ''}
                        amount={row['Bedrag'] || ''}
                        name={row['Naam naar rekening'] || ''}
                        iban={row['Naar IBAN'] || ''}
                        description={row['Transactiedetails'] || ''}
                      />

                      <div className="flex items-center shrink-0 text-[var(--text-muted)]">
                        <span className="material-symbols-outlined text-base">compare_arrows</span>
                      </div>

                      <TrxCard
                        label="Al aanwezig (DB)"
                        isNew={false}
                        date={match.date || ''}
                        amount={match.amount || ''}
                        name={match.counterparty_name || ''}
                        iban={match.counterparty_iban || ''}
                        description={match.description || ''}
                      />
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="mt-1.5 ml-7 text-[10px] text-[var(--text-muted)] flex gap-3">
                    <span>Bestand: {row._fileName}</span>
                    {match.account_name && <span>Rekening: {match.account_name}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Geen duplicaten */}
      {checked && duplicates.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <span className="material-symbols-outlined text-base">check_circle</span>
          Geen duplicaten gevonden — alle {rows.length} transacties zijn nieuw.
        </div>
      )}
    </div>
  )
}
