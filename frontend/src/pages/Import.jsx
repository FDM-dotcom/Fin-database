import { useMemo, useState } from 'react'
import WizardProgress from '@/components/import/WizardProgress'
import UploadStep from '@/components/import/steps/UploadStep'
import MappingStep from '@/components/import/steps/MappingStep'
import DuplicatesStep from '@/components/import/steps/DuplicatesStep'
import AccountsStep from '@/components/import/steps/AccountsStep'
import ConfirmStep from '@/components/import/steps/ConfirmStep'
import { getDefaultMappings } from '@/lib/importHelpers'

export default function Import() {
  const [step, setStep] = useState(1)
  const [parsedFiles, setParsedFiles] = useState([])
  const [activeFileIdx, setActiveFileIdx] = useState(0)
  const [mappings, setMappings] = useState({})
  const [duplicateState, setDuplicateState] = useState(null)

  // Auto-detecteer het eigen IBAN uit de eerste rij van het eerste bestand
  const detectedIban = useMemo(() => {
    if (!parsedFiles.length) return ''
    const pf = parsedFiles[0]
    const fileMappings = mappings[pf.id] || getDefaultMappings(pf.bankType)
    const vanIbanMapping = fileMappings.find((m) => m.targetColumn === 'Van IBAN')
    if (!vanIbanMapping?.sourceColumns.length) return ''
    const sourceCol = vanIbanMapping.sourceColumns[0]
    return (pf.rows[0]?.[sourceCol] || '').trim().toUpperCase()
  }, [parsedFiles, mappings])

  function updateMappings(fileId, newMappings) {
    const srcFile = parsedFiles.find((f) => f.id === fileId)
    setMappings((prev) => {
      const updated = { ...prev, [fileId]: newMappings }
      if (srcFile) {
        for (const pf of parsedFiles) {
          if (pf.id !== fileId && pf.bankType === srcFile.bankType) {
            updated[pf.id] = newMappings
          }
        }
      }
      return updated
    })
  }

  function updateDuplicateState(updater) {
    setDuplicateState((prev) =>
      typeof updater === 'function' ? updater(prev || {}) : updater
    )
  }

  function canGoTo(n) {
    if (n === 1) return true
    if (n <= 5) return parsedFiles.length > 0
    return false
  }

  return (
    <div className="flex flex-col h-full">
      {/* Paginatitel */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Transacties importeren</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Volg de stappen om CSV-bestanden te importeren en te verrijken.
        </p>
      </div>

      {/* Horizontale voortgangsbalk */}
      <WizardProgress currentStep={step} onStep={setStep} canGoTo={canGoTo} />

      {/* Stap-inhoud */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto pb-6">
          {step === 1 && (
            <UploadStep
              parsedFiles={parsedFiles}
              onFilesChange={(files) => {
                setParsedFiles(files)
                setActiveFileIdx(0)
              }}
            />
          )}
          {step === 2 && (
            <MappingStep
              parsedFiles={parsedFiles}
              activeFileIdx={activeFileIdx}
              mappings={mappings}
              onMappingsChange={updateMappings}
              onActiveFileChange={setActiveFileIdx}
              detectedIban={detectedIban}
            />
          )}
          {step === 3 && (
            <DuplicatesStep
              parsedFiles={parsedFiles}
              mappings={mappings}
              detectedIban={detectedIban}
              duplicateState={duplicateState}
              onDuplicateStateChange={updateDuplicateState}
            />
          )}
          {step === 4 && (
            <AccountsStep
              parsedFiles={parsedFiles}
              mappings={mappings}
              duplicateState={duplicateState}
            />
          )}
          {step === 5 && (
            <ConfirmStep
              parsedFiles={parsedFiles}
              mappings={mappings}
              duplicateState={duplicateState}
              detectedIban={detectedIban}
              onDone={() => {}}
            />
          )}
        </div>

        {/* Navigatieknoppen onderaan */}
        <div className="flex items-center justify-between pt-4 border-t border-[var(--border)] mt-2 shrink-0">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--surface-2)] disabled:opacity-40 transition-colors"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Vorige
          </button>

          <span className="text-xs text-[var(--text-muted)]">Stap {step} van 5</span>

          {step < 5 ? (
            <button
              onClick={() => setStep((s) => Math.min(5, s + 1))}
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
  )
}
