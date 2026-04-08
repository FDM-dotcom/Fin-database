import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'

const FIELD_OPTIONS = [
  { value: 'description', label: 'Omschrijving (Transactiedetails)', type: 'text' },
  { value: 'counterparty_name', label: 'Naam tegenpartij', type: 'text' },
  { value: 'counterparty_iban', label: 'IBAN tegenpartij', type: 'text' },
  { value: 'amount', label: 'Bedrag (€)', type: 'number' },
  { value: 'raw:Code', label: 'Rabobank: Code (db/cr)', type: 'text' },
  { value: 'raw:Naam tegenpartij', label: 'Rabobank: Naam tegenpartij (raw)', type: 'text' },
  { value: 'raw:Incassant ID', label: 'Rabobank: Incassant ID', type: 'text' },
  { value: 'raw:Machtigingskenmerk', label: 'Rabobank: Machtigingskenmerk', type: 'text' },
  { value: 'raw:Betalingskenmerk', label: 'Rabobank: Betalingskenmerk', type: 'text' },
]

const TEXT_OPS = [
  { value: 'contains', label: 'bevat' },
  { value: 'notContains', label: 'bevat niet' },
  { value: 'equals', label: 'is gelijk aan' },
  { value: 'notEquals', label: 'is niet gelijk aan' },
  { value: 'startsWith', label: 'begint met' },
  { value: 'endsWith', label: 'eindigt met' },
  { value: 'isEmpty', label: 'is leeg' },
  { value: 'notEmpty', label: 'is niet leeg' },
  { value: 'regex', label: 'regex patroon' },
]

const NUM_OPS = [
  { value: 'greaterThan', label: 'groter dan (>)' },
  { value: 'lessThan', label: 'kleiner dan (<)' },
  { value: 'equals', label: 'gelijk aan (=)' },
  { value: 'notEquals', label: 'niet gelijk aan (≠)' },
  { value: 'isEmpty', label: 'is leeg' },
  { value: 'notEmpty', label: 'is niet leeg' },
]

const NO_VALUE_OPS = ['isEmpty', 'notEmpty']

function emptyCondition() {
  return { field_to_match: 'description', operator: 'contains', match_value: '' }
}

export default function RuleConfiguration({ dark }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id

  const [name, setName] = useState('')
  const [priority, setPriority] = useState(0)
  const [logic, setLogic] = useState('AND')
  const [categoryId, setCategoryId] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [notes, setNotes] = useState('')
  const [conditions, setConditions] = useState([emptyCondition()])

  // Category creation inline
  const [categories, setCategories] = useState([])
  const [newCat, setNewCat] = useState({ category: '', subcategory: '', destination: '' })
  const [showNewCat, setShowNewCat] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Style shortcuts
  const bg = dark ? 'bg-[#1c110b]' : 'bg-[#fff8f6]'
  const text = dark ? 'text-[#f6ddd4]' : 'text-[#251913]'
  const muted = dark ? 'text-[#f6ddd4]/50' : 'text-[#251913]/50'
  const cardBg = dark ? 'bg-[#251913]' : 'bg-[#fff1ec]'
  const inputBg = dark ? 'bg-[#170c07] text-[#f6ddd4] border-[#594238]' : 'bg-white text-[#251913] border-[#e0c0b2]'
  const condCard = dark ? 'bg-[#2a1d17]' : 'bg-white shadow-sm'

  useEffect(() => {
    api.categories.list().then(setCategories).catch(() => {})
    if (!isNew) {
      api.rules.get(id).then(r => {
        setName(r.name)
        setPriority(r.priority)
        setLogic(r.logic)
        setCategoryId(r.category_id)
        setIsActive(r.is_active)
        setNotes(r.notes || '')
        setConditions(r.conditions.length ? r.conditions : [emptyCondition()])
      }).catch(e => setError(e.message))
    }
  }, [id])

  function setCondField(i, key, val) {
    setConditions(cs => cs.map((c, idx) => idx === i ? { ...c, [key]: val } : c))
  }

  function addCondition() {
    setConditions(cs => [...cs, emptyCondition()])
  }

  function removeCondition(i) {
    setConditions(cs => cs.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    if (!name.trim()) { setError('Geef de regel een naam'); return }
    if (!categoryId) { setError('Selecteer een categorie'); return }
    if (conditions.length === 0) { setError('Voeg minimaal één conditie toe'); return }

    const body = {
      name: name.trim(),
      priority: Number(priority),
      logic,
      category_id: Number(categoryId),
      is_active: isActive,
      notes: notes.trim() || null,
      conditions: conditions.map(c => ({
        field_to_match: c.field_to_match,
        operator: c.operator,
        match_value: NO_VALUE_OPS.includes(c.operator) ? null : (c.match_value || null),
      })),
    }

    setSaving(true)
    setError(null)
    try {
      if (isNew) {
        await api.rules.create(body)
      } else {
        await api.rules.update(id, body)
      }
      navigate('/rules')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleNewCategory() {
    if (!newCat.category.trim()) return
    const cat = await api.categories.create({
      category: newCat.category.trim(),
      subcategory: newCat.subcategory.trim() || null,
      destination: newCat.destination.trim() || null,
    })
    setCategories(cs => [...cs, cat])
    setCategoryId(cat.id)
    setNewCat({ category: '', subcategory: '', destination: '' })
    setShowNewCat(false)
  }

  const opsFor = (field) => FIELD_OPTIONS.find(f => f.value === field)?.type === 'number' ? NUM_OPS : TEXT_OPS

  return (
    <div className={`p-8 min-h-screen ${bg}`}>
      {/* Header */}
      <header className="flex justify-between items-end mb-10">
        <div>
          <span className="text-[#F46C22] font-black tracking-widest text-xs uppercase">Categorisatie Engine</span>
          <h2 className={`text-4xl font-extrabold tracking-tighter mt-1 ${text}`}>
            {isNew ? 'NIEUWE REGEL' : 'REGEL BEWERKEN'}
          </h2>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/rules')} className={`px-5 py-2 border font-bold uppercase text-xs transition-colors ${dark ? 'border-[#594238] text-[#f6ddd4]/60 hover:bg-[#2a1d17]' : 'border-[#e0c0b2] text-[#251913]/60 hover:bg-[#fff1ec]'}`}>
            Annuleren
          </button>
          <button onClick={handleSave} disabled={saving} className="px-7 py-2 bg-gradient-to-br from-[#f46c22] to-[#ffb595] text-[#571e00] font-black uppercase text-xs rounded-sm shadow-xl transition-transform active:scale-95 disabled:opacity-60">
            {saving ? 'Opslaan...' : 'OPSLAAN'}
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 text-red-400 text-sm rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Left: Conditions */}
        <section className="col-span-12 lg:col-span-7 space-y-6">
          {/* Rule meta */}
          <div className={`${cardBg} p-6 rounded-xl space-y-4`}>
            <h3 className={`text-xs font-bold uppercase tracking-[0.2em] ${muted} flex items-center gap-2`}>
              <span className="w-2 h-2 bg-[#F46C22] rounded-full"></span>
              Regelinstellingen
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <label className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>Naam</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="bijv. Albert Heijn → Boodschappen"
                  className={`w-full px-4 py-3 rounded border text-sm focus:outline-none focus:ring-1 focus:ring-[#F46C22] ${inputBg}`}
                />
              </div>
              <div className="space-y-1">
                <label className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>Prioriteit</label>
                <input
                  type="number"
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  className={`w-full px-4 py-3 rounded border text-sm focus:outline-none focus:ring-1 focus:ring-[#F46C22] ${inputBg}`}
                />
                <p className={`text-[10px] ${muted}`}>Lager = eerder geëvalueerd</p>
              </div>
              <div className="space-y-1">
                <label className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>Logica</label>
                <div className="flex gap-2">
                  {['AND', 'OR'].map(l => (
                    <button
                      key={l}
                      onClick={() => setLogic(l)}
                      className={`flex-1 py-3 text-xs font-black uppercase rounded border transition-colors ${
                        logic === l
                          ? 'bg-[#F46C22] text-[#571e00] border-[#F46C22]'
                          : `border-[#594238] ${muted} hover:border-[#F46C22]`
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <p className={`text-[10px] ${muted}`}>{logic === 'AND' ? 'Alle condities moeten matchen' : 'Minimaal één conditie moet matchen'}</p>
              </div>
              <div className="space-y-1">
                <label className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>Notities</label>
                <input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Optionele toelichting..."
                  className={`w-full px-4 py-3 rounded border text-sm focus:outline-none focus:ring-1 focus:ring-[#F46C22] ${inputBg}`}
                />
              </div>
              <div className="space-y-1">
                <label className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>Status</label>
                <button
                  onClick={() => setIsActive(a => !a)}
                  className={`flex items-center gap-3 px-4 py-3 w-full rounded border transition-colors ${
                    isActive
                      ? 'border-[#F46C22] text-[#F46C22] bg-[#F46C22]/10'
                      : `border-[#594238] ${muted}`
                  }`}
                >
                  <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isActive ? 'bg-[#F46C22]' : dark ? 'bg-[#40312b]' : 'bg-[#e0c0b2]'}`}>
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isActive ? 'translate-x-5' : 'translate-x-1'}`} />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-widest">{isActive ? 'Actief' : 'Inactief'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Conditions */}
          <div className={`${cardBg} p-6 rounded-xl space-y-4`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-xs font-bold uppercase tracking-[0.2em] ${muted} flex items-center gap-2`}>
                <span className="w-2 h-2 bg-[#F46C22] rounded-full"></span>
                ALS — Condities ({conditions.length})
              </h3>
              <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${dark ? 'bg-[#40312b] text-[#F46C22]' : 'bg-[#fce3da] text-[#a23f00]'}`}>
                {logic}
              </span>
            </div>

            <div className="space-y-3">
              {conditions.map((cond, i) => {
                const ops = opsFor(cond.field_to_match)
                const noVal = NO_VALUE_OPS.includes(cond.operator)
                return (
                  <div key={i} className={`${condCard} p-4 rounded-xl`}>
                    {i > 0 && (
                      <div className="flex items-center mb-3">
                        <div className={`flex-1 border-t ${dark ? 'border-[#594238]/30' : 'border-[#e0c0b2]/50'}`} />
                        <span className="mx-3 text-[10px] font-black text-[#F46C22] bg-[#F46C22]/10 px-2 py-1 rounded">
                          {logic}
                        </span>
                        <div className={`flex-1 border-t ${dark ? 'border-[#594238]/30' : 'border-[#e0c0b2]/50'}`} />
                      </div>
                    )}
                    <div className="grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-4 space-y-1">
                        <label className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Veld</label>
                        <select
                          value={cond.field_to_match}
                          onChange={e => setCondField(i, 'field_to_match', e.target.value)}
                          className={`w-full px-3 py-2 rounded border text-xs focus:outline-none focus:ring-1 focus:ring-[#F46C22] ${inputBg}`}
                        >
                          {FIELD_OPTIONS.map(f => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-3 space-y-1">
                        <label className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Operator</label>
                        <select
                          value={cond.operator}
                          onChange={e => setCondField(i, 'operator', e.target.value)}
                          className={`w-full px-3 py-2 rounded border text-xs focus:outline-none focus:ring-1 focus:ring-[#F46C22] ${inputBg}`}
                        >
                          {ops.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-4 space-y-1">
                        <label className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Waarde</label>
                        {noVal ? (
                          <div className={`px-3 py-2 rounded border text-xs italic ${dark ? 'bg-[#170c07] border-[#594238] text-[#f6ddd4]/30' : 'bg-[#fff1ec] border-[#e0c0b2] text-[#251913]/30'}`}>
                            geen waarde nodig
                          </div>
                        ) : (
                          <input
                            value={cond.match_value || ''}
                            onChange={e => setCondField(i, 'match_value', e.target.value)}
                            placeholder="bijv. Albert Heijn"
                            className={`w-full px-3 py-2 rounded border text-xs focus:outline-none focus:ring-1 focus:ring-[#F46C22] ${inputBg}`}
                          />
                        )}
                      </div>
                      <div className="col-span-1 flex justify-end pb-0.5">
                        <button
                          onClick={() => removeCondition(i)}
                          disabled={conditions.length === 1}
                          className={`p-2 rounded transition-colors disabled:opacity-20 ${muted} hover:text-red-400`}
                        >
                          <span className="material-symbols-outlined text-base">remove_circle</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <button
              onClick={addCondition}
              className="flex items-center gap-2 text-[#F46C22] font-bold text-xs uppercase tracking-widest hover:gap-3 transition-all"
            >
              <span className="material-symbols-outlined text-base">add_circle</span>
              Conditie toevoegen
            </button>
          </div>
        </section>

        {/* Right: Category + preview */}
        <aside className="col-span-12 lg:col-span-5 space-y-6">
          {/* Category selection */}
          <div className={`${cardBg} p-6 rounded-xl space-y-4`}>
            <h3 className={`text-xs font-bold uppercase tracking-[0.2em] ${muted} flex items-center gap-2`}>
              <span className="w-2 h-2 bg-[#8ccdff] rounded-full"></span>
              DAN — Wijs toe aan categorie
            </h3>

            <div className="space-y-1">
              <label className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>Categorie</label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className={`w-full px-4 py-3 rounded border text-sm focus:outline-none focus:ring-1 focus:ring-[#F46C22] ${inputBg}`}
              >
                <option value="">— Selecteer een categorie —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.category}{c.subcategory ? ` › ${c.subcategory}` : ''}{c.destination ? ` › ${c.destination}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* New category inline */}
            {!showNewCat ? (
              <button
                onClick={() => setShowNewCat(true)}
                className="flex items-center gap-2 text-[#F46C22] font-bold text-xs uppercase tracking-widest hover:gap-3 transition-all"
              >
                <span className="material-symbols-outlined text-base">add_circle</span>
                Nieuwe categorie aanmaken
              </button>
            ) : (
              <div className={`space-y-3 p-4 rounded-xl ${dark ? 'bg-[#170c07]' : 'bg-[#fff8f6]'}`}>
                <p className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>Nieuwe categorie</p>
                {[
                  { key: 'category', label: 'Categorie*', placeholder: 'bijv. Boodschappen' },
                  { key: 'subcategory', label: 'Subcategorie', placeholder: 'bijv. Supermarkt' },
                  { key: 'destination', label: 'Bestemming', placeholder: 'bijv. Albert Heijn' },
                ].map(f => (
                  <div key={f.key} className="space-y-1">
                    <label className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>{f.label}</label>
                    <input
                      value={newCat[f.key]}
                      onChange={e => setNewCat(n => ({ ...n, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className={`w-full px-3 py-2 rounded border text-xs focus:outline-none focus:ring-1 focus:ring-[#F46C22] ${inputBg}`}
                    />
                  </div>
                ))}
                <div className="flex gap-2">
                  <button onClick={handleNewCategory} className="flex-1 py-2 bg-[#F46C22] text-[#571e00] font-black text-xs uppercase rounded">
                    Aanmaken
                  </button>
                  <button onClick={() => setShowNewCat(false)} className={`flex-1 py-2 font-black text-xs uppercase rounded border ${dark ? 'border-[#594238]' : 'border-[#e0c0b2]'} ${muted}`}>
                    Annuleren
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className={`${dark ? 'bg-[#2a1d17] border-[#594238]/30' : 'bg-[#fce3da] border-[#e0c0b2]/50'} border p-6 rounded-xl space-y-4`}>
            <h3 className={`text-xs font-bold uppercase tracking-[0.2em] ${muted}`}>Regeloverzicht</h3>
            <div className={`text-xs font-mono space-y-2 ${muted}`}>
              <div>
                <span className="text-[#F46C22] font-bold">ALS</span>{' '}
                {conditions.map((c, i) => (
                  <span key={i}>
                    {i > 0 && <span className="text-[#F46C22]"> {logic} </span>}
                    <span className={dark ? 'text-[#f6ddd4]/80' : 'text-[#251913]/80'}>
                      {c.field_to_match} <span className="text-[#F46C22]">{c.operator}</span>{' '}
                      {NO_VALUE_OPS.includes(c.operator) ? '' : `"${c.match_value || '...'}"`}
                    </span>
                  </span>
                ))}
              </div>
              {categoryId && (
                <div>
                  <span className="text-[#8ccdff] font-bold">DAN</span>{' '}
                  <span className={dark ? 'text-[#f6ddd4]/80' : 'text-[#251913]/80'}>
                    categorie = "{categories.find(c => c.id == categoryId)?.category || '?'}"
                  </span>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
