import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import RulesOverview from './pages/RulesOverview'
import RuleConfiguration from './pages/RuleConfiguration'
import ImportData from './pages/ImportData'
import Dashboard from './pages/Dashboard'

export default function App() {
  const [dark, setDark] = useState(true)

  useEffect(() => {
    document.documentElement.className = dark ? 'dark' : 'light'
  }, [dark])

  return (
    <div className={dark ? 'bg-[#1c110b] text-[#f6ddd4]' : 'bg-[#fff8f6] text-[#251913]'} style={{ minHeight: '100vh' }}>
      <Sidebar dark={dark} onToggleTheme={() => setDark(d => !d)} />
      <div className="ml-64">
        <Routes>
          <Route path="/" element={<Dashboard dark={dark} />} />
          <Route path="/rules" element={<RulesOverview dark={dark} />} />
          <Route path="/rules/new" element={<RuleConfiguration dark={dark} />} />
          <Route path="/rules/:id" element={<RuleConfiguration dark={dark} />} />
          <Route path="/import" element={<ImportData dark={dark} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}
