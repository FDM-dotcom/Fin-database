import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import RulesOverview from './pages/RulesOverview'
import RuleConfiguration from './pages/RuleConfiguration'
import ImportData from './pages/ImportData'
import ImportWizard from './pages/ImportWizard'
import Dashboard from './pages/Dashboard'
import Configuratie from './pages/Configuratie'
import Transactions from './pages/Transactions'
import Budget from './pages/Budget'

export default function App() {
  const [dark, setDark] = useState(true)

  useEffect(() => {
    document.documentElement.className = dark ? 'dark' : 'light'
  }, [dark])

  return (
    <div className={dark ? 'bg-[#1c110b] text-[#f6ddd4]' : 'bg-[#fff8f6] text-[#251913]'} style={{ minHeight: '100vh' }}>
      <Sidebar dark={dark} onToggleTheme={() => setDark(d => !d)} />
      <div className="ml-64 min-h-screen p-6">
        <Routes>
          <Route path="/" element={<Dashboard dark={dark} />} />
          <Route path="/rules" element={<RulesOverview dark={dark} />} />
          <Route path="/rules/new" element={<RuleConfiguration dark={dark} />} />
          <Route path="/rules/:id" element={<RuleConfiguration dark={dark} />} />
          <Route path="/import" element={<ImportWizard dark={dark} />} />
          <Route path="/import/legacy" element={<ImportData dark={dark} />} />
          <Route path="/transacties" element={<Transactions dark={dark} />} />
          <Route path="/budget" element={<Budget dark={dark} />} />
          <Route path="/configuratie" element={<Configuratie dark={dark} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}
