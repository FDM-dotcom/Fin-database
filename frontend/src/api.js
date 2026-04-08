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
    list:   ()       => req('GET',    '/api/rules'),
    get:    (id)     => req('GET',    `/api/rules/${id}`),
    create: (body)   => req('POST',   '/api/rules', body),
    update: (id, b)  => req('PUT',    `/api/rules/${id}`, b),
    delete: (id)     => req('DELETE', `/api/rules/${id}`),
    toggle: (id)     => req('PATCH',  `/api/rules/${id}/toggle`),
  },

  categories: {
    list:   ()     => req('GET',    '/api/categories'),
    create: (body) => req('POST',   '/api/categories', body),
    delete: (id)   => req('DELETE', `/api/categories/${id}`),
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
