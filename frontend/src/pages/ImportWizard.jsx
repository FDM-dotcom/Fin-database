import { useState } from 'react'
import { api } from '@/api'
import WizardNav from '@/components/wizard/WizardNav'
import StepUpload from '@/components/wizard/StepUpload'
import StepMapping from '@/components/wizard/StepMapping'
import StepDuplicates from '@/components/wizard/StepDuplicates'
import StepIban from '@/components/wizard/StepIban'
import StepConfirm from '@/components/wizard/StepConfirm'

export default function ImportWizard({ dark }) {
  const [step, setStep] = useState(1)
  const [parsedFiles, setParsedFiles] = useState([])       // [{id, file, fileName, bankType, headers, rows, rowCount}]
  const [activeFileIdx, setActiveFileIdx] = useState(0)
  const [mappings, setMappings] = useState({})              // {fileId: [ColumnMapping]}
  const [duplicateState, setDuplicateState] = useState(null)
  const [accountIban, setAccountIban] = useState('')
  const [accounts, setAccounts] = useState(null)

  // Load accounts on first render
  useState(() => {
    api.accounts.list().then(setAccounts).catch(console.error)
  })

  function updateMappings(fileId, newMappings) {
    setMappings((prev) => ({ ...prev, [fileId]: newMappings }))
  }

  function updateDuplicateState(updater) {
    setDuplicateState((prev) =>
      typeof updater === 'function' ? updater(prev || {}) : updater
    )
  }

  // Navigation guards: what steps can be accessed?
  function canGoTo(n) {
    if (n === 1) return true
    if (n === 2) return parsedFiles.length > 0
    if (n === 3) return parsedFiles.length > 0
    if (n === 4) return parsedFiles.length > 0
    if (n === 5) return parsedFiles.length > 0
    return false
  }

  function next() {
    if (step < 5) setStep((s) => s + 1)
  }

  function prev() {
    if (step > 1) setStep((s) => s - 1)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Transacties importeren</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Volg de stappen om CSV-bestanden te importeren en te verrijken.
        </p>
      </div>

      {/* Account selector */}
      <div className="mb-5 flex items-center gap-3">
        <label className="text-sm text-[var(--text-muted)] whitespace-nowrap">Rekening:</label>
        <select
          value={accountIban}
          onChange={(e) => setAccountIban(e.target.value)}
          className="flex-1 max-w-sm bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">— Selecteer rekening —</option>
          {(accounts || []).map((a) => (
            <option key={a.id} value={a.iban || ''}>
              {a.name} {a.iban ? `(${a.iban})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Main layout: nav + content */}
      <div className="flex gap-8 flex-1 min-h-0">
        <WizardNav currentStep={step} onStep={setStep} canGoTo={canGoTo} />

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Step content */}
          <div className="flex-1 overflow-y-auto pb-6">
            {step === 1 && (
              <StepUpload
                parsedFiles={parsedFiles}
                onFilesChange={(files) => {
                  setParsedFiles(files)
                  setActiveFileIdx(0)
                }}
              />
            )}
            {step === 2 && (
              <StepMapping
                parsedFiles={parsedFiles}
                activeFileIdx={activeFileIdx}
                mappings={mappings}
                onMappingsChange={updateMappings}
              />
            )}
            {step === 3 && (
              <StepDuplicates
                parsedFiles={parsedFiles}
                mappings={mappings}
                accountIban={accountIban}
                duplicateState={duplicateState}
                onDuplicateStateChange={updateDuplicateState}
              />
            )}
            {step === 4 && (
              <StepIban
                parsedFiles={parsedFiles}
                mappings={mappings}
                duplicateState={duplicateState}
              />
            )}
            {step === 5 && (
              <StepConfirm
                parsedFiles={parsedFiles}
                mappings={mappings}
                duplicateState={duplicateState}
                accountIban={accountIban}
                onDone={() => {}}
              />
            )}
          </div>

          {/* Bottom navigation */}
          <div className="flex items-center justify-between pt-4 border-t border-[var(--border)] mt-2 shrink-0">
            <button
              onClick={prev}
              disabled={step === 1}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--surface-2)] disabled:opacity-40 transition-colors"
            >
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Vorige
            </button>

            <span className="text-xs text-[var(--text-muted)]">Stap {step} van 5</span>

            {step < 5 ? (
              <button
                onClick={next}
                disabled={!canGoTo(step + 1)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                Volgende
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            ) : (
              <div className="w-28" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
