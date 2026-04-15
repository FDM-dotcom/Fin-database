import { useEffect, useMemo, useState } from 'react'
import { api } from '@/api'
import { applyMappingToRows, getDefaultMappings } from '@/lib/importHelpers'

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/**
 * Verzamel actieve rijen (niet uitgesloten als duplicaat) over alle bestanden.
 * Geeft terug: [{vanIban, naarIban, naarName}]
 */
function collectActiveRows(parsedFiles, mappings, duplicateState) {
  const { excludedIndices = new Set(), rows = [] } = duplicateState || {}

  // Als de duplicate-stap is doorlopen, gebruik die rijen
  if (rows.length > 0) {
    return rows
      .filter((_, i) => !excludedIndices.has(i))
      .map((row) => ({
        vanIban:  (row['Van IBAN']  || '').trim().toUpperCase(),
        naarIban: (row['Naar IBAN'] || '').trim().toUpperCase(),
        naarName: (row['Naam naar rekening'] || '').trim(),
      }))
  }

  // Fallback: stap 3 overgeslagen — alle rijen
  const result = []
  for (const pf of parsedFiles) {
    const fileMappings = mappings[pf.id] || getDefaultMappings(pf.bankType)
    const mapped = applyMappingToRows(pf.rows, fileMappings, pf.bankType)
    for (const row of mapped) {
      result.push({
        vanIban:  (row['Van IBAN']  || '').trim().toUpperCase(),
        naarIban: (row['Naar IBAN'] || '').trim().toUpperCase(),
        naarName: (row['Naam naar rekening'] || '').trim(),
      })
    }
  }
  return result
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

function SectionHeader({ icon, title, count, color = 'text-[var(--text-muted)]' }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className={`material-symbols-outlined text-base ${color}`}>{icon}</span>
      <span className="text-sm font-medium">{title}</span>
      {count !== undefined && (
        <span className="text-xs text-[var(--text-muted)]">({count})</span>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// Hoofdcomponent
// ------------------------------------------------------------------

export default function AccountsStep({ parsedFiles, mappings, duplicateState }) {
  const [loading, setLoading] = useState(true)
  const [ownAccounts, setOwnAccounts] = useState([])     // [{id, name, iban, institution}]
  const [existingAliases, setExistingAliases] = useState({}) // {iban: display_name}
  const [dbSuggestions, setDbSuggestions] = useState({})    // {iban: name|null}
  const [inputNames, setInputNames] = useState({})          // {iban: value}
  const [saving, setSaving] = useState({})                  // {iban: bool}
  const [savedIbans, setSavedIbans] = useState(new Set())

  // Verzamel actieve rijen
  const activeRows = useMemo(
    () => collectActiveRows(parsedFiles, mappings, duplicateState),
    [parsedFiles, mappings, duplicateState],
  )

  // Tegenpartij-IBANs (Naar IBAN)
  const counterpartyData = useMemo(() => {
    const counts = {}
    const csvNames = {}
    for (const { naarIban, naarName } of activeRows) {
      if (!naarIban) continue
      counts[naarIban] = (counts[naarIban] || 0) + 1
      if (!csvNames[naarIban] && naarName) csvNames[naarIban] = naarName
    }
    return { counts, csvNames }
  }, [activeRows])

  const { counts: cpCounts, csvNames } = counterpartyData
  const allNaarIbans = Object.keys(cpCounts).sort()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [accounts, aliases] = await Promise.all([
        api.accounts.list(),
        api.ibanAliases.list(),
      ])

      setOwnAccounts(accounts.filter((a) => a.iban))

      const aliasMap = {}
      for (const a of aliases) aliasMap[a.iban] = a.display_name
      setExistingAliases(aliasMap)

      // DB-suggesties voor onbekende tegenpartij-IBANs
      const ownIbanSet = new Set(accounts.filter((a) => a.iban).map((a) => a.iban))
      const unknownCp = allNaarIbans.filter((ib) => !aliasMap[ib] && !ownIbanSet.has(ib))
      let suggestions = {}
      if (unknownCp.length > 0) {
        suggestions = await api.aliases.nameLookup(unknownCp).catch(() => ({}))
      }
      setDbSuggestions(suggestions)

      // Pre-fill input names: alias > CSV-naam > DB-suggestie
      const init = {}
      for (const iban of allNaarIbans) {
        if (!aliasMap[iban] && !ownIbanSet.has(iban)) {
          init[iban] = csvNames[iban] || suggestions[iban] || ''
        }
      }
      setInputNames(init)
    } catch (e) {
      console.error('Laden rekeningdata mislukt:', e)
    } finally {
      setLoading(false)
    }
  }

  const ownIbanSet = useMemo(
    () => new Set(ownAccounts.map((a) => a.iban)),
    [ownAccounts],
  )

  // Sectie A: eigen rekeningen die voorkomen als Van IBAN of Naar IBAN
  const ownAccountsInImport = useMemo(() => {
    const allIbansInImport = new Set([
      ...activeRows.map((r) => r.vanIban).filter(Boolean),
      ...allNaarIbans,
    ])
    return ownAccounts.filter((a) => allIbansInImport.has(a.iban))
  }, [ownAccounts, activeRows, allNaarIbans])

  // Interne overboekingen teller: transacties waarbij BEIDE Van en Naar eigen rekeningen zijn
  const internalTransferCount = useMemo(() => {
    return activeRows.filter(
      ({ vanIban, naarIban }) =>
        vanIban && naarIban && ownIbanSet.has(vanIban) && ownIbanSet.has(naarIban),
    ).length
  }, [activeRows, ownIbanSet])

  // Sectie B: bekende aliassen (niet eigen rekening)
  const knownAliasCpIbans = allNaarIbans.filter(
    (ib) => existingAliases[ib] && !ownIbanSet.has(ib),
  )

  // Sectie C: onbekende tegenpartijen
  const unknownCpIbans = allNaarIbans.filter(
    (ib) => !existingAliases[ib] && !ownIbanSet.has(ib),
  )

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
    for (const iban of unknownCpIbans) {
      if ((inputNames[iban] || '').trim()) await saveAlias(iban)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-[var(--text-muted)]">
        <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
        Rekeninggegevens laden…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Rekeningen herkennen</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Bekende eigen rekeningen worden automatisch herkend. Geef onbekende tegenpartijen een naam
          zodat ze als alias worden opgeslagen voor toekomstige imports.
        </p>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Sectie A — Eigen rekeningen                                       */}
      {/* ---------------------------------------------------------------- */}
      {ownAccountsInImport.length > 0 && (
        <div>
          <SectionHeader
            icon="account_balance"
            title="Eigen rekeningen"
            count={ownAccountsInImport.length}
            color="text-blue-400"
          />

          {internalTransferCount > 0 && (
            <div className="flex items-center gap-2 text-xs bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2 mb-3">
              <span className="material-symbols-outlined text-sm text-blue-400">swap_horiz</span>
              <span className="text-blue-400">
                <strong>{internalTransferCount}</strong>{' '}
                {internalTransferCount === 1
                  ? 'transactie wordt als interne overboeking gemarkeerd'
                  : 'transacties worden als interne overboeking gemarkeerd'}
                {' '}(beide kanten zijn eigen rekeningen)
              </span>
            </div>
          )}

          <div className="rounded-xl border border-[var(--border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-2)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">IBAN</th>
                  <th className="px-4 py-2 text-left font-medium">Rekeningnaam</th>
                  <th className="px-4 py-2 text-left font-medium">Bank</th>
                  <th className="px-4 py-2 text-right font-medium">Transacties</th>
                </tr>
              </thead>
              <tbody>
                {ownAccountsInImport.map((acc) => (
                  <tr key={acc.iban} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2 font-mono text-xs">{acc.iban}</td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-blue-400">
                          verified
                        </span>
                        {acc.name}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-[var(--text-muted)]">
                      {acc.institution}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-[var(--text-muted)] tabular-nums">
                      {cpCounts[acc.iban] ? `${cpCounts[acc.iban]}×` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Sectie B — Bekende tegenrekeningen                               */}
      {/* ---------------------------------------------------------------- */}
      {knownAliasCpIbans.length > 0 && (
        <div>
          <SectionHeader
            icon="check_circle"
            title="Bekende tegenrekeningen"
            count={knownAliasCpIbans.length}
            color="text-green-400"
          />
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
                {knownAliasCpIbans.map((iban) => (
                  <tr key={iban} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2 font-mono text-xs">{iban}</td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-green-400">
                          check_circle
                        </span>
                        {existingAliases[iban]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-[var(--text-muted)] tabular-nums">
                      {cpCounts[iban]}×
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Sectie C — Onbekende rekeningen                                   */}
      {/* ---------------------------------------------------------------- */}
      {unknownCpIbans.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <SectionHeader
              icon="help"
              title="Onbekende rekeningen"
              count={unknownCpIbans.length}
              color="text-orange-400"
            />
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
                {unknownCpIbans.map((iban) => {
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
                              suggestion ? `Suggestie: ${suggestion}` : 'Naam tegenpartij…'
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
                        {cpCounts[iban]}×
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

          {unknownCpIbans.some((ib) => dbSuggestions[ib]) && (
            <p className="text-xs text-[var(--text-muted)] mt-2">
              <span className="material-symbols-outlined text-xs align-middle">lightbulb</span>
              {' '}Suggesties zijn gebaseerd op namen uit eerdere transacties.
            </p>
          )}
        </div>
      )}

      {/* Leeg scherm */}
      {ownAccountsInImport.length === 0 &&
        knownAliasCpIbans.length === 0 &&
        unknownCpIbans.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10 text-[var(--text-muted)]">
            <span className="material-symbols-outlined text-3xl">account_balance_wallet</span>
            <p className="text-sm">
              Geen IBAN-gegevens gevonden. Controleer of{' '}
              <strong>Van IBAN</strong> en <strong>Naar IBAN</strong> correct zijn gekoppeld in stap 2.
            </p>
          </div>
        )}
    </div>
  )
}
