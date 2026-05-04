FROM node:20-alpine

WORKDIR /app

# Dependencies + lockfile first — keeps the layer cache warm when only
# source files change (re-run yarn install only on lockfile diff).
COPY package.json yarn.lock tsconfig.json nest-cli.json ./

# Frozen lockfile blocks any unintentional dep drift between dev and
# the deployed image.
RUN yarn install --frozen-lockfile

# Source last so unrelated edits don't invalidate the deps layer.
COPY . .

# Pre-build to dist/ so the runtime container doesn't need TypeScript
# or the Nest CLI loaded at start.
RUN yarn build

# Fly.io / Heroku inject PORT; src/main.ts reads process.env.PORT and
# falls back to 5000 locally. EXPOSE here is documentation, not a
# binding — Fly's [http_service] internal_port is the real bind.
EXPOSE 5000

# --max-old-space-size caps V8's heap to ~75 % of the container's
# 256 MB RAM. Without it V8 thinks it has 1.5 GB to play with and
# delays GC well past the kernel's OOM threshold — Fly kills the
# process before V8 ever decides to clean up. The cap forces GC
# pressure earlier and fits the heap inside the swap+RAM envelope.
# Bump this in lockstep with `memory =` in fly.toml (rule of thumb:
# heap = 75 % of container RAM).
#
# Run the compiled JS directly. `yarn start` would re-trigger the
# `prestart: yarn build` hook on every container start, wasting boot
# time; the build was already done above.
CMD ["node", "--max-old-space-size=192", "dist/main.js"]