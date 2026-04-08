const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function req(method, path, body) {
  const opts = { method, headers: {} }
  if (body && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  } else if (body) {
    opts.body = body
  }
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'API fout')
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  stats: () => req('GET', '/api/stats'),

  rules: {
    list: () => req('GET', '/api/rules'),
    get: (id) => req('GET', `/api/rules/${id}`),
    create: (body) => req('POST', '/api/rules', body),
    update: (id, body) => req('PUT', `/api/rules/${id}`, body),
    delete: (id) => req('DELETE', `/api/rules/${id}`),
    toggle: (id) => req('PATCH', `/api/rules/${id}/toggle`),
  },

  categories: {
    list: () => req('GET', '/api/categories'),
    create: (body) => req('POST', '/api/categories', body),
    delete: (id) => req('DELETE', `/api/categories/${id}`),
  },

  accounts: {
    list: () => req('GET', '/api/accounts'),
  },

  import: (file, accountIban, runCategorize) => {
    const fd = new FormData()
    fd.append('file', file)
    if (accountIban) fd.append('account_iban', accountIban)
    fd.append('run_categorize', runCategorize ? 'true' : 'false')
    return req('POST', '/api/import', fd)
  },
}
