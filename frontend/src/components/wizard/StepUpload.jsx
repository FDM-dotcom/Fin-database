import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { detectBankType, readFileWithEncoding } from '@/lib/importHelpers'
import { generateId } from '@/lib/utils'

const BANK_LABELS = {
  rabobank: { label: 'Rabobank', color: 'bg-orange-500' },
  bunq:     { label: 'bunq',     color: 'bg-teal-500' },
  ing:      { label: 'ING',      color: 'bg-orange-600' },
  abn_amro: { label: 'ABN AMRO', color: 'bg-yellow-500 text-black' },
  unknown:  { label: 'Onbekend', color: 'bg-gray-500' },
}

function BankBadge({ bankType }) {
  const b = BANK_LABELS[bankType] || BANK_LABELS.unknown
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full text-white ${b.color}`}>
      {b.label}
    </span>
  )
}

async function parseFile(file) {
  // Rabobank: windows-1252 encoding
  const isRabo = file.name.toLowerCase().includes('rabo') ||
    file.name.toLowerCase().endsWith('.csv')

  // Try windows-1252 first for Rabobank, fall back to UTF-8
  let text
  try {
    const buf = await file.arrayBuffer()
    text = new TextDecoder('windows-1252').decode(buf)
  } catch {
    text = await readFileWithEncoding(file, 'utf-8')
  }

  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields || []
        const bankType = detectBankType(headers)
        resolve({
          id: generateId(),
          file,
          fileName: file.name,
          bankType,
          headers,
          rows: result.data,
          rowCount: result.data.length,
          errors: result.errors,
        })
      },
      error: reject,
    })
  })
}

export default function StepUpload({ parsedFiles, onFilesChange }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState({})

  async function handleFiles(fileList) {
    setLoading(true)
    try {
      const results = await Promise.all(Array.from(fileList).map(parseFile))
      // Deduplicate by filename
      const existing = new Set(parsedFiles.map((f) => f.fileName))
      const newFiles = results.filter((r) => !existing.has(r.fileName))
      onFilesChange([...parsedFiles, ...newFiles])
    } catch (e) {
      console.error('Fout bij parsen:', e)
    } finally {
      setLoading(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
  }

  function removeFile(id) {
    onFilesChange(parsedFiles.filter((f) => f.id !== id))
  }

  function toggleExpand(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold mb-1">CSV bestanden uploaden</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Ondersteunde banken: Rabobank, bunq, ING, ABN AMRO.
          Het banktype wordt automatisch herkend op basis van de kolomnamen.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={[
          'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
          dragging
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-[var(--border)] hover:border-blue-400 hover:bg-[var(--surface-2)]',
        ].join(' ')}
      >
        <span className="material-symbols-outlined text-4xl text-[var(--text-muted)] mb-2 block">
          upload_file
        </span>
        <p className="text-sm font-medium">
          Sleep CSV-bestanden hierheen of klik om te selecteren
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Meerdere bestanden tegelijk mogelijk
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
          Bestanden verwerken...
        </div>
      )}

      {/* Parsed files */}
      {parsedFiles.length > 0 && (
        <div className="flex flex-col gap-3">
          {parsedFiles.map((pf) => (
            <div
              key={pf.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] overflow-hidden"
            >
              {/* Header row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="material-symbols-outlined text-base text-[var(--text-muted)]">
                  table_view
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{pf.fileName}</span>
                    <BankBadge bankType={pf.bankType} />
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">
                    {pf.rowCount} rijen · {pf.headers.length} kolommen
                  </div>
                </div>
                <button
                  onClick={() => toggleExpand(pf.id)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1"
                  title={expanded[pf.id] ? 'Inklappen' : 'Voorbeeld tonen'}
                >
                  <span className="material-symbols-outlined text-sm">
                    {expanded[pf.id] ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
                <button
                  onClick={() => removeFile(pf.id)}
                  className="text-[var(--text-muted)] hover:text-red-400 px-1"
                  title="Verwijderen"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>

              {/* Preview table */}
              {expanded[pf.id] && pf.rows.length > 0 && (
                <div className="border-t border-[var(--border)] overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead className="bg-[var(--surface)] text-[var(--text-muted)]">
                      <tr>
                        {pf.headers.slice(0, 8).map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                        {pf.headers.length > 8 && (
                          <th className="px-3 py-2 text-left font-medium text-[var(--text-muted)]">
                            +{pf.headers.length - 8} meer
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {pf.rows.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-t border-[var(--border)]">
                          {pf.headers.slice(0, 8).map((h) => (
                            <td key={h} className="px-3 py-1.5 max-w-[160px] truncate">
                              {row[h] || ''}
                            </td>
                          ))}
                          {pf.headers.length > 8 && <td />}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {pf.rowCount > 10 && (
                    <p className="text-xs text-[var(--text-muted)] px-4 py-2">
                      Toont 10 van {pf.rowCount} rijen
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {parsedFiles.length === 0 && !loading && (
        <p className="text-sm text-[var(--text-muted)] text-center py-4">
          Nog geen bestanden geselecteerd
        </p>
      )}
    </div>
  )
}
