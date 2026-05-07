#!/usr/bin/env node

const baseUrl = process.env.CLICKER_SECURITY_BASE_URL || 'http://localhost:5000'

const checks = [
  {
    name: 'clicker levels create is admin-only',
    url: '/clicker-levels',
    init: { method: 'POST', body: { level: 999, name: 'blocked' } },
  },
  {
    name: 'clicker click levels create is admin-only',
    url: '/clicker-click-levels',
    init: { method: 'POST', body: { level: 999, reward_per_click: 999 } },
  },
  {
    name: 'clicker energy levels create is admin-only',
    url: '/clicker-energy-levels',
    init: { method: 'POST', body: { level: 999, energy_amount: 999 } },
  },
  {
    name: 'clicker cases create is admin-only',
    url: '/clicker-cases',
    init: { method: 'POST', body: { slug: 'blocked', name: 'blocked' } },
  },
]

async function check({ name, url, init }) {
  const response = await fetch(`${baseUrl}${url}`, {
    method: init.method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(init.body),
  })
  const ok = response.status === 401 || response.status === 403
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: HTTP ${response.status}`)
  if (!ok) throw new Error(`${name} was not rejected`)
}

async function main() {
  console.log(`Clicker security smoke against ${baseUrl}`)
  for (const item of checks) {
    await check(item)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
