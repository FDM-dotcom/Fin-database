const STEPS = [
  { n: 1, label: 'Uploaden',   desc: 'CSV bestanden' },
  { n: 2, label: 'Koppelen',   desc: 'Kolommen toewijzen' },
  { n: 3, label: 'Duplicaten', desc: 'Dubbele checks' },
  { n: 4, label: 'IBAN',       desc: 'Rekeningnamen' },
  { n: 5, label: 'Importeren', desc: 'Bevestig & importeer' },
]

export default function WizardNav({ currentStep, onStep, canGoTo }) {
  return (
    <nav className="flex flex-col gap-1 w-48 shrink-0">
      {STEPS.map(({ n, label, desc }) => {
        const done = n < currentStep
        const active = n === currentStep
        const reachable = canGoTo(n)

        return (
          <button
            key={n}
            onClick={() => reachable && onStep(n)}
            disabled={!reachable}
            className={[
              'flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
              active
                ? 'bg-blue-600 text-white'
                : done && reachable
                  ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30 cursor-pointer'
                  : reachable
                    ? 'hover:bg-[var(--surface-2)] text-[var(--text-primary)] cursor-pointer'
                    : 'opacity-40 cursor-not-allowed text-[var(--text-muted)]',
            ].join(' ')}
          >
            <span
              className={[
                'flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 mt-0.5',
                active
                  ? 'bg-white/20'
                  : done
                    ? 'bg-green-500 text-white'
                    : 'bg-[var(--surface-2)]',
              ].join(' ')}
            >
              {done ? '✓' : n}
            </span>
            <span className="leading-tight">
              <div className="text-sm font-medium">{label}</div>
              <div className={`text-xs ${active ? 'text-blue-200' : 'text-[var(--text-muted)]'}`}>
                {desc}
              </div>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
