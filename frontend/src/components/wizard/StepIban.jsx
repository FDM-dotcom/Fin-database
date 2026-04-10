import { useEffect, useState } from 'react'
import { api } from '@/api'
import { applyMappingToRows, getDefaultMappings } from '@/lib/importHelpers'

// ------------------------------------------------------------------
// Hulpfuncties
// ------------------------------------------------------------------

/** Verzamel unieke tegenpartij-IBANs + aantallen + CSV-naam per IBAN */
function collectIbans(parsedFiles, mappings, duplicateState) {
  const { excludedIds = new Set(), rows = [] } = duplicateState || {}
  const activeRows = rows.filter((r) => !excludedIds.has(r._extId))

  const counts = {}   // {iban: count}
  const csvNames = {} // {iban: first name from CSV}

  for (const row of activeRows) {
    const iban = (row['Naar IBAN'] || '').trim().toUpperCase()
    if (!iban) continue
    counts[iban] = (counts[iban] || 0) + 1
    if (!csvNames[iban] && row['Naam naar rekening']) {
      csvNames[iban] = row['Naam naar rekening'].trim()
    }
  }

  return { counts, csvNames }
}

// ------------------------------------------------------------------
// Sub-componenten
// ------------------------------------------------------------------

function Badge({ recognized }) {
  return recognized ? (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
      Herkend
    </span>
  ) : (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
      Onbekend
    </span>
  )
}

function ProgressBar({ recognized, total }) {
  const pct = total === 0 ? 0 : Math.round((recognized / total) * 100)
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="font-medium">IBAN herkenning</span>
        <span className="tabular-nums text-[var(--text-muted)]">
          {recognized} van {total} herkend ({pct}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="h-full rounded-full bg-green-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// Hoofd-component
// ------------------------------------------------------------------

export default function StepIban({ parsedFiles, mappings, duplicateState }) {
  const [loading, setLoading] = useState(true)
  const [existingAliases, setExistingAliases] = useState({}) // {iban: name}
  const [dbSuggestions, setDbSuggestions] = useState({})     // {iban: name|null}
  const [inputNames, setInputNames] = useState({})           // {iban: value}
  const [saving, setSaving] = useState({})                   // {iban: bool}
  const [savedIbans, setSavedIbans] = useState(new Set())

  const { counts, csvNames } = collectIbans(parsedFiles, mappings, duplicateState)
  const allIbans = Object.keys(counts).sort()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      // Laad bestaande aliassen
      const aliases = await api.ibanAliases.list()
      const aliasMap = {}
      for (const a of aliases) aliasMap[a.iban] = a.display_name
      setExistingAliases(aliasMap)

      // Zoek DB-suggesties op voor IBANs zonder alias
      const unknownIbans = allIbans.filter((ib) => !aliasMap[ib])
      let suggestions = {}
      if (unknownIbans.length > 0) {
        suggestions = await api.aliases.nameLookup(unknownIbans).catch(() => ({}))
      }
      setDbSuggestions(suggestions)

      // Pre-vul invoervelden: alias > CSV-naam > DB-suggestie
      const init = {}
      for (const iban of allIbans) {
        if (aliasMap[iban]) {
          // Al herkend — geen invoer nodig
        } else {
          init[iban] = csvNames[iban] || suggestions[iban] || ''
        }
      }
      setInputNames(init)
    } catch (e) {
      console.error('Laden IBAN-data mislukt:', e)
    } finally {
      setLoading(false)
    }
  }

  async function saveAlias(iban) {
    const name = (inputNames[iban] || '').trim()
    if (!name) return
    setSaving((p) => ({ ...p, [iban]: true }))
    try {
      await api.ibanAliases.create({ iban, display_name: name })
      setExistingAliases((p) => ({ ...p, [iban]: name }))
      setSavedIbans((p) => new Set([...p, iban]))
    } catch (e) {
      alert('Opslaan mislukt: ' + e.message)
    } finally {
      setSaving((p) => ({ ...p, [iban]: false }))
    }
  }

  async function saveAll() {
    const toSave = unknownIbans.filter((ib) => (inputNames[ib] || '').trim())
    for (const iban of toSave) {
      await saveAlias(iban)
    }
  }

  // Verdeel in herkend en onbekend na laden
  const recognizedIbans = allIbans.filter((ib) => existingAliases[ib])
  const unknownIbans = allIbans.filter((ib) => !existingAliases[ib])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-[var(--text-muted)]">
        <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
        IBAN-gegevens laden…
      </div>
    )
  }

  if (allIbans.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-semibold mb-1">IBAN verrijking</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Geen tegenpartij-IBANs gevonden in de import. Controleer of de kolom
            <strong> Naar IBAN</strong> correct is gekoppeld in stap 2.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold mb-1">IBAN verrijking</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Koppel namen aan tegenpartijrekeningen uit dit importbestand.
          Bekende rekeningen worden automatisch herkend.
        </p>
      </div>

      {/* Progress bar */}
      <ProgressBar recognized={recognizedIbans.length} total={allIbans.length} />

      {/* --- Herkende IBANs --- */}
      {recognizedIbans.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium">Herkend</span>
            <Badge recognized={true} />
            <span className="text-xs text-[var(--text-muted)]">({recognizedIbans.length})</span>
          </div>
          <div className="rounded-xl border border-[var(--border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-2)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">IBAN</th>
                  <th className="px-4 py-2 text-left font-medium">Gekoppelde naam</th>
                  <th className="px-4 py-2 text-right font-medium">Transacties</th>
                </tr>
              </thead>
              <tbody>
                {recognizedIbans.map((iban) => (
                  <tr key={iban} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2 font-mono text-xs">{iban}</td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-green-400">check_circle</span>
                        {existingAliases[iban]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-[var(--text-muted)] tabular-nums">
                      {counts[iban]}×
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- Onbekende IBANs --- */}
      {unknownIbans.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Onbekend</span>
              <Badge recognized={false} />
              <span className="text-xs text-[var(--text-muted)]">({unknownIbans.length})</span>
            </div>
            <button
              onClick={saveAll}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-xs">save</span>
              Alles opslaan
            </button>
          </div>

          <div className="rounded-xl border border-[var(--border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-2)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">IBAN</th>
                  <th className="px-4 py-2 text-left font-medium">Naam invoeren</th>
                  <th className="px-4 py-2 text-right font-medium">Transacties</th>
                  <th className="px-4 py-2 w-28" />
                </tr>
              </thead>
              <tbody>
                {unknownIbans.map((iban) => {
                  const isSaved = savedIbans.has(iban)
                  const suggestion = dbSuggestions[iban]
                  const hasCsvName = !!csvNames[iban]

                  return (
                    <tr key={iban} className="border-t border-[var(--border)]">
                      <td className="px-4 py-2 font-mono text-xs">{iban}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-col gap-0.5">
                          <input
                            value={inputNames[iban] || ''}
                            onChange={(e) =>
                              setInputNames((p) => ({ ...p, [iban]: e.target.value }))
                            }
                            onKeyDown={(e) => e.key === 'Enter' && saveAlias(iban)}
                            placeholder={
                              suggestion
                                ? `Suggestie: ${suggestion}`
                                : 'Naam tegenpartij…'
                            }
                            className={[
                              'w-full bg-[var(--surface-2)] border rounded px-2 py-1 text-sm transition-colors focus:outline-none',
                              isSaved
                                ? 'border-green-500 focus:border-green-500'
                                : 'border-[var(--border)] focus:border-blue-500',
                            ].join(' ')}
                          />
                          {hasCsvName && !isSaved && (
                            <span className="text-xs text-[var(--text-muted)]">
                              Uit CSV: {csvNames[iban]}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-[var(--text-muted)] tabular-nums align-top pt-3">
                        {counts[iban]}×
                      </td>
                      <td className="px-4 py-2 align-top pt-2">
                        <button
                          onClick={() => saveAlias(iban)}
                          disabled={saving[iban] || !(inputNames[iban] || '').trim()}
                          className="text-xs px-2.5 py-1 rounded bg-[var(--surface-2)] border border-[var(--border)] hover:bg-blue-600/20 hover:text-blue-400 disabled:opacity-40 flex items-center gap-1 whitespace-nowrap w-full justify-center"
                        >
                          {isSaved ? (
                            <>
                              <span className="material-symbols-outlined text-xs text-green-400">check</span>
                              Opgeslagen
                            </>
                          ) : saving[iban] ? (
                            'Opslaan…'
                          ) : (
                            'Opslaan'
                          )}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {unknownIbans.some((ib) => dbSuggestions[ib]) && (
            <p className="text-xs text-[var(--text-muted)] mt-2">
              <span className="material-symbols-outlined text-xs align-middle">lightbulb</span>
              {' '}Suggesties (grijze placeholder) zijn gebaseerd op namen uit eerdere transacties.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
