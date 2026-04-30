import * as https from 'https'

// Shared keep-alive HTTPS agent for all DMarket API calls.
//
// Without keep-alive, every request reopens a fresh TCP + TLS
// connection to api.dmarket.com — ~50-100 ms of handshake overhead
// per page. With concurrent workers walking ~1000 pages that's
// roughly a minute of pure wasted handshakes.
//
// `keepAlive: true` reuses the underlying socket; `maxSockets` caps
// the concurrent socket count comfortably above our worker count
// (4) so workers never queue on socket availability, while staying
// below the implicit per-IP connection cap a CDN-fronted host like
// api.dmarket.com would enforce. `keepAliveMsecs` is how long an
// idle socket stays alive — long enough to span the inter-page
// gap, short enough that idle leaks self-heal.
//
// Single shared agent across CS and Dota clients — both target the
// same hostname, sharing the pool is a free win.
export const DMARKET_HTTPS_AGENT = new https.Agent({
  keepAlive: true,
  maxSockets: 8,
  keepAliveMsecs: 30_000,
})
