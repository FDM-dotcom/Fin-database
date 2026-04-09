import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

// ── Helpers ────────────────────────────────────────────────────────────────

function groupCategories(cats) {
  const tree = {}
  for (const c of cats) {
    const main = c.category
    const sub  = c.subcategory || '—'
    if (!tree[main]) tree[main] = { total: 0, subs: {} }
    if (!tree[main].subs[sub]) tree[main].subs[sub] = { total: 0, destinations: [] }
    tree[main].total += c.transaction_count
    tree[main].subs[sub].total += c.transaction_count
    if (c.destination) {
      tree[main].subs[sub].destinations.push({ name: c.destination, count: c.transaction_count, id: c.id })
    } else {
      tree[main].subs[sub].id = c.id
    }
  }
  return tree
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Configuratie({ dark }) {
  const [tab, setTab] = useState('aliases')

  const bg       = dark ? 'bg-[#1c110b]'      : 'bg-[#fff8f6]'
  const text      = dark ? 'text-[#f6ddd4]'    : 'text-[#251913]'
  const muted     = dark ? 'text-[#f6ddd4]/50' : 'text-[#251913]/50'

  const tabs = [
    { id: 'aliases',    label: 'Rekeningnamen',   icon: 'account_balance' },
    { id: 'categories', label: 'Categorieën',     icon: 'category' },
  ]

  return (
    <div className={`p-8 min-h-screen ${bg}`}>
      {/* Header */}
      <header className="mb-8">
        <span className="text-[#F46C22] font-black tracking-widest text-xs uppercase">Instellingen</span>
        <h2 className={`text-4xl font-extrabold tracking-tighter mt-1 ${text}`}>CONFIGURATIE</h2>
        <p className={`text-sm mt-1 ${muted}`}>Beheer rekeningnamen, categorieën en andere instellingen</p>
      </header>

      {/* Tab bar */}
      <div className={`flex gap-1 mb-8 p-1 rounded-xl ${dark ? 'bg-[#251913]' : 'bg-[#fff1ec]'} w-fit`}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
              tab === t.id
                ? 'bg-[#F46C22] text-white shadow'
                : `${muted} hover:text-[#F46C22]`
            }`}
          >
            <span className="material-symbols-outlined text-sm">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'aliases'    && <AliasesTab    dark={dark} />}
      {tab === 'categories' && <CategoriesTab dark={dark} />}
    </div>
  )
}

// ── Tab: Rekeningnamen ─────────────────────────────────────────────────────

function AliasesTab({ dark }) {
  const [aliases,     setAliases]     = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [newIban,     setNewIban]     = useState('')
  const [newName,     setNewName]     = useState('')
  const [addError,    setAddError]    = useState(null)
  const [editing,     setEditing]     = useState(null) // { iban, display_name }
  const csvRef = useRef(null)

  const text    = dark ? 'text-[#f6ddd4]'    : 'text-[#251913]'
  const muted   = dark ? 'text-[#f6ddd4]/50' : 'text-[#251913]/50'
  const cardBg  = dark ? 'bg-[#2a1d17]'      : 'bg-white shadow'
  const panelBg = dark ? 'bg-[#251913]'      : 'bg-[#fff1ec]'
  const headerBg= dark ? 'bg-[#352721]/50'   : 'bg-[#fce3da]'
  const divider = dark ? 'divide-[#594238]/20' : 'divide-[#e0c0b2]/30'
  const border  = dark ? 'border-[#594238]/30' : 'border-[#e0c0b2]/50'
  const inputCls= `w-full text-sm px-3 py-2 rounded-lg border ${border} ${dark ? 'bg-[#2a1d17] text-[#f6ddd4]' : 'bg-white text-[#251913]'} focus:outline-none focus:ring-2 focus:ring-[#F46C22]/40`

  useEffect(() => {
    Promise.all([api.aliases.list(), api.aliases.suggestions()])
      .then(([a, s]) => { setAliases(a); setSuggestions(s) })
      .finally(() => setLoading(false))
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    if (!newIban.trim() || !newName.trim()) { setAddError('IBAN en naam zijn verplicht'); return }
    setAddError(null)
    try {
      const created = await api.aliases.create({ iban: newIban.trim(), display_name: newName.trim() })
      setAliases(prev => {
        const filtered = prev.filter(a => a.iban !== created.iban)
        return [...filtered, created].sort((a, b) => a.iban.localeCompare(b.iban))
      })
      setSuggestions(s => s.filter(s => s.iban !== created.iban))
      setNewIban(''); setNewName('')
    } catch (e) { setAddError(e.message) }
  }

  async function handleDelete(iban) {
    if (!confirm(`Alias voor ${iban} verwijderen?`)) return
    await api.aliases.delete(iban)
    setAliases(a => a.filter(x => x.iban !== iban))
  }

  async function handleSaveEdit() {
    if (!editing?.display_name.trim()) return
    const updated = await api.aliases.update(editing.iban, { iban: editing.iban, display_name: editing.display_name })
    setAliases(a => a.map(x => x.iban === editing.iban ? updated : x))
    setEditing(null)
  }

  async function handleCsvImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const res = await api.aliases.importCsv(file)
      alert(`Aangemaakt: ${res.created} · Bijgewerkt: ${res.updated}${res.errors.length ? '\nErrors: ' + res.errors.join(', ') : ''}`)
      const [a, s] = await Promise.all([api.aliases.list(), api.aliases.suggestions()])
      setAliases(a); setSuggestions(s)
    } catch (err) { alert('Import mislukt: ' + err.message) }
    e.target.value = ''
  }

  function useSuggestion(s) {
    setNewIban(s.iban)
    setNewName('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Add form */}
      <div className={`${cardBg} rounded-xl overflow-hidden`}>
        <div className={`px-6 py-4 ${headerBg} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#F46C22] text-sm">add_circle</span>
            <h3 className={`text-sm font-bold uppercase tracking-widest ${text}`}>Rekeningnaam toevoegen</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => csvRef.current?.click()}
              className={`px-3 py-1.5 rounded-lg border ${border} text-[10px] font-bold uppercase tracking-widest ${muted} hover:text-[#F46C22] flex items-center gap-1 transition-colors`}
            >
              <span className="material-symbols-outlined text-xs">upload</span>
              CSV importeren
            </button>
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
          </div>
        </div>
        <form onSubmit={handleAdd} className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <div className="sm:col-span-2">
              <label className={`block text-[10px] font-bold uppercase tracking-widest mb-1.5 ${muted}`}>IBAN</label>
              <input
                className={inputCls} placeholder="NL69RABO0376834404"
                value={newIban} onChange={e => setNewIban(e.target.value.toUpperCase())}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={`block text-[10px] font-bold uppercase tracking-widest mb-1.5 ${muted}`}>Naam</label>
              <input
                className={inputCls} placeholder="Albert Heijn Utrecht"
                value={newName} onChange={e => setNewName(e.target.value)}
              />
            </div>
            <div>
              <button
                type="submit"
                className="w-full px-4 py-2 bg-[#F46C22] text-white font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-[#d45a12] transition-colors"
              >
                Toevoegen
              </button>
            </div>
          </div>
          {addError && <p className="mt-2 text-xs text-red-400">{addError}</p>}
          <p className={`mt-3 text-[10px] ${muted}`}>
            CSV-formaat: <code className="font-mono">IBAN;Naam</code> (één per regel, optionele headerrij)
          </p>
        </form>
      </div>

      {/* Existing aliases */}
      <div className={`${panelBg} rounded-xl overflow-hidden`}>
        <div className={`px-6 py-4 ${headerBg}`}>
          <h3 className={`text-sm font-bold uppercase tracking-widest ${text}`}>
            Opgeslagen namen ({aliases.length})
          </h3>
        </div>

        {loading ? (
          <div className={`p-8 text-center ${muted}`}>Laden…</div>
        ) : aliases.length === 0 ? (
          <div className={`p-8 text-center ${muted}`}>Nog geen namen toegevoegd.</div>
        ) : (
          <div className={`divide-y ${divider}`}>
            {aliases.map(a => (
              <div key={a.iban} className={`flex items-center gap-4 px-6 py-3 ${dark ? 'hover:bg-[#2e1f18]' : 'hover:bg-[#fff8f6]'} transition-colors`}>
                {editing?.iban === a.iban ? (
                  <>
                    <code className={`text-xs font-mono shrink-0 w-48 ${muted}`}>{a.iban}</code>
                    <input
                      className={`${inputCls} flex-1`}
                      value={editing.display_name}
                      onChange={e => setEditing(v => ({ ...v, display_name: e.target.value }))}
                      autoFocus
                    />
                    <button onClick={handleSaveEdit} className="text-[#F46C22] text-xs font-bold hover:underline">Opslaan</button>
                    <button onClick={() => setEditing(null)} className={`text-xs ${muted} hover:text-red-400`}>Annuleren</button>
                  </>
                ) : (
                  <>
                    <code className={`text-xs font-mono shrink-0 w-48 ${muted}`}>{a.iban}</code>
                    <span className={`flex-1 text-sm font-semibold ${text}`}>{a.display_name}</span>
                    {a.notes && <span className={`text-xs ${muted} truncate max-w-xs hidden md:block`}>{a.notes}</span>}
                    <button onClick={() => setEditing({ iban: a.iban, display_name: a.display_name })} className={`p-1.5 rounded ${muted} hover:text-[#F46C22] transition-colors`}>
                      <span className="material-symbols-outlined text-sm">edit</span>
                    </button>
                    <button onClick={() => handleDelete(a.iban)} className={`p-1.5 rounded ${muted} hover:text-red-400 transition-colors`}>
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className={`${panelBg} rounded-xl overflow-hidden`}>
          <div className={`px-6 py-4 ${headerBg} flex items-center gap-2`}>
            <span className="material-symbols-outlined text-[#F46C22] text-sm">lightbulb</span>
            <h3 className={`text-sm font-bold uppercase tracking-widest ${text}`}>
              Suggesties — meest voorkomende onbenoemde IBAN's
            </h3>
          </div>
          <div className={`divide-y ${divider}`}>
            {suggestions.map(s => (
              <div key={s.iban} className={`flex items-center gap-4 px-6 py-3 ${dark ? 'hover:bg-[#2e1f18]' : 'hover:bg-[#fff8f6]'} transition-colors`}>
                <code className={`text-xs font-mono flex-1 ${muted}`}>{s.iban}</code>
                <span className={`text-xs ${muted}`}>
                  {s.transaction_count} transactie{s.transaction_count !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => useSuggestion(s)}
                  className="px-3 py-1 bg-[#F46C22]/10 text-[#F46C22] text-[10px] font-bold uppercase tracking-widest rounded hover:bg-[#F46C22]/20 transition-colors"
                >
                  Naam geven
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab: Categorieën ───────────────────────────────────────────────────────

function CategoriesTab({ dark }) {
  const [cats,    setCats]    = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded,setExpanded]= useState({})
  const [form,    setForm]    = useState({ category: '', subcategory: '', destination: '' })
  const [addErr,  setAddErr]  = useState(null)

  const text    = dark ? 'text-[#f6ddd4]'    : 'text-[#251913]'
  const muted   = dark ? 'text-[#f6ddd4]/50' : 'text-[#251913]/50'
  const cardBg  = dark ? 'bg-[#2a1d17]'      : 'bg-white shadow'
  const panelBg = dark ? 'bg-[#251913]'      : 'bg-[#fff1ec]'
  const headerBg= dark ? 'bg-[#352721]/50'   : 'bg-[#fce3da]'
  const divider = dark ? 'divide-[#594238]/20' : 'divide-[#e0c0b2]/30'
  const border  = dark ? 'border-[#594238]/30' : 'border-[#e0c0b2]/50'
  const inputCls= `text-sm px-3 py-2 rounded-lg border ${border} ${dark ? 'bg-[#2a1d17] text-[#f6ddd4]' : 'bg-white text-[#251913]'} focus:outline-none focus:ring-2 focus:ring-[#F46C22]/40`

  useEffect(() => {
    api.categories.overview()
      .then(setCats)
      .finally(() => setLoading(false))
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.category.trim()) { setAddErr('Hoofdcategorie is verplicht'); return }
    setAddErr(null)
    try {
      const created = await api.categories.create({
        category:    form.category.trim(),
        subcategory: form.subcategory.trim() || null,
        destination: form.destination.trim() || null,
      })
      setCats(prev => [...prev, { ...created, transaction_count: 0 }])
      setForm({ category: '', subcategory: '', destination: '' })
    } catch (e) { setAddErr(e.message) }
  }

  async function handleDelete(id, label) {
    if (!confirm(`Categorie "${label}" verwijderen? Transacties verliezen deze categorie.`)) return
    await api.categories.delete(id)
    setCats(c => c.filter(x => x.id !== id))
  }

  function toggleMain(main) {
    setExpanded(e => ({ ...e, [main]: !e[main] }))
  }

  const tree = groupCategories(cats)
  const totalTrx = cats.reduce((s, c) => s + c.transaction_count, 0)

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Add form */}
      <div className={`${cardBg} rounded-xl overflow-hidden`}>
        <div className={`px-6 py-4 ${headerBg} flex items-center gap-2`}>
          <span className="material-symbols-outlined text-[#F46C22] text-sm">add_circle</span>
          <h3 className={`text-sm font-bold uppercase tracking-widest ${text}`}>Categorie toevoegen</h3>
        </div>
        <form onSubmit={handleAdd} className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className={`block text-[10px] font-bold uppercase tracking-widest mb-1.5 ${muted}`}>Hoofdcategorie *</label>
              <input className={`${inputCls} w-full`} placeholder="Boodschappen" value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))} />
            </div>
            <div>
              <label className={`block text-[10px] font-bold uppercase tracking-widest mb-1.5 ${muted}`}>Subcategorie</label>
              <input className={`${inputCls} w-full`} placeholder="Supermarkt" value={form.subcategory} onChange={e => setForm(v => ({ ...v, subcategory: e.target.value }))} />
            </div>
            <div>
              <label className={`block text-[10px] font-bold uppercase tracking-widest mb-1.5 ${muted}`}>Bestemming</label>
              <input className={`${inputCls} w-full`} placeholder="Albert Heijn" value={form.destination} onChange={e => setForm(v => ({ ...v, destination: e.target.value }))} />
            </div>
            <div>
              <button type="submit" className="w-full px-4 py-2 bg-[#F46C22] text-white font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-[#d45a12] transition-colors">
                Toevoegen
              </button>
            </div>
          </div>
          {addErr && <p className="mt-2 text-xs text-red-400">{addErr}</p>}
        </form>
      </div>

      {/* Tree overview */}
      <div className={`${panelBg} rounded-xl overflow-hidden`}>
        <div className={`px-6 py-4 ${headerBg} flex justify-between items-center`}>
          <h3 className={`text-sm font-bold uppercase tracking-widest ${text}`}>
            Categorieënstructuur ({cats.length} items)
          </h3>
          <span className={`text-xs ${muted}`}>{totalTrx} transacties gekoppeld</span>
        </div>

        {loading ? (
          <div className={`p-8 text-center ${muted}`}>Laden…</div>
        ) : Object.keys(tree).length === 0 ? (
          <div className={`p-8 text-center ${muted}`}>Nog geen categorieën.</div>
        ) : (
          <div className={`divide-y ${divider}`}>
            {Object.entries(tree).map(([main, data]) => (
              <div key={main}>
                {/* Main category row */}
                <div
                  className={`flex items-center gap-3 px-6 py-3 cursor-pointer ${dark ? 'hover:bg-[#2e1f18]' : 'hover:bg-[#fff8f6]'} transition-colors`}
                  onClick={() => toggleMain(main)}
                >
                  <span className={`material-symbols-outlined text-sm transition-transform ${expanded[main] ? 'rotate-90' : ''} ${muted}`}>
                    chevron_right
                  </span>
                  <span className={`flex-1 font-bold text-sm ${text}`}>{main}</span>
                  <span className={`text-xs ${muted}`}>{Object.keys(data.subs).length} sub · {data.total} trx</span>
                </div>

                {/* Subcategories */}
                {expanded[main] && Object.entries(data.subs).map(([sub, subData]) => (
                  <div key={sub} className={`${dark ? 'bg-[#1e140f]' : 'bg-[#fff8f6]'}`}>
                    <div className="flex items-center gap-3 px-10 py-2.5">
                      <span className={`material-symbols-outlined text-sm ${muted}`}>subdirectory_arrow_right</span>
                      <span className={`flex-1 text-sm ${text}`}>{sub === '—' ? <em className={muted}>geen subcategorie</em> : sub}</span>
                      <span className={`text-xs ${muted}`}>{subData.total} trx</span>
                      {subData.id && (
                        <button
                          onClick={() => handleDelete(subData.id, `${main} › ${sub}`)}
                          className={`p-1 rounded ${muted} hover:text-red-400 transition-colors`}
                        >
                          <span className="material-symbols-outlined text-xs">delete</span>
                        </button>
                      )}
                    </div>
                    {subData.destinations.map(d => (
                      <div key={d.id} className="flex items-center gap-3 px-16 py-2">
                        <span className={`flex-1 text-xs ${muted}`}>{d.name}</span>
                        <span className={`text-xs ${muted}`}>{d.count} trx</span>
                        <button
                          onClick={() => handleDelete(d.id, `${main} › ${sub} › ${d.name}`)}
                          className={`p-1 rounded ${muted} hover:text-red-400 transition-colors`}
                        >
                          <span className="material-symbols-outlined text-xs">delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
