import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'

// ── Field / operator metadata ──────────────────────────────────────────────

const FIELD_OPTIONS = [
  { value: 'description',           label: 'Omschrijving' },
  { value: 'counterparty_name',     label: 'Naam tegenpartij' },
  { value: 'counterparty_iban',     label: 'IBAN tegenpartij' },
  { value: 'amount',                label: 'Bedrag' },
  { value: 'raw:Code',              label: 'Code (raw)' },
  { value: 'raw:Naam tegenpartij',  label: 'Naam tegenpartij (raw)' },
  { value: 'raw:Incassant ID',      label: 'Incassant ID (raw)' },
  { value: 'raw:Machtigingskenmerk',label: 'Machtigingskenmerk (raw)' },
  { value: 'raw:Betalingskenmerk',  label: 'Betalingskenmerk (raw)' },
]

const TEXT_OPS = [
  { value: 'contains',    label: 'bevat' },
  { value: 'notContains', label: 'bevat niet' },
  { value: 'equals',      label: 'is gelijk aan' },
  { value: 'notEquals',   label: 'is niet gelijk aan' },
  { value: 'startsWith',  label: 'begint met' },
  { value: 'endsWith',    label: 'eindigt met' },
  { value: 'regex',       label: 'regex' },
  { value: 'isEmpty',     label: 'is leeg' },
  { value: 'notEmpty',    label: 'is niet leeg' },
]

const NUM_OPS = [
  { value: 'greaterThan', label: 'groter dan' },
  { value: 'lessThan',    label: 'kleiner dan' },
  { value: 'equals',      label: 'gelijk aan' },
  { value: 'isEmpty',     label: 'is leeg' },
  { value: 'notEmpty',    label: 'is niet leeg' },
]

const NO_VALUE_OPS = ['isEmpty', 'notEmpty']

function getOps(field) { return field === 'amount' ? NUM_OPS : TEXT_OPS }
function fieldLabel(v) { return FIELD_OPTIONS.find(f => f.value === v)?.label ?? v }
function opLabel(v)    { return [...TEXT_OPS, ...NUM_OPS].find(o => o.value === v)?.label ?? v }

// ── Main component ─────────────────────────────────────────────────────────

export default function RulesOverview({ dark }) {
  const [rules,      setRules]      = useState([])
  const [stats,      setStats]      = useState(null)
  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [previews,   setPreviews]   = useState({})   // { [id]: { loading, count, transactions, error } }
  const importRef = useRef(null)
  const navigate  = useNavigate()

  // Quick-add form state
  const [qa, setQa] = useState({
    name: '', field: 'description', operator: 'contains', value: '', category_id: '', logic: 'AND',
  })
  const [qaLoading, setQaLoading] = useState(false)
  const [qaError,   setQaError]   = useState(null)

  // ── Theme tokens ───────────────────────────────────────────────────────
  const bg        = dark ? 'bg-[#1c110b]'      : 'bg-[#fff8f6]'
  const cardBg    = dark ? 'bg-[#2a1d17]'      : 'bg-white shadow'
  const panelBg   = dark ? 'bg-[#251913]'      : 'bg-[#fff1ec]'
  const headerBg  = dark ? 'bg-[#352721]/50'   : 'bg-[#fce3da]'
  const divider   = dark ? 'divide-[#594238]/20' : 'divide-[#e0c0b2]/30'
  const border    = dark ? 'border-[#594238]/30' : 'border-[#e0c0b2]/50'
  const text      = dark ? 'text-[#f6ddd4]'    : 'text-[#251913]'
  const muted     = dark ? 'text-[#f6ddd4]/50' : 'text-[#251913]/50'
  const inputCls  = `w-full text-sm px-3 py-2 rounded-lg border ${border} ${dark ? 'bg-[#2a1d17] text-[#f6ddd4]' : 'bg-white text-[#251913]'} focus:outline-none focus:ring-2 focus:ring-[#F46C22]/40`

  // ── Data loading ───────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([api.rules.list(), api.stats(), api.categories.list()])
      .then(([r, s, c]) => { setRules(r); setStats(s); setCategories(c) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // ── Accordion ──────────────────────────────────────────────────────────
  function toggleExpand(rule) {
    if (expandedId === rule.id) { setExpandedId(null); return }
    setExpandedId(rule.id)
    if (!previews[rule.id]) loadPreview(rule)
  }

  async function loadPreview(rule) {
    setPreviews(p => ({ ...p, [rule.id]: { loading: true } }))
    try {
      const res = await api.rules.preview({
        logic: rule.logic,
        conditions: rule.conditions.map(({ field_to_match, operator, match_value }) =>
          ({ field_to_match, operator, match_value })),
      })
      setPreviews(p => ({ ...p, [rule.id]: { loading: false, ...res } }))
    } catch (e) {
      setPreviews(p => ({ ...p, [rule.id]: { loading: false, error: e.message } }))
    }
  }

  // ── Rule actions ───────────────────────────────────────────────────────
  async function handleToggle(id) {
    const upd = await api.rules.toggle(id)
    setRules(rs => rs.map(r => r.id === id ? { ...r, is_active: upd.is_active } : r))
  }

  async function handleDelete(id, name) {
    if (!confirm(`Regel "${name}" verwijderen?`)) return
    await api.rules.delete(id)
    setRules(rs => rs.filter(r => r.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  // ── Quick add ──────────────────────────────────────────────────────────
  async function handleQuickAdd(e) {
    e.preventDefault()
    if (!qa.name.trim() || !qa.category_id) {
      setQaError('Naam en categorie zijn verplicht'); return
    }
    setQaLoading(true); setQaError(null)
    try {
      const body = {
        name: qa.name.trim(),
        priority: 0,
        logic: qa.logic,
        category_id: parseInt(qa.category_id),
        is_active: true,
        conditions: [{
          field_to_match: qa.field,
          operator: qa.operator,
          match_value: NO_VALUE_OPS.includes(qa.operator) ? null : (qa.value || null),
        }],
      }
      const created = await api.rules.create(body)
      setRules(rs => [...rs, created])
      setQa({ name: '', field: 'description', operator: 'contains', value: '', category_id: '', logic: 'AND' })
    } catch (e) {
      setQaError(e.message)
    } finally {
      setQaLoading(false)
    }
  }

  // ── Export / import ────────────────────────────────────────────────────
  async function handleExport() {
    const res  = await fetch('/api/rules/export')
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'td-finance-rules.json'; a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const res = await api.rules.importJson(file)
      const msg = `Geïmporteerd: ${res.imported} regels. Overgeslagen: ${res.skipped}.` +
        (res.errors.length ? '\n\nErrors:\n' + res.errors.join('\n') : '')
      alert(msg)
      const r = await api.rules.list()
      setRules(r)
    } catch (err) {
      alert('Import mislukt: ' + err.message)
    }
    e.target.value = ''
  }

  const activeCount = rules.filter(r => r.is_active).length

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className={`p-8 min-h-screen ${bg}`}>

      {/* Header */}
      <header className="mb-8 flex flex-wrap justify-between items-end gap-4">
        <div>
          <span className="text-[#F46C22] font-black tracking-widest text-xs uppercase">Categorisatie Engine</span>
          <h2 className={`text-4xl font-extrabold tracking-tighter mt-1 ${text}`}>REGELS OVERZICHT</h2>
          <p className={`text-sm mt-1 ${muted}`}>Beheer categorisatieregels voor automatische transactieclassificatie</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExport}
            className={`px-4 py-2.5 rounded-lg border ${border} text-xs font-bold uppercase tracking-widest ${muted} hover:text-[#F46C22] flex items-center gap-1.5 transition-colors`}
          >
            <span className="material-symbols-outlined text-sm">download</span>Exporteer
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className={`px-4 py-2.5 rounded-lg border ${border} text-xs font-bold uppercase tracking-widest ${muted} hover:text-[#F46C22] flex items-center gap-1.5 transition-colors`}
          >
            <span className="material-symbols-outlined text-sm">upload</span>Importeer
          </button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <Link
            to="/rules/new"
            className="px-5 py-2.5 bg-gradient-to-br from-[#f46c22] to-[#ffb595] text-[#571e00] font-black uppercase text-xs rounded-lg shadow-lg hover:scale-[1.02] transition-transform flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">add</span>Nieuwe Regel
          </Link>
        </div>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 text-red-400 text-sm rounded-lg">{error}</div>
      )}

      {/* Stats */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Actieve Regels',       value: activeCount,                           icon: 'account_tree',  accent: '#F46C22' },
          { label: 'Auto-gecategoriseerd', value: stats ? `${stats.categorized_pct}%` : '—', icon: 'auto_awesome', accent: '#8ccdff' },
          { label: 'Transacties totaal',   value: stats?.total_transactions ?? '—',      icon: 'receipt_long',  accent: '#ffb595' },
        ].map(s => (
          <div key={s.label} className={`${cardBg} p-6 rounded-xl border-l-4`} style={{ borderColor: s.accent }}>
            <span className="material-symbols-outlined mb-3" style={{ color: s.accent }}>{s.icon}</span>
            <p className={`text-3xl font-black tracking-tighter ${text}`}>{s.value}</p>
            <p className={`text-xs font-bold uppercase tracking-widest mt-1 ${muted}`}>{s.label}</p>
          </div>
        ))}
      </section>

      {/* Quick add */}
      <section className={`${cardBg} rounded-xl mb-6 overflow-hidden`}>
        <div className={`px-6 py-4 ${headerBg} flex items-center gap-2`}>
          <span className="material-symbols-outlined text-[#F46C22] text-sm">bolt</span>
          <h3 className={`text-sm font-bold uppercase tracking-widest ${text}`}>Snel Toevoegen</h3>
        </div>
        <form onSubmit={handleQuickAdd} className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className={`block text-[10px] font-bold uppercase tracking-widest mb-1.5 ${muted}`}>Naam</label>
              <input
                className={inputCls} placeholder="Regelnaam…"
                value={qa.name} onChange={e => setQa(v => ({ ...v, name: e.target.value }))}
              />
            </div>
            <div>
              <label className={`block text-[10px] font-bold uppercase tracking-widest mb-1.5 ${muted}`}>Veld</label>
              <select
                className={inputCls} value={qa.field}
                onChange={e => setQa(v => ({ ...v, field: e.target.value, operator: getOps(e.target.value)[0].value }))}
              >
                {FIELD_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className={`block text-[10px] font-bold uppercase tracking-widest mb-1.5 ${muted}`}>Operator</label>
              <select
                className={inputCls} value={qa.operator}
                onChange={e => setQa(v => ({ ...v, operator: e.target.value }))}
              >
                {getOps(qa.field).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={`block text-[10px] font-bold uppercase tracking-widest mb-1.5 ${muted}`}>Waarde</label>
              <input
                className={inputCls}
                placeholder={NO_VALUE_OPS.includes(qa.operator) ? '—' : 'Zoekwaarde…'}
                disabled={NO_VALUE_OPS.includes(qa.operator)}
                value={NO_VALUE_OPS.includes(qa.operator) ? '' : qa.value}
                onChange={e => setQa(v => ({ ...v, value: e.target.value }))}
              />
            </div>
            <div>
              <label className={`block text-[10px] font-bold uppercase tracking-widest mb-1.5 ${muted}`}>Categorie</label>
              <select
                className={inputCls} value={qa.category_id}
                onChange={e => setQa(v => ({ ...v, category_id: e.target.value }))}
              >
                <option value="">Kies categorie…</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.category}{c.subcategory ? ` › ${c.subcategory}` : ''}{c.destination ? ` › ${c.destination}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between mt-4 gap-4">
            {qaError
              ? <p className="text-red-400 text-xs">{qaError}</p>
              : <span />
            }
            <button
              type="submit" disabled={qaLoading}
              className="px-5 py-2 bg-[#F46C22] text-white font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-[#d45a12] transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              {qaLoading ? 'Aanmaken…' : 'Regel aanmaken'}
            </button>
          </div>
        </form>
      </section>

      {/* Rules accordion */}
      <section className={`${panelBg} rounded-xl overflow-hidden`}>
        <div className={`px-6 py-4 flex justify-between items-center ${headerBg}`}>
          <div>
            <h3 className={`text-sm font-bold uppercase tracking-widest ${text}`}>Regelbibliotheek</h3>
            <p className={`text-xs mt-0.5 ${muted}`}>{rules.length} regels · {activeCount} actief</p>
          </div>
        </div>

        {loading ? (
          <div className={`p-12 text-center ${muted}`}>Laden…</div>
        ) : rules.length === 0 ? (
          <div className={`p-12 text-center ${muted}`}>
            Geen regels gevonden.{' '}
            <Link to="/rules/new" className="text-[#F46C22] font-bold hover:underline">Maak de eerste regel aan.</Link>
          </div>
        ) : (
          <div className={`divide-y ${divider}`}>
            {rules.map(rule => (
              <RuleRow
                key={rule.id}
                rule={rule}
                dark={dark}
                expanded={expandedId === rule.id}
                preview={previews[rule.id]}
                onExpand={() => toggleExpand(rule)}
                onToggle={() => handleToggle(rule.id)}
                onEdit={() => navigate(`/rules/${rule.id}`)}
                onDelete={() => handleDelete(rule.id, rule.name)}
                onRefreshPreview={() => loadPreview(rule)}
                tokens={{ text, muted, border, divider }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Accordion row ──────────────────────────────────────────────────────────

function RuleRow({ rule, dark, expanded, preview, onExpand, onToggle, onEdit, onDelete, onRefreshPreview, tokens }) {
  const { text, muted, border, divider } = tokens
  const rowHover   = dark ? 'hover:bg-[#2e1f18]'  : 'hover:bg-[#fff8f6]'
  const expandedBg = dark ? 'bg-[#1a0f09]'        : 'bg-white'
  const condBg     = dark ? 'bg-[#2a1d17]'        : 'bg-[#fce3da]'
  const previewBg  = dark ? 'bg-[#251913]'        : 'bg-[#fff1ec]'

  return (
    <div>
      {/* Row header */}
      <div
        className={`flex items-center px-6 py-4 cursor-pointer select-none transition-colors ${rowHover}`}
        onClick={onExpand}
      >
        {/* Active toggle */}
        <div className="mr-4 shrink-0" onClick={e => { e.stopPropagation(); onToggle() }}>
          <button
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              rule.is_active ? 'bg-[#F46C22]' : dark ? 'bg-[#40312b]' : 'bg-[#e0c0b2]'
            }`}
            title={rule.is_active ? 'Deactiveren' : 'Activeren'}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              rule.is_active ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-bold text-sm ${text}`}>{rule.name}</span>
            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
              rule.logic === 'AND'
                ? (dark ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-100 text-blue-700')
                : (dark ? 'bg-purple-900/30 text-purple-300' : 'bg-purple-100 text-purple-700')
            }`}>{rule.logic}</span>
            <span className={`text-[10px] ${muted}`}>
              {rule.conditions.length} conditie{rule.conditions.length !== 1 ? 's' : ''}
            </span>
          </div>
          {rule.category && (
            <p className={`text-[10px] mt-0.5 truncate ${muted}`}>
              {rule.category.category}
              {rule.category.subcategory ? ` › ${rule.category.subcategory}` : ''}
              {rule.category.destination ? ` › ${rule.category.destination}` : ''}
            </p>
          )}
        </div>

        {/* Priority */}
        <div className="mx-4 text-center shrink-0">
          <p className={`text-[9px] font-bold uppercase tracking-widest ${muted}`}>Prio</p>
          <p className={`text-sm font-black leading-none ${text}`}>{rule.priority}</p>
        </div>

        {/* Category badge (md+) */}
        {rule.category && (
          <span className={`hidden md:inline-block mr-4 px-2.5 py-1 rounded text-[10px] font-black uppercase shrink-0 ${
            dark ? 'bg-[#F46C22]/10 text-[#F46C22]' : 'bg-[#f46c22]/10 text-[#a23f00]'
          }`}>
            {rule.category.category}
          </span>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 ml-2 shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={onEdit} title="Bewerken"
            className={`p-1.5 rounded-lg transition-colors ${muted} hover:text-[#F46C22]`}
          >
            <span className="material-symbols-outlined text-sm">edit</span>
          </button>
          <button
            onClick={onDelete} title="Verwijderen"
            className={`p-1.5 rounded-lg transition-colors ${muted} hover:text-red-400`}
          >
            <span className="material-symbols-outlined text-sm">delete</span>
          </button>
        </div>

        {/* Chevron */}
        <span className={`material-symbols-outlined text-sm ml-2 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''} ${muted}`}>
          expand_more
        </span>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className={`px-6 py-5 border-t ${border} ${expandedBg}`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* ── Conditions ── */}
            <div>
              <h4 className={`text-[10px] font-black uppercase tracking-widest mb-3 ${muted}`}>
                Condities <span className={`ml-1 ${rule.logic === 'AND' ? 'text-blue-400' : 'text-purple-400'}`}>({rule.logic})</span>
              </h4>
              <div className="space-y-2">
                {rule.conditions.map((c, i) => (
                  <div key={i} className={`flex items-start gap-2 px-3 py-2.5 rounded-lg ${condBg}`}>
                    {i > 0 && (
                      <span className={`text-[9px] font-black uppercase shrink-0 mt-px ${
                        rule.logic === 'AND' ? 'text-blue-400' : 'text-purple-400'
                      }`}>{rule.logic}</span>
                    )}
                    <p className="text-xs font-mono flex-1 leading-relaxed">
                      <span className={`font-bold ${text}`}>{fieldLabel(c.field_to_match)}</span>
                      {' '}
                      <span className="text-[#F46C22]">{opLabel(c.operator)}</span>
                      {c.match_value != null && (
                        <> <span className={`px-1.5 py-0.5 rounded ${dark ? 'bg-[#40312b] text-[#ffb595]' : 'bg-[#fff1ec] text-[#a23f00]'}`}>
                          &ldquo;{c.match_value}&rdquo;
                        </span></>
                      )}
                    </p>
                  </div>
                ))}
              </div>
              {rule.notes && (
                <p className={`mt-3 text-xs italic ${muted}`}>{rule.notes}</p>
              )}
            </div>

            {/* ── Live preview ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>
                  Live Voorbeeld
                  {preview && !preview.loading && typeof preview.count === 'number' && (
                    <span className="ml-2 text-[#F46C22]">
                      {preview.count >= 50 ? '50+' : preview.count} treffer{preview.count !== 1 ? 's' : ''}
                    </span>
                  )}
                </h4>
                <button
                  onClick={onRefreshPreview}
                  className={`text-[10px] font-bold uppercase tracking-widest ${muted} hover:text-[#F46C22] flex items-center gap-1 transition-colors`}
                >
                  <span className="material-symbols-outlined text-xs">refresh</span>
                  Vernieuwen
                </button>
              </div>

              {!preview || preview.loading ? (
                <div className={`text-xs text-center py-8 ${muted}`}>
                  <span className="material-symbols-outlined text-2xl block mb-2 opacity-40">search</span>
                  {preview?.loading ? 'Laden…' : 'Laden…'}
                </div>
              ) : preview.error ? (
                <div className="text-xs text-red-400 py-2">{preview.error}</div>
              ) : preview.transactions?.length === 0 ? (
                <div className={`text-xs py-8 text-center ${muted}`}>
                  <span className="material-symbols-outlined text-2xl block mb-2 opacity-40">inbox</span>
                  Geen transacties voldoen aan deze regel.
                </div>
              ) : (
                <div className={`rounded-lg overflow-hidden divide-y ${divider}`}>
                  {preview.transactions.map(t => (
                    <div key={t.id} className={`px-3 py-2.5 ${previewBg}`}>
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold truncate ${text}`}>
                            {t.counterparty_name || t.description || '—'}
                          </p>
                          {t.description && t.counterparty_name && (
                            <p className={`text-[10px] truncate ${muted}`}>{t.description}</p>
                          )}
                        </div>
                        <span className={`text-xs font-bold shrink-0 tabular-nums ${
                          parseFloat(t.amount) >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {parseFloat(t.amount) >= 0 ? '+' : ''}€{Math.abs(parseFloat(t.amount)).toFixed(2)}
                        </span>
                      </div>
                      <p className={`text-[10px] mt-0.5 ${muted}`}>{t.date}</p>
                    </div>
                  ))}
                  {preview.count > 20 && (
                    <p className={`text-[10px] text-center py-2 ${muted}`}>
                      … en {preview.count - 20} meer (max. 20 getoond)
                    </p>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
