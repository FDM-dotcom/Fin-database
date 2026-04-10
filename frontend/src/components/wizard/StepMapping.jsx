import { useEffect, useState } from 'react'
import { api } from '@/api'
import { getDefaultMappings } from '@/lib/importHelpers'

function SourceBadge({ col, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 bg-blue-600/20 text-blue-400 text-xs px-2 py-0.5 rounded-full">
      {col}
      {onRemove && (
        <button onClick={onRemove} className="hover:text-red-400 leading-none">×</button>
      )}
    </span>
  )
}

function MappingRow({ target, mapping, availableHeaders, onUpdate }) {
  const [open, setOpen] = useState(false)
  const unused = availableHeaders.filter((h) => !mapping.sourceColumns.includes(h))

  function addSource(col) {
    onUpdate(target, [...mapping.sourceColumns, col], mapping.separator)
    setOpen(false)
  }

  function removeSource(col) {
    onUpdate(target, mapping.sourceColumns.filter((c) => c !== col), mapping.separator)
  }

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[var(--border)] last:border-0">
      {/* Target column label */}
      <div className="w-44 shrink-0 text-sm font-medium text-[var(--text-primary)] pt-1">
        {target}
      </div>

      {/* Source columns + add */}
      <div className="flex-1 flex flex-wrap items-center gap-1.5">
        {mapping.sourceColumns.map((col) => (
          <SourceBadge key={col} col={col} onRemove={() => removeSource(col)} />
        ))}

        {/* Add source */}
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-[var(--text-muted)] hover:text-blue-400 flex items-center gap-0.5 border border-dashed border-[var(--border)] rounded-full px-2 py-0.5"
          >
            <span className="material-symbols-outlined text-xs">add</span>
            Kolom toevoegen
          </button>
          {open && (
            <div className="absolute z-20 top-full left-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl min-w-[200px] max-h-64 overflow-y-auto">
              {unused.length === 0 ? (
                <div className="px-3 py-2 text-xs text-[var(--text-muted)]">Alle kolommen gekoppeld</div>
              ) : (
                unused.map((h) => (
                  <button
                    key={h}
                    onClick={() => addSource(h)}
                    className="block w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-2)] transition-colors"
                  >
                    {h}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Separator (only when multiple sources) */}
        {mapping.sourceColumns.length > 1 && (
          <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <span>sep:</span>
            <input
              value={mapping.separator}
              onChange={(e) => onUpdate(target, mapping.sourceColumns, e.target.value)}
              className="w-14 bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-0.5 text-xs"
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default function StepMapping({ parsedFiles, activeFileIdx, mappings, onMappingsChange, onActiveFileChange, detectedIban }) {
  const [profiles, setProfiles] = useState([])
  const [saveModal, setSaveModal] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [saving, setSaving] = useState(false)

  const activeFile = parsedFiles[activeFileIdx]
  const fileMappings = activeFile ? (mappings[activeFile.id] || getDefaultMappings(activeFile.bankType)) : []

  useEffect(() => {
    api.mappingProfiles.list().then(setProfiles).catch(console.error)
  }, [])

  // Initialize mappings when file changes
  useEffect(() => {
    if (!activeFile) return
    if (!mappings[activeFile.id]) {
      onMappingsChange(activeFile.id, getDefaultMappings(activeFile.bankType))
    }
  }, [activeFile?.id])

  function updateMapping(target, sourceColumns, separator) {
    const updated = fileMappings.map((m) =>
      m.targetColumn === target ? { ...m, sourceColumns, separator } : m
    )
    onMappingsChange(activeFile.id, updated)
  }

  async function saveProfile() {
    if (!profileName.trim() || !activeFile) return
    setSaving(true)
    try {
      const p = await api.mappingProfiles.create({
        name: profileName.trim(),
        bank_type: activeFile.bankType,
        mappings: fileMappings,
      })
      setProfiles((prev) => [...prev, p])
      setSaveModal(false)
      setProfileName('')
    } catch (e) {
      alert('Opslaan mislukt: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  function loadProfile(profile) {
    if (!activeFile) return
    onMappingsChange(activeFile.id, profile.mappings)
  }

  async function deleteProfile(id) {
    await api.mappingProfiles.delete(id).catch(console.error)
    setProfiles((prev) => prev.filter((p) => p.id !== id))
  }

  if (!activeFile) {
    return <div className="text-sm text-[var(--text-muted)]">Geen bestand geselecteerd.</div>
  }

  const bankProfiles = profiles.filter((p) => p.bank_type === activeFile.bankType)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold mb-1">Kolommen koppelen</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Koppel de CSV-kolommen van <strong>{activeFile.fileName}</strong> aan de standaard velden.
          Je kunt meerdere kolommen samenvoegen met een scheidingsteken.
        </p>
      </div>

      {/* Gedetecteerd eigen IBAN */}
      {detectedIban ? (
        <div className="flex items-center gap-2 text-sm bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2">
          <span className="material-symbols-outlined text-base text-green-400">account_balance</span>
          <span className="text-green-400 font-medium">Eigen rekening:</span>
          <span className="font-mono text-xs">{detectedIban}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2">
          <span className="material-symbols-outlined text-base text-orange-400">warning</span>
          <span className="text-orange-400">
            Koppel <strong>Van IBAN</strong> aan een bronkolom om de eigen rekening automatisch te detecteren.
          </span>
        </div>
      )}

      {/* File tabs (multiple files) */}
      {parsedFiles.length > 1 && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1 flex-wrap">
            {parsedFiles.map((pf, i) => (
              <button
                key={pf.id}
                onClick={() => onActiveFileChange?.(i)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  i === activeFileIdx
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-[var(--border)] hover:bg-[var(--surface-2)]'
                }`}
              >
                {pf.fileName}
              </button>
            ))}
          </div>
          {/* Toon info-banner als er meerdere bestanden van hetzelfde banktype zijn */}
          {parsedFiles.filter((f) => f.bankType === activeFile.bankType).length > 1 && (
            <div className="flex items-center gap-2 text-xs bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2">
              <span className="material-symbols-outlined text-sm text-blue-400">info</span>
              <span className="text-blue-400">
                Mapping geldt automatisch voor alle{' '}
                <strong>{parsedFiles.filter((f) => f.bankType === activeFile.bankType).length}</strong>{' '}
                {activeFile.bankType}-bestanden.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Saved profiles */}
      {bankProfiles.length > 0 && (
        <div>
          <div className="text-xs text-[var(--text-muted)] mb-1.5 font-medium">Opgeslagen profielen</div>
          <div className="flex flex-wrap gap-1.5">
            {bankProfiles.map((p) => (
              <div key={p.id} className="flex items-center gap-1">
                <button
                  onClick={() => loadProfile(p)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-[var(--surface-2)] hover:bg-blue-600/20 hover:text-blue-400 transition-colors border border-[var(--border)]"
                >
                  {p.name}
                </button>
                <button
                  onClick={() => deleteProfile(p.id)}
                  className="text-[var(--text-muted)] hover:text-red-400"
                  title="Profiel verwijderen"
                >
                  <span className="material-symbols-outlined text-xs">close</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mapping rows */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] divide-y-0 overflow-hidden">
        <div className="px-4 py-2 border-b border-[var(--border)] flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--text-muted)]">Doelkolom → Bronkolommen</span>
          <button
            onClick={() => setSaveModal(true)}
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-xs">save</span>
            Profiel opslaan
          </button>
        </div>

        <div className="px-4">
          {fileMappings.map((m) => (
            <MappingRow
              key={m.targetColumn}
              target={m.targetColumn}
              mapping={m}
              availableHeaders={activeFile.headers}
              onUpdate={updateMapping}
            />
          ))}
        </div>
      </div>

      {/* Save modal */}
      {saveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 w-80 shadow-2xl">
            <h3 className="font-semibold mb-3">Profiel opslaan</h3>
            <input
              autoFocus
              placeholder="Naam bijv. Rabobank standaard"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveProfile()}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setSaveModal(false)}
                className="px-3 py-1.5 text-sm rounded-lg hover:bg-[var(--surface-2)]"
              >
                Annuleren
              </button>
              <button
                onClick={saveProfile}
                disabled={saving || !profileName.trim()}
                className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Opslaan...' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
