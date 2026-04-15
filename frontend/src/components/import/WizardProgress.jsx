const STEPS = [
  { n: 1, label: 'Uploaden',    desc: 'CSV bestanden' },
  { n: 2, label: 'Koppelen',    desc: 'Kolommen toewijzen' },
  { n: 3, label: 'Duplicaten',  desc: 'Dubbele checks' },
  { n: 4, label: 'Rekeningen',  desc: 'IBAN herkenning' },
  { n: 5, label: 'Importeren',  desc: 'Bevestig & importeer' },
]

export default function WizardProgress({ currentStep, onStep, canGoTo }) {
  return (
    <nav className="flex items-start gap-0 mb-6 shrink-0">
      {STEPS.map(({ n, label, desc }, idx) => {
        const done = n < currentStep
        const active = n === currentStep
        const reachable = canGoTo(n)

        return (
          <div key={n} className="flex items-center flex-1 min-w-0">
            {/* Step button */}
            <button
              onClick={() => reachable && onStep(n)}
              disabled={!reachable}
              className={[
                'flex flex-col items-center gap-1 px-2 py-2 rounded-lg transition-colors flex-1 min-w-0',
                active
                  ? 'cursor-default'
                  : reachable
                    ? 'hover:bg-[var(--surface-2)] cursor-pointer'
                    : 'opacity-40 cursor-not-allowed',
              ].join(' ')}
            >
              {/* Circle indicator */}
              <span
                className={[
                  'flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 transition-colors',
                  active
                    ? 'bg-blue-600 text-white'
                    : done
                      ? 'bg-green-500 text-white'
                      : 'bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]',
                ].join(' ')}
              >
                {done ? (
                  <span className="material-symbols-outlined text-sm">check</span>
                ) : n}
              </span>
              {/* Labels */}
              <span className="leading-tight text-center">
                <div
                  className={`text-xs font-medium truncate ${
                    active ? 'text-blue-400' : done ? 'text-green-400' : 'text-[var(--text-primary)]'
                  }`}
                >
                  {label}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] truncate hidden sm:block">
                  {desc}
                </div>
              </span>
            </button>

            {/* Connector line (not after last step) */}
            {idx < STEPS.length - 1 && (
              <div
                className={[
                  'h-0.5 w-6 shrink-0 mx-1 rounded-full transition-colors',
                  n < currentStep ? 'bg-green-500' : 'bg-[var(--border)]',
                ].join(' ')}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}
