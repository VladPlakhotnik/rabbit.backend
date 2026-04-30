// Type stubs for the `stream-json` subpath modules used by the TM
// class_instance streamer. The package itself ships proper types under
// `node_modules/stream-json/src/...`, but its package.json `exports`
// map (`./*` → `./src/*`) only resolves under `moduleResolution:
// "NodeNext"`. Our tsconfig uses classic `Node` resolution (changing
// it project-wide would touch every other module). These declarations
// let `import pick from 'stream-json/filters/pick'` typecheck — and
// the actual import path then resolves correctly at Node runtime,
// which DOES honor the exports map.

declare module 'stream-json/filters/pick.js' {
  import { Duplex } from 'stream'

  interface PickOptions {
    filter?: string | RegExp
    once?: boolean
    pathSeparator?: string
  }

  // The bare `pick(...)` returns a token-handler factory; only
  // `pick.asStream(...)` returns a pipeable Duplex. The minimal types
  // here cover the Duplex factory we actually use.
  interface PickFactory {
    asStream(options?: PickOptions): Duplex
  }

  const pick: PickFactory
  export = pick
}

declare module 'stream-json/streamers/stream-object.js' {
  import { Duplex } from 'stream'

  interface StreamObjectOptions {
    objectFilter?: (data: { key: string; value: unknown }) => boolean
  }

  interface StreamObjectFactory {
    asStream(options?: StreamObjectOptions): Duplex
  }

  const streamObject: StreamObjectFactory
  export = streamObject
}
