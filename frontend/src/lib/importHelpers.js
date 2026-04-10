/**
 * Hulpfuncties voor de importwizard.
 * Banknaam-detectie, encodering, kolomnormalisatie en SHA256 berekening.
 */

import { sha256 } from '@/lib/utils'

// ------------------------------------------------------------------
// Bank-type detectie op basis van CSV-headers
// ------------------------------------------------------------------

const BANK_SIGNATURES = {
  rabobank: ['IBAN/BBAN', 'Volgnr', 'Datum', 'Rentedatum', 'Bedrag', 'Saldo na trn', 'Tegenrekening IBAN/BBAN'],
  // bunq-kolom heet 'Counterparty' (niet 'Counterpart')
  bunq: ['Date', 'Interest Date', 'Amount', 'Account', 'Counterparty', 'Name', 'Description'],
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
    'Naar IBAN':          ['Counterparty'],   // 'Counterparty' met 'y'
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
      file.arrayBuffer().then((buf) => resolve(new TextDecoder('windows-1252').decode(buf))).catch(reject)
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

  // YYYY-MM-DD (al correct)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // DD-MM-YYYY (bunq, ING)
  const dmy = s.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`

  // DD/MM/YYYY
  const dmy2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (dmy2) return `${dmy2[3]}-${dmy2[2]}-${dmy2[1]}`

  // YYYYMMDD (ING)
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
// External ID — moet EXACT overeenkomen met de Python-backend berekening
// ------------------------------------------------------------------

export { sha256 }

export async function computeExternalId(row, bankType) {
  // Rabobank: Volgnr is de unieke identifier (zoals Python importer)
  if (bankType === 'rabobank') {
    return (row['Volgnr'] || '').trim() || null
  }

  // Bunq: SHA256("date|amount|own_iban|counterparty_iban|description")
  // Moet exact matchen met _make_external_id() in app/importers/bunq.py
  if (bankType === 'bunq') {
    const dateStr = normalizeDate((row['Date'] || '').trim(), 'bunq')
    const amountStr = (row['Amount'] || '').trim()          // Rauwe waarde, zoals Python str(Decimal)
    const ownIban = (row['Account'] || '').trim()           // row['Account']
    const counterpartyIban = (row['Counterparty'] || '').trim()  // 'Counterparty' met 'y'!
    const description = (row['Description'] || '').trim()
    return sha256([dateStr, amountStr, ownIban, counterpartyIban, description].join('|'))
  }

  // Overige banken (ING, ABN AMRO): generieke hash op gemapte velden
  const dateStr = normalizeDate(row['Date'] || row['Datum'] || '', bankType)
  const parts = [
    dateStr,
    (row['Amount'] || row['Bedrag'] || '').trim(),
    (row['Counterparty'] || row['Tegenrekening'] || '').trim(),
    (row['Description'] || row['Omschrijving'] || row['Mededelingen'] || '').trim(),
  ]
  return sha256(parts.join('|'))
}
