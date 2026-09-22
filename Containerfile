FROM docker.io/library/node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

RUN npm install --global pnpm@11.26.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/tsconfig.json apps/api/tsconfig.json

RUN pnpm --filter @sherhisab/api... install --prod --frozen-lockfile

COPY apps/api/src apps/api/src

WORKDIR /app/apps/api

EXPOSE 3000

USER node

CMD ["./node_modules/.bin/tsx", "src/runtime/node.ts"]
