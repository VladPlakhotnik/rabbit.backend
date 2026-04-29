// Side-effect import. MUST be the very first import in main.ts so that
// process.env is populated before any other module reads it at import time
// (e.g. @WebSocketGateway decorators that need CORS_ORIGINS, or service
// constants that bake in env-derived values).
//
// Plain `import * as dotenv from 'dotenv'` followed by `dotenv.config()`
// after other imports does NOT work — ES module imports are hoisted, so
// dependent modules evaluate before the dotenv.config() call ever runs.
import * as dotenv from 'dotenv'

dotenv.config()
