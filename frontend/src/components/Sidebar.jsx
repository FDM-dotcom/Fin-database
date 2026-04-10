import { NavLink } from 'react-router-dom'

const NAV = [
  { to: '/', icon: 'dashboard', label: 'Dashboard', exact: true },
  { to: '/transacties', icon: 'table_rows', label: 'Transacties' },
  { to: '/budget', icon: 'account_balance_wallet', label: 'Budget' },
  { to: '/import', icon: 'upload_file', label: 'Import' },
  { to: '/rules', icon: 'rule', label: 'Regels' },
]

const NAV_BOTTOM = [
  { to: '/configuratie', icon: 'settings', label: 'Configuratie' },
]

export default function Sidebar({ dark, onToggleTheme }) {
  const bg = dark ? 'bg-[#251913]' : 'bg-[#fff1ec]'
  const text = dark ? 'text-[#f6ddd4]/50' : 'text-[#251913]/60'
  const activeClass = dark
    ? 'bg-[#2a1d17] border-r-4 border-[#F46C22] text-[#F46C22]'
    : 'bg-white text-[#F46C22] shadow-sm'
  const hoverClass = dark
    ? 'hover:bg-[#2a1d17] hover:text-[#f6ddd4] hover:pl-5'
    : 'hover:text-[#F46C22] hover:translate-x-1'

  return (
    <aside className={`h-screen w-64 fixed left-0 top-0 ${bg} flex flex-col py-8 px-4 z-50`}>
      {/* Logo */}
      <div className="mb-10 px-4">
        <h1 className="text-[#F46C22] font-black italic text-2xl tracking-tighter">TD Finance</h1>
        <p className={`text-[10px] tracking-[0.2em] uppercase font-bold ${dark ? 'text-[#f6ddd4]/40' : 'text-[#251913]/40'}`}>
          Financieel Overzicht
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-sm cursor-pointer transition-all font-bold text-xs uppercase tracking-widest ${
                isActive ? activeClass : `${text} ${hoverClass}`
              }`
            }
          >
            <span className="material-symbols-outlined text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom nav + theme toggle */}
      <div className="mt-auto space-y-1 pt-4 border-t border-[#40312b]/30">
        {NAV_BOTTOM.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-sm cursor-pointer transition-all font-bold text-xs uppercase tracking-widest ${
                isActive ? activeClass : `${text} ${hoverClass}`
              }`
            }
          >
            <span className="material-symbols-outlined text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          onClick={onToggleTheme}
          className={`flex items-center gap-3 px-4 py-3 w-full rounded-sm transition-all font-bold text-xs uppercase tracking-widest ${text} ${hoverClass}`}
        >
          <span className="material-symbols-outlined text-lg">{dark ? 'light_mode' : 'dark_mode'}</span>
          <span>{dark ? 'Licht thema' : 'Donker thema'}</span>
        </button>
      </div>
    </aside>
  )
}
