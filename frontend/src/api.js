/**
 * API-client.
 *
 * In productie loopt alles via dezelfde nginx-proxy op poort 80:
 *   /api/ → FastAPI (intern)
 *
 * In ontwikkeling (npm run dev) proxiet Vite /api/ naar localhost:8000
 * via de proxy-instelling in vite.config.js — geen aparte configuratie nodig.
 */

async function req(method, path, body) {
  const opts = { method, headers: {} }

  if (body && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  } else if (body) {
    opts.body = body
  }

  const res = await fetch(path, opts)

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  stats: () => req('GET', '/api/stats'),

  rules: {
    list:       ()       => req('GET',    '/api/rules'),
    get:        (id)     => req('GET',    `/api/rules/${id}`),
    create:     (body)   => req('POST',   '/api/rules', body),
    update:     (id, b)  => req('PUT',    `/api/rules/${id}`, b),
    delete:     (id)     => req('DELETE', `/api/rules/${id}`),
    toggle:     (id)     => req('PATCH',  `/api/rules/${id}/toggle`),
    preview:    (body)   => req('POST',   '/api/rules/preview', body),
    importJson: (file)   => {
      const fd = new FormData()
      fd.append('file', file)
      return req('POST', '/api/rules/import', fd)
    },
  },

  categories: {
    list:     ()     => req('GET',    '/api/categories'),
    overview: ()     => req('GET',    '/api/categories/overview'),
    create:   (body) => req('POST',   '/api/categories', body),
    delete:   (id)   => req('DELETE', `/api/categories/${id}`),
  },

  accounts: {
    list: () => req('GET', '/api/accounts'),
  },

  aliases: {
    list:        ()         => req('GET',    '/api/aliases'),
    suggestions: ()         => req('GET',    '/api/aliases/suggestions'),
    nameLookup:  (ibans)    => req('POST',   '/api/aliases/name-lookup', { ibans }),
    create:      (body)     => req('POST',   '/api/aliases', body),
    update:      (iban, b)  => req('PUT',    `/api/aliases/${iban}`, b),
    delete:      (iban)     => req('DELETE', `/api/aliases/${iban}`),
    importCsv:   (file)     => {
      const fd = new FormData()
      fd.append('file', file)
      return req('POST', '/api/aliases/import-csv', fd)
    },
  },

  import: (file, accountIban, runCategorize) => {
    const fd = new FormData()
    fd.append('file', file)
    if (accountIban) fd.append('account_iban', accountIban)
    fd.append('run_categorize', runCategorize ? 'true' : 'false')
    return req('POST', '/api/import', fd)
  },

  importPreview: (file, accountIban) => {
    const fd = new FormData()
    fd.append('file', file)
    if (accountIban) fd.append('account_iban', accountIban)
    return req('POST', '/api/import/preview', fd)
  },

  importMapped: (body) => req('POST', '/api/import/mapped', body),

  transactions: {
    list: (params = {}) => {
      const qs = new URLSearchParams()
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.set(k, v)
      })
      return req('GET', `/api/transactions?${qs}`)
    },
    // transactions: [{idx, date, amount, counterparty_iban?, description?}]
    // accountIban: optioneel — beperkt zoekscope tot één rekening
    checkDuplicates: (transactions, accountIban = null) =>
      req('POST', '/api/transactions/check-duplicates', {
        transactions,
        account_iban: accountIban || undefined,
      }),
    delete: (ids) => req('DELETE', '/api/transactions', { ids }),
    patch:  (id, body) => req('PATCH', `/api/transactions/${id}`, body),
  },

  labels: {
    list:   ()     => req('GET',  '/api/labels'),
    create: (name) => req('POST', '/api/labels', { name }),
  },

  mappingProfiles: {
    list:   (bankType)   => req('GET',    `/api/mapping-profiles${bankType ? `?bank_type=${bankType}` : ''}`),
    create: (body)       => req('POST',   '/api/mapping-profiles', body),
    delete: (id)         => req('DELETE', `/api/mapping-profiles/${id}`),
  },

  ibanAliases: {
    list:   ()     => req('GET',  '/api/iban-aliases'),
    create: (body) => req('POST', '/api/iban-aliases', body),
  },

  budget: {
    // months: array of "YYYY-MM" strings
    report:      (months)                => req('GET', `/api/budget/report?months=${months.join(',')}`),
    setEntry:    (yearMonth, catId, amt) => req('PUT', `/api/budget/${yearMonth}/${catId}`, { amount: amt }),
    deleteEntry: (yearMonth, catId)      => req('DELETE', `/api/budget/${yearMonth}/${catId}`),
  },
}
