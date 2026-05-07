#!/usr/bin/env node

const { performance } = require('node:perf_hooks')

function loadSocketIoClient() {
  try {
    return require('socket.io-client')
  } catch {
    try {
      return require('../../rabbit.frontend/node_modules/socket.io-client')
    } catch {
      throw new Error(
        'socket.io-client is required. Install backend deps or run from the full repo with frontend deps installed.',
      )
    }
  }
}

const { io } = loadSocketIoClient()

const url = process.env.CLICKER_LOAD_URL || 'http://localhost:5000/clicker'
const token = process.env.CLICKER_LOAD_TOKEN
const socketsCount = Number(process.env.CLICKER_LOAD_SOCKETS || 10)
const totalClicks = Number(process.env.CLICKER_LOAD_CLICKS || 1000)
const timeoutMs = Number(process.env.CLICKER_LOAD_TIMEOUT_MS || 15000)

if (!token) {
  console.error('Set CLICKER_LOAD_TOKEN to a valid access token.')
  process.exit(1)
}

const clickBatch = Math.ceil(totalClicks / socketsCount)
const startedAt = performance.now()
const sockets = []

function connectSocket(index) {
  return new Promise((resolve, reject) => {
    const socket = io(url, {
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
      timeout: timeoutMs,
    })
    sockets.push(socket)
    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', reject)
    socket.on('error', (err) => {
      console.warn(`[socket ${index}] server error`, err)
    })
  })
}

function emitClick(socket, count) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit('click', { count }, (err, ack) => {
      if (err) {
        reject(err)
        return
      }
      resolve(ack)
    })
  })
}

async function main() {
  console.log(
    `Clicker WS load: ${socketsCount} sockets, ${totalClicks} requested clicks, batch=${clickBatch}, url=${url}`,
  )
  const connected = await Promise.all(
    Array.from({ length: socketsCount }, (_, index) => connectSocket(index)),
  )
  const acks = await Promise.all(
    connected.map((socket, index) => {
      const remaining = totalClicks - index * clickBatch
      const count = Math.max(0, Math.min(clickBatch, remaining))
      return count > 0 ? emitClick(socket, count) : null
    }),
  )
  const durationMs = Math.round(performance.now() - startedAt)
  const accepted = acks.reduce((sum, ack) => sum + Number(ack?.accepted || 0), 0)
  const errors = acks.filter((ack) => ack?.error).length
  console.log(
    JSON.stringify(
      {
        sockets: socketsCount,
        requested: totalClicks,
        accepted,
        errors,
        durationMs,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => {
    for (const socket of sockets) socket.close()
  })
