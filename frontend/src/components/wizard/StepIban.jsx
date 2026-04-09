import { useEffect, useState } from 'react'
import { api } from '@/api'
import { applyMappingToRows, getDefaultMappings } from '@/lib/importHelpers'

export default function StepIban({ parsedFiles, mappings, duplicateState }) {
  const [aliases, setAliases] = useState({}) // {iban: displayName}
  const [saving, setSaving] = useState({})
  const [saved, setSaved] = useState({})
  const [unknownIbans, setUnknownIbans] = useState([]) // [{iban, count}]
  const [names, setNames] = useState({}) // {iban: inputValue}

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [existing] = await Promise.all([api.ibanAliases.list()])
      const map = {}
      for (const a of existing) map[a.iban] = a.display_name
      setAliases(map)
      computeUnknown(map)
    } catch (e) {
      console.error('Laden aliassen mislukt:', e)
      computeUnknown({})
    }
  }

  function computeUnknown(existingMap) {
    const { excludedIds = new Set(), rows = [] } = duplicateState || {}
    const ibanCounts = {}

    const activeRows = rows.filter((r) => !excludedIds.has(r._extId))
    for (const row of activeRows) {
      const iban = (row['Naar IBAN'] || '').trim().toUpperCase()
      if (iban && !existingMap[iban]) {
        ibanCounts[iban] = (ibanCounts[iban] || 0) + 1
      }
    }

    const sorted = Object.entries(ibanCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([iban, count]) => ({ iban, count }))

    setUnknownIbans(sorted)

    // Pre-fill names from existing aliases
    const initNames = {}
    for (const { iban } of sorted) {
      initNames[iban] = existingMap[iban] || ''
    }
    setNames(initNames)
  }

  async function saveAlias(iban) {
    const name = (names[iban] || '').trim()
    if (!name) return
    setSaving((p) => ({ ...p, [iban]: true }))
    try {
      await api.ibanAliases.create({ iban, display_name: name })
      setAliases((p) => ({ ...p, [iban]: name }))
      setSaved((p) => ({ ...p, [iban]: true }))
    } catch (e) {
      alert('Opslaan mislukt: ' + e.message)
    } finally {
      setSaving((p) => ({ ...p, [iban]: false }))
    }
  }

  async function saveAll() {
    const toSave = unknownIbans.filter(({ iban }) => (names[iban] || '').trim())
    for (const { iban } of toSave) {
      await saveAlias(iban)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold mb-1">IBAN verrijking</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Geef namen aan onbekende tegenpartijrekeningen uit dit importbestand.
          Deze namen worden opgeslagen als alias en worden in de toekomst automatisch herkend.
        </p>
      </div>

      {unknownIbans.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <span className="material-symbols-outlined text-base">check_circle</span>
          Alle tegenpartijrekeningen zijn al bekend.
        </div>
      )}

      {unknownIbans.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-muted)]">
              {unknownIbans.length} onbekende rekeningen gevonden
            </span>
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
                  <th className="px-4 py-2 text-left font-medium">Transacties</th>
                  <th className="px-4 py-2 text-left font-medium">Naam</th>
                  <th className="px-4 py-2 w-24" />
                </tr>
              </thead>
              <tbody>
                {unknownIbans.map(({ iban, count }) => (
                  <tr key={iban} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2 font-mono text-xs">{iban}</td>
                    <td className="px-4 py-2 text-[var(--text-muted)] text-xs">{count}×</td>
                    <td className="px-4 py-2">
                      <input
                        value={names[iban] || ''}
                        onChange={(e) => setNames((p) => ({ ...p, [iban]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && saveAlias(iban)}
                        placeholder="Naam tegenpartij…"
                        className={`w-full bg-[var(--surface-2)] border rounded px-2 py-1 text-sm transition-colors ${
                          saved[iban]
                            ? 'border-green-500'
                            : 'border-[var(--border)] focus:border-blue-500'
                        }`}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => saveAlias(iban)}
                        disabled={saving[iban] || !(names[iban] || '').trim()}
                        className="text-xs px-2.5 py-1 rounded bg-[var(--surface-2)] hover:bg-blue-600/20 hover:text-blue-400 disabled:opacity-40 flex items-center gap-1 whitespace-nowrap"
                      >
                        {saved[iban] ? (
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
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Existing aliases summary */}
      {Object.keys(aliases).length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            {Object.keys(aliases).length} bekende aliassen
          </summary>
          <div className="mt-2 rounded-lg border border-[var(--border)] overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[var(--surface-2)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-1.5 text-left">IBAN</th>
                  <th className="px-3 py-1.5 text-left">Naam</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(aliases).map(([iban, name]) => (
                  <tr key={iban} className="border-t border-[var(--border)]">
                    <td className="px-3 py-1.5 font-mono">{iban}</td>
                    <td className="px-3 py-1.5">{name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
