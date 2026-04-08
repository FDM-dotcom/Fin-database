import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

export default function Dashboard({ dark }) {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.stats().then(setStats).catch(e => setError(e.message))
  }, [])

  const card = dark
    ? 'bg-[#2a1d17] border-l-4 border-[#F46C22] p-6 rounded-xl'
    : 'bg-white border-l-4 border-[#F46C22] p-6 rounded-xl shadow'

  const label = dark ? 'text-[#f6ddd4]/50' : 'text-[#251913]/50'
  const val = dark ? 'text-[#f6ddd4]' : 'text-[#251913]'

  return (
    <div className="p-8 min-h-screen">
      <header className="mb-10">
        <span className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-[#F46C22]' : 'text-[#a23f00]'}`}>
          Financieel Overzicht
        </span>
        <h2 className={`text-4xl font-extrabold tracking-tighter mt-1 ${val}`}>DASHBOARD</h2>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 text-red-400 text-sm rounded-lg">
          Kan geen verbinding maken met de API: {error}. Zorg dat de API draait op poort 8000.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'Actieve Regels', value: stats?.active_rules ?? '—', icon: 'rule' },
          { label: 'Transacties', value: stats?.total_transactions ?? '—', icon: 'receipt_long' },
          { label: 'Gecategoriseerd', value: stats?.categorized ?? '—', icon: 'category' },
          { label: 'Dekking', value: stats ? `${stats.categorized_pct}%` : '—', icon: 'donut_large' },
        ].map(s => (
          <div key={s.label} className={card}>
            <span className={`material-symbols-outlined text-[#F46C22] mb-3`}>{s.icon}</span>
            <p className={`text-3xl font-black tracking-tighter ${val}`}>{s.value}</p>
            <p className={`text-xs font-bold uppercase tracking-widest mt-1 ${label}`}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link
          to="/rules"
          className="flex items-center gap-4 p-6 bg-gradient-to-br from-[#f46c22] to-[#ffb595] text-[#571e00] rounded-xl font-black uppercase tracking-widest text-sm hover:scale-[1.02] transition-transform"
        >
          <span className="material-symbols-outlined text-2xl">rule</span>
          <span>Beheer Regels</span>
        </Link>
        <Link
          to="/import"
          className={`flex items-center gap-4 p-6 rounded-xl font-black uppercase tracking-widest text-sm hover:scale-[1.02] transition-transform border ${
            dark ? 'border-[#594238] text-[#f6ddd4]/70 hover:text-[#f6ddd4]' : 'border-[#e0c0b2] text-[#251913]/70 hover:text-[#251913]'
          }`}
        >
          <span className="material-symbols-outlined text-2xl">upload_file</span>
          <span>Importeer CSV</span>
        </Link>
      </div>
    </div>
  )
}
