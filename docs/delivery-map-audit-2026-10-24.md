# Inventory 2026-10-24

Hindi ito buong repo at hindi listahan ng ligtas burahin.

## App

| File | Lines |
|---|---|
| app/components/orders/DispatchMap.tsx | 552 |
| app/components/orders/OrdersIndexTable.tsx | 660 |
| app/hooks/useMapOrders.ts | 44 |
| app/lib/dispatch-directions.ts | 65 |
| app/lib/dispatch-geocode.ts | 143 |
| app/lib/dispatch-map.ts | 192 |
| app/lib/dispatch-route.ts | 88 |
| app/lib/order-utils.ts | 705 |
| app/routes/app.orders.tsx | 2318 |
| app/routes/dev.map-preview.tsx | 185 |
| app/styles/dispatch-map.css | 166 |
| test/dispatch-map-guard.test.ts | 44 |
| test/dispatch-map.test.ts | 242 |
| test/dispatch-route.test.ts | 238 |
| shopify.app.production.toml | 66 |
| package.json | 60 |
| .env.example | 5 |

## Tooling / config

| File | Lines |
|---|---|
| package.json | 60 |
| prisma.config.ts | 12 |
| prisma/schema.prisma | 68 |
| tsconfig.json | 26 |
| tsconfig.extension-tests.json | 28 |
| vite.config.js | 62 |
| vitest.config.ts | 12 |
| vitest.extensions.config.ts | 34 |
| shopify.app.production.toml | 66 |
| shopify.web.toml | 6 |
| Dockerfile | 23 |
| deploy.sh | 19 |
| .dockerignore | 28 |
| .gitignore | 52 |
| .prettierignore | 7 |
| .editorconfig | 15 |
| .aiexclude | 5 |
| .env.example | 5 |
| .vscode/settings.json | 29 |
| .github/dependabot.yml | 9 |
| .github/PULL_REQUEST_TEMPLATE.md | 23 |

Prisma migrations:

| Migration | Lines |
|---|---|
| 20240530213853_create_session_table | 22 |
| 20260420153807_add_delivery_schedule_config | 20 |
| 20260715000000_add_delivery_schedule_config_version | 3 |
| 20260816000000_add_lalamove_tracking | 22 |
| 20260816010000_drop_lalamove_tracking_recipient_phone | 2 |
| 20260817000000_add_email_send_log | 14 |
| 20260826000000_add_delivery_sync_task | 34 |
| 20260826010000_add_bulk_action_jobs | 43 |
| 20260909000000_add_agent_order_request | 16 |
| 20260912000000_drop_agent_order_request | 2 |
| 20260925000000_drop_lalamove_sync_and_bulk_jobs | 14 |
| migration_lock.toml | 3 |

## package.json

name: delivery-scheduler | type: module | node: >=22.12 | workspaces: extensions/* | overrides: lodash 4.18.1

Scripts (9):

| Script | Command |
|---|---|
| build | react-router build |
| dev | shopify app dev --config shopify.app.production.toml |
| deploy | echo Use npm run deploy:prod -- a bare deploy is disabled to prevent hitting the wrong app && exit 1 |
| deploy:prod | shopify app deploy --config shopify.app.production.toml --allow-updates |
| start | react-router-serve ./build/server/index.js |
| setup | prisma generate && prisma migrate deploy |
| test | vitest run |
| test:extensions | vitest run --config vitest.extensions.config.ts |
| typecheck | react-router typegen && tsc --noEmit && tsc -p tsconfig.extension-tests.json --noEmit |

Dependencies (17):

| Package | Version |
|---|---|
| @prisma/adapter-pg | ^7.10.0 |
| @prisma/client | ^7.10.0 |
| @react-router/node | ^7.12.0 |
| @react-router/serve | ^7.12.0 |
| @shopify/app-bridge-react | ^4.2.4 |
| @shopify/shopify-api | ^14.0.1 |
| @shopify/shopify-app-react-router | ^2.1.0 |
| dotenv | ^16.6.1 |
| imapflow | ^2.1.0 |
| isbot | ^5.1.31 |
| mailparser | ^3.9.29 |
| mapbox-gl | ^3.33.0 |
| nodemailer | ^9.0.3 |
| prisma | ^7.10.0 |
| react | ^18.3.1 |
| react-dom | ^18.3.1 |
| react-router | ^7.12.0 |

DevDependencies (14):

| Package | Version |
|---|---|
| @react-router/dev | ^7.12.0 |
| @react-router/fs-routes | ^7.12.0 |
| @shopify/polaris-types | ^2.0.0-rc.3 |
| @shopify/ui-extensions-tester | 2026.4.4 |
| @types/mailparser | ^3.4.6 |
| @types/node | ^22.19.19 |
| @types/nodemailer | ^8.0.1 |
| @types/react | ^18.3.25 |
| @types/react-dom | ^18.3.7 |
| jsdom | ^29.1.1 |
| typescript | ^5.9.3 |
| vite | ^7.3.6 |
| vite-tsconfig-paths | ^5.1.4 |
| vitest | ^4.1.8 |
