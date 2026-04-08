import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function RulesOverview({ dark }) {
  const [rules, setRules] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const bg = dark ? 'bg-[#1c110b]' : 'bg-[#fff8f6]'
  const cardBg = dark ? 'bg-[#2a1d17]' : 'bg-white shadow'
  const tableBg = dark ? 'bg-[#251913]' : 'bg-[#fff1ec]'
  const tableRowHover = dark ? 'hover:bg-[#40312b]/30' : 'hover:bg-[#fff8f6]'
  const divider = dark ? 'divide-[#594238]/20' : 'divide-[#e0c0b2]/30'
  const text = dark ? 'text-[#f6ddd4]' : 'text-[#251913]'
  const muted = dark ? 'text-[#f6ddd4]/50' : 'text-[#251913]/50'
  const headerBg = dark ? 'bg-[#352721]/50' : 'bg-[#fce3da]'

  useEffect(() => {
    Promise.all([api.rules.list(), api.stats()])
      .then(([r, s]) => { setRules(r); setStats(s) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggle(id) {
    const updated = await api.rules.toggle(id)
    setRules(rs => rs.map(r => r.id === id ? { ...r, is_active: updated.is_active } : r))
  }

  async function handleDelete(id, name) {
    if (!confirm(`Regel "${name}" verwijderen?`)) return
    await api.rules.delete(id)
    setRules(rs => rs.filter(r => r.id !== id))
  }

  const activeCount = rules.filter(r => r.is_active).length

  return (
    <div className={`p-8 min-h-screen ${bg}`}>
      {/* Header */}
      <header className="mb-10 flex justify-between items-end">
        <div>
          <span className="text-[#F46C22] font-black tracking-widest text-xs uppercase">Categorisatie Engine</span>
          <h2 className={`text-4xl font-extrabold tracking-tighter mt-1 ${text}`}>REGELS OVERZICHT</h2>
          <p className={`text-sm mt-1 ${muted}`}>Beheer categorisatieregels voor automatische transactieclassificatie</p>
        </div>
        <Link
          to="/rules/new"
          className="px-6 py-3 bg-gradient-to-br from-[#f46c22] to-[#ffb595] text-[#571e00] font-black uppercase text-xs rounded-lg shadow-lg hover:scale-[1.02] transition-transform flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          Nieuwe Regel
        </Link>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 text-red-400 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Stats cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Actieve Regels', value: activeCount, icon: 'account_tree', accent: '#F46C22' },
          { label: 'Auto-gecategoriseerd', value: stats ? `${stats.categorized_pct}%` : '—', icon: 'auto_awesome', accent: '#8ccdff' },
          { label: 'Transacties totaal', value: stats?.total_transactions ?? '—', icon: 'receipt_long', accent: '#ffb595' },
        ].map(s => (
          <div key={s.label} className={`${cardBg} p-6 rounded-xl border-l-4`} style={{ borderColor: s.accent }}>
            <span className="material-symbols-outlined mb-3" style={{ color: s.accent }}>{s.icon}</span>
            <p className={`text-3xl font-black tracking-tighter ${text}`}>{s.value}</p>
            <p className={`text-xs font-bold uppercase tracking-widest mt-1 ${muted}`}>{s.label}</p>
          </div>
        ))}
      </section>

      {/* Table */}
      <section className={`${tableBg} rounded-xl overflow-hidden`}>
        <div className={`px-8 py-5 flex justify-between items-center ${headerBg}`}>
          <div>
            <h3 className={`text-lg font-bold tracking-tight ${text}`}>Actieve Regelbibliotheek</h3>
            <p className={`text-xs mt-0.5 ${muted}`}>{rules.length} regels geladen</p>
          </div>
        </div>

        {loading ? (
          <div className={`p-12 text-center ${muted}`}>Laden...</div>
        ) : rules.length === 0 ? (
          <div className={`p-12 text-center ${muted}`}>
            Geen regels gevonden.{' '}
            <Link to="/rules/new" className="text-[#F46C22] font-bold hover:underline">Maak de eerste regel aan.</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`text-[10px] font-bold uppercase tracking-[0.2em] ${muted} border-b border-[#594238]/20`}>
                  <th className="px-8 py-4">Regel</th>
                  <th className="px-8 py-4">Logica</th>
                  <th className="px-8 py-4">Categorie</th>
                  <th className="px-8 py-4">Prioriteit</th>
                  <th className="px-8 py-4">Actief</th>
                  <th className="px-8 py-4 text-right">Acties</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${divider}`}>
                {rules.map(rule => (
                  <tr key={rule.id} className={`${tableRowHover} transition-colors`}>
                    <td className="px-8 py-5">
                      <p className={`font-bold text-sm ${text}`}>{rule.name}</p>
                      <p className={`text-xs mt-0.5 font-mono ${muted}`}>
                        {rule.conditions.length} conditie{rule.conditions.length !== 1 ? 's' : ''} ({rule.logic})
                      </p>
                    </td>
                    <td className="px-8 py-5">
                      <div className={`text-xs font-mono space-y-1`}>
                        {rule.conditions.slice(0, 2).map((c, i) => (
                          <div key={i} className={`px-2 py-1 rounded ${dark ? 'bg-[#40312b]' : 'bg-[#fce3da]'} ${muted}`}>
                            {c.field_to_match} <span className="text-[#F46C22]">{c.operator}</span> {c.match_value ?? ''}
                          </div>
                        ))}
                        {rule.conditions.length > 2 && (
                          <span className={`text-[10px] ${muted}`}>+{rule.conditions.length - 2} meer</span>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      {rule.category ? (
                        <div>
                          <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${dark ? 'bg-[#F46C22]/10 text-[#F46C22]' : 'bg-[#f46c22]/10 text-[#a23f00]'}`}>
                            {rule.category.category}
                          </span>
                          {rule.category.subcategory && (
                            <p className={`text-[10px] mt-1 ${muted}`}>{rule.category.subcategory}{rule.category.destination ? ` › ${rule.category.destination}` : ''}</p>
                          )}
                        </div>
                      ) : <span className={muted}>—</span>}
                    </td>
                    <td className="px-8 py-5">
                      <span className={`text-sm font-bold ${muted}`}>{rule.priority}</span>
                    </td>
                    <td className="px-8 py-5">
                      <button
                        onClick={() => handleToggle(rule.id)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${rule.is_active ? 'bg-[#F46C22]' : dark ? 'bg-[#40312b]' : 'bg-[#e0c0b2]'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${rule.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </td>
                    <td className="px-8 py-5 text-right space-x-1">
                      <button
                        onClick={() => navigate(`/rules/${rule.id}`)}
                        className={`p-2 rounded-lg transition-colors ${muted} hover:text-[#F46C22]`}
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id, rule.name)}
                        className={`p-2 rounded-lg transition-colors ${muted} hover:text-red-400`}
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
