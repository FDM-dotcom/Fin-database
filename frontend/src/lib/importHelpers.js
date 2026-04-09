/**
 * Hulpfuncties voor de importwizard.
 * Banknaam-detectie, encodering, kolomnormalisatie en SHA256 berekening.
 */

// ------------------------------------------------------------------
// Bank-type detectie op basis van CSV-headers
// ------------------------------------------------------------------

const BANK_SIGNATURES = {
  rabobank: ['IBAN/BBAN', 'Volgnr', 'Datum', 'Rentedatum', 'Bedrag', 'Saldo na trn', 'Tegenrekening IBAN/BBAN'],
  bunq: ['Date', 'Interest Date', 'Amount', 'Account', 'Counterpart', 'Name', 'Description'],
  ing: ['Datum', 'Naam / Omschrijving', 'Rekening', 'Tegenrekening', 'Code', 'Af Bij', 'Bedrag (EUR)', 'MutatieSoort', 'Mededelingen'],
  abn_amro: ['Datum', 'Naam / Omschrijving', 'Rekening', 'Tegenrekening', 'Code', 'Af Bij', 'Bedrag (EUR)'],
}

export function detectBankType(headers) {
  const headerSet = new Set(headers.map((h) => h.trim()))
  for (const [bank, sig] of Object.entries(BANK_SIGNATURES)) {
    const matched = sig.filter((h) => headerSet.has(h)).length
    if (matched >= Math.ceil(sig.length * 0.6)) return bank
  }
  return 'unknown'
}

// ------------------------------------------------------------------
// Default kolomkoppelingen per bank
// ------------------------------------------------------------------

const TARGET_COLUMNS = [
  'Datum', 'Bedrag', 'Van IBAN', 'Naam van rekening',
  'Naar IBAN', 'Naam naar rekening', 'Transactiedetails',
  'Categorie', 'Subcategorie', 'Bestemming', 'Leeg',
]

const BANK_DEFAULTS = {
  rabobank: {
    'Datum':              ['Datum'],
    'Bedrag':             ['Bedrag'],
    'Van IBAN':           ['IBAN/BBAN'],
    'Naam van rekening':  [],
    'Naar IBAN':          ['Tegenrekening IBAN/BBAN'],
    'Naam naar rekening': ['Naam tegenpartij'],
    'Transactiedetails':  ['Omschrijving-1', 'Omschrijving-2', 'Omschrijving-3'],
  },
  bunq: {
    'Datum':              ['Date'],
    'Bedrag':             ['Amount'],
    'Van IBAN':           ['Account'],
    'Naam van rekening':  [],
    'Naar IBAN':          ['Counterpart'],
    'Naam naar rekening': ['Name'],
    'Transactiedetails':  ['Description'],
  },
  ing: {
    'Datum':              ['Datum'],
    'Bedrag':             ['Bedrag (EUR)'],
    'Van IBAN':           ['Rekening'],
    'Naam van rekening':  [],
    'Naar IBAN':          ['Tegenrekening'],
    'Naam naar rekening': ['Naam / Omschrijving'],
    'Transactiedetails':  ['Mededelingen'],
  },
  abn_amro: {
    'Datum':              ['Datum'],
    'Bedrag':             ['Bedrag (EUR)'],
    'Van IBAN':           ['Rekening'],
    'Naam van rekening':  [],
    'Naar IBAN':          ['Tegenrekening'],
    'Naam naar rekening': ['Naam / Omschrijving'],
    'Transactiedetails':  [],
  },
}

export function getDefaultMappings(bankType) {
  const defaults = BANK_DEFAULTS[bankType] || {}
  return TARGET_COLUMNS.map((col) => ({
    targetColumn: col,
    sourceColumns: defaults[col] || [],
    separator: ' ',
  }))
}

export { TARGET_COLUMNS }

// ------------------------------------------------------------------
// Bestand lezen met specifieke encoding (voor Rabobank: windows-1252)
// ------------------------------------------------------------------

export function readFileWithEncoding(file, encoding = 'utf-8') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = reject
    if (encoding === 'windows-1252' || encoding === 'cp1252') {
      const blob = new Blob([file])
      const decoder = new TextDecoder('windows-1252')
      file.arrayBuffer().then((buf) => resolve(decoder.decode(buf))).catch(reject)
    } else {
      reader.readAsText(file, encoding)
    }
  })
}

// ------------------------------------------------------------------
// Datumnormalisatie → YYYY-MM-DD
// ------------------------------------------------------------------

export function normalizeDate(raw, bankType) {
  if (!raw) return ''
  const s = raw.trim()

  // Rabobank: YYYY-MM-DD (al correct)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // ING / bunq: DD-MM-YYYY
  const dmy = s.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`

  // DD/MM/YYYY
  const dmy2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (dmy2) return `${dmy2[3]}-${dmy2[2]}-${dmy2[1]}`

  // YYYYMMDD
  const ymd = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`

  return s
}

// ------------------------------------------------------------------
// Bedragsnormalisatie → decimale string (bijv. "-12.50")
// ------------------------------------------------------------------

export function normalizeAmount(raw, bankType, rawRow = {}) {
  if (!raw) return '0'
  let s = String(raw).trim()

  // ING: "Af Bij" kolom bepaalt teken, bedrag altijd positief
  if (bankType === 'ing' || bankType === 'abn_amro') {
    const direction = (rawRow['Af Bij'] || rawRow['af_bij'] || '').trim().toLowerCase()
    s = s.replace('.', '').replace(',', '.')
    const num = parseFloat(s)
    if (isNaN(num)) return '0'
    return direction === 'af' ? String(-Math.abs(num)) : String(Math.abs(num))
  }

  // Rabobank: komma als decimaalscheiding, punt als duizendtalscheiding
  if (bankType === 'rabobank') {
    s = s.replace(/\./g, '').replace(',', '.')
  }

  // bunq: punt als decimaalscheiding (al correct)
  const num = parseFloat(s)
  return isNaN(num) ? '0' : String(num)
}

// ------------------------------------------------------------------
// Kolomkoppelingen toepassen op rijen
// ------------------------------------------------------------------

export function applyMappingToRows(rows, mappings, bankType) {
  return rows.map((row) => {
    const result = { _raw: row }
    for (const mapping of mappings) {
      const { targetColumn, sourceColumns, separator } = mapping
      if (!sourceColumns || sourceColumns.length === 0) {
        result[targetColumn] = ''
        continue
      }
      const parts = sourceColumns
        .map((col) => (row[col] || '').trim())
        .filter(Boolean)
      result[targetColumn] = parts.join(separator || ' ')
    }

    // Datum en bedrag normaliseren
    if (result['Datum']) {
      result['Datum'] = normalizeDate(result['Datum'], bankType)
    }
    if (result['Bedrag']) {
      result['Bedrag'] = normalizeAmount(result['Bedrag'], bankType, row)
    }

    return result
  })
}

// ------------------------------------------------------------------
// SHA256 via Web Crypto API (voor external_id van bunq / onbekende banken)
// ------------------------------------------------------------------

export async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function computeExternalId(row, bankType) {
  if (bankType === 'rabobank') {
    return row['Volgnr'] || null
  }
  // Bunq en overigen: SHA256 van datum|bedrag|tegenpartij|omschrijving
  const parts = [
    row['Date'] || row['Datum'] || '',
    row['Amount'] || row['Bedrag'] || '',
    row['Counterpart'] || row['Tegenrekening'] || '',
    row['Description'] || row['Omschrijving'] || '',
  ]
  return sha256(parts.join('|'))
}
