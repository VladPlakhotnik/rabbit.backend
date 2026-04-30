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

# Run the compiled JS directly. `yarn start` would re-trigger the
# `prestart: yarn build` hook on every container start, wasting boot
# time; the build was already done above.
CMD ["node", "dist/main.js"]