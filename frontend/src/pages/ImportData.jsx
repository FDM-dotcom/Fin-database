import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

export default function ImportData({ dark }) {
  const [accounts, setAccounts] = useState([])
  const [files, setFiles] = useState([])
  const [accountIban, setAccountIban] = useState('')
  const [runCategorize, setRunCategorize] = useState(true)
  const [results, setResults] = useState([])
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

  const bg = dark ? 'bg-[#1c110b]' : 'bg-[#fff8f6]'
  const text = dark ? 'text-[#f6ddd4]' : 'text-[#251913]'
  const muted = dark ? 'text-[#f6ddd4]/50' : 'text-[#251913]/50'
  const cardBg = dark ? 'bg-[#251913]' : 'bg-[#fff1ec]'
  const inputBg = dark ? 'bg-[#170c07] text-[#f6ddd4] border-[#594238]' : 'bg-white text-[#251913] border-[#e0c0b2]'

  useEffect(() => {
    api.accounts.list().then(setAccounts).catch(() => {})
  }, [])

  function addFiles(newFiles) {
    const arr = Array.from(newFiles).filter(f => f.name.endsWith('.csv'))
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name))
      return [...prev, ...arr.filter(f => !existing.has(f.name))]
    })
  }

  function removeFile(name) {
    setFiles(fs => fs.filter(f => f.name !== name))
  }

  async function handleImport() {
    if (files.length === 0) return
    setImporting(true)
    setResults([])
    const newResults = []
    for (const file of files) {
      try {
        const res = await api.import(file, accountIban || null, runCategorize)
        newResults.push({ file: file.name, ...res, ok: true })
      } catch (e) {
        newResults.push({ file: file.name, ok: false, error: e.message })
      }
    }
    setResults(newResults)
    setFiles([])
    setImporting(false)
  }

  return (
    <div className={`p-8 min-h-screen ${bg}`}>
      {/* Header */}
      <header className="mb-10">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-6 bg-gradient-to-b from-[#f46c22] to-[#ffb595] rounded-full" />
          <span className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-[#F46C22]' : 'text-[#a23f00]'}`}>
            Data Import
          </span>
        </div>
        <h2 className={`text-4xl font-extrabold tracking-tighter ${text}`}>IMPORT DATA</h2>
        <p className={`text-sm mt-1 ${muted}`}>Importeer CSV-exports van Rabobank of bunq</p>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* Left: Drop zone + queue */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
            onClick={() => fileRef.current.click()}
            className={`relative group p-12 flex flex-col items-center justify-center rounded-xl border-2 border-dashed cursor-pointer transition-all ${
              dragOver
                ? 'border-[#F46C22] bg-[#F46C22]/5'
                : dark ? 'border-[#594238]/40 hover:border-[#F46C22]/50 bg-[#251913]' : 'border-[#e0c0b2]/60 hover:border-[#F46C22]/50 bg-[#fff1ec]'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              multiple
              className="hidden"
              onChange={e => addFiles(e.target.files)}
            />
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${dark ? 'bg-[#40312b] text-[#F46C22]' : 'bg-[#fce3da] text-[#a23f00]'}`}>
              <span className="material-symbols-outlined text-3xl">upload</span>
            </div>
            <h3 className={`text-lg font-bold mb-1 ${text}`}>Sleep CSV-bestanden hierheen</h3>
            <p className={`text-sm text-center max-w-xs mb-5 ${muted}`}>
              Rabobank en bunq CSV-exports worden automatisch herkend
            </p>
            <button className="px-6 py-2.5 bg-gradient-to-r from-[#f46c22] to-[#ffb595] text-[#571e00] font-bold rounded-lg text-sm">
              Bestanden kiezen
            </button>
            <p className={`mt-5 text-[10px] uppercase tracking-widest font-bold ${muted}`}>
              Alleen .CSV • Max 50 MB
            </p>
          </div>

          {/* File queue */}
          {files.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>
                  Wachtrij ({files.length})
                </h3>
                <button onClick={() => setFiles([])} className="text-[#F46C22] text-xs font-bold hover:underline">
                  Alles verwijderen
                </button>
              </div>
              {files.map(f => (
                <div key={f.name} className={`${cardBg} rounded-xl p-4 flex items-center gap-4`}>
                  <div className={`w-10 h-10 rounded flex items-center justify-center ${dark ? 'bg-[#40312b] text-[#8ccdff]' : 'bg-[#fff8f6] text-[#006493]'}`}>
                    <span className="material-symbols-outlined">description</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm truncate ${text}`}>{f.name}</p>
                    <p className={`text-[10px] ${muted}`}>{(f.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button onClick={() => removeFile(f.name)} className={`p-2 transition-colors ${muted} hover:text-red-400`}>
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              ))}
            </section>
          )}

          {/* Import results */}
          {results.length > 0 && (
            <section className="space-y-3">
              <h3 className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>Resultaten</h3>
              {results.map((r, i) => (
                <div
                  key={i}
                  className={`${cardBg} rounded-xl p-5 border-l-4 ${r.ok ? 'border-[#F46C22]' : 'border-red-500'}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className={`font-bold text-sm ${text}`}>{r.file}</p>
                      {r.ok ? (
                        <p className={`text-xs mt-1 ${muted}`}>
                          <span className="text-[#F46C22] font-bold">{r.inserted}</span> ingevoegd &nbsp;·&nbsp;
                          <span className={muted}>{r.skipped} overgeslagen</span>
                          {r.categorization && (
                            <> &nbsp;·&nbsp; <span className="text-[#8ccdff] font-bold">{r.categorization.changed}</span> gecategoriseerd</>
                          )}
                        </p>
                      ) : (
                        <p className="text-xs mt-1 text-red-400">{r.error}</p>
                      )}
                    </div>
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${r.ok ? 'bg-[#F46C22]/10 text-[#F46C22]' : 'bg-red-500/10 text-red-400'}`}>
                      {r.ok ? 'Klaar' : 'Fout'}
                    </span>
                  </div>
                  {r.errors?.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {r.errors.map((e, j) => (
                        <li key={j} className="text-[10px] text-red-400">✗ {e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>

        {/* Right: Options + summary */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          {/* Import options */}
          <div className={`${cardBg} rounded-xl overflow-hidden`}>
            <div className={`px-6 py-4 ${dark ? 'bg-[#352721]/50' : 'bg-[#fce3da]'}`}>
              <h3 className={`text-xs font-black uppercase tracking-[0.2em] ${text}`}>Importopties</h3>
            </div>
            <div className="p-6 space-y-5">
              {/* Account IBAN override */}
              <div className="space-y-2">
                <label className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>
                  IBAN overschrijven
                </label>
                {accounts.length > 0 ? (
                  <select
                    value={accountIban}
                    onChange={e => setAccountIban(e.target.value)}
                    className={`w-full px-3 py-2.5 rounded border text-sm focus:outline-none focus:ring-1 focus:ring-[#F46C22] ${inputBg}`}
                  >
                    <option value="">Automatisch (uit CSV)</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.iban}>{a.name} — {a.iban}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={accountIban}
                    onChange={e => setAccountIban(e.target.value)}
                    placeholder="NL69RABO0376834404"
                    className={`w-full px-3 py-2.5 rounded border text-sm focus:outline-none focus:ring-1 focus:ring-[#F46C22] ${inputBg}`}
                  />
                )}
                <p className={`text-[10px] ${muted}`}>Laat leeg om IBAN automatisch te herkennen uit de CSV</p>
              </div>

              {/* Categorize toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-xs font-bold ${text}`}>Direct categoriseren</p>
                  <p className={`text-[10px] mt-0.5 ${muted}`}>Regels toepassen na import</p>
                </div>
                <button
                  onClick={() => setRunCategorize(c => !c)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${runCategorize ? 'bg-[#F46C22]' : dark ? 'bg-[#40312b]' : 'bg-[#e0c0b2]'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${runCategorize ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Summary */}
              <div className={`pt-4 border-t ${dark ? 'border-[#594238]/30' : 'border-[#e0c0b2]/50'} space-y-2`}>
                <div className="flex justify-between text-sm">
                  <span className={muted}>Bestanden in wachtrij</span>
                  <span className={`font-bold ${text}`}>{files.length}</span>
                </div>
              </div>

              <button
                onClick={handleImport}
                disabled={files.length === 0 || importing}
                className="w-full py-4 bg-gradient-to-r from-[#f46c22] to-[#ffb595] text-[#571e00] font-black uppercase text-sm rounded-lg disabled:opacity-50 transition-transform active:scale-95 shadow-lg flex items-center justify-center gap-2"
              >
                {importing ? (
                  <>
                    <span className="material-symbols-outlined text-base animate-spin">sync</span>
                    Importeren...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">rocket_launch</span>
                    Import starten
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Info */}
          <div className={`${dark ? 'bg-[#2a1d17]' : 'bg-[#fff8f6]'} rounded-xl p-6`}>
            <div className={`flex items-center gap-3 mb-4 text-[#8ccdff]`}>
              <span className="material-symbols-outlined">info</span>
              <h3 className="text-xs font-bold uppercase tracking-widest">Ondersteunde formaten</h3>
            </div>
            <ul className="space-y-3">
              {[
                { bank: 'Rabobank', detail: 'Alle CSV-kolommen opgeslagen, Volgnr als unieke ID' },
                { bank: 'bunq', detail: 'Puntkomma-gescheiden, HTML-entities gedecodeerd' },
              ].map(b => (
                <li key={b.bank} className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-sm mt-0.5 text-[#F46C22]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <div>
                    <p className={`text-xs font-bold ${text}`}>{b.bank}</p>
                    <p className={`text-[10px] ${muted}`}>{b.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
