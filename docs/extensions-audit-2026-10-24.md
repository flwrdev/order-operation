# Audit ng mga extension (2026-10-24)

Ano ito: ulat mula sa pagbasa ng code ng mga extension at ng mga backend route na tinatawag nila.
Pinagmulan: `C:\Staging\delivery-scheduler`, branch `feature/orders-delivery-map`. Read-only ang audit; ang binago pagkatapos nito ay nasa seksyon 8.
Hindi pa nakumpirma sa live. Ang live app ang source of truth.

## 1. COD fee
- Walang COD fee extension sa repo. Anim lang ang extension sa `extensions/` at wala sa kanila ang may COD.
- Hinanap sa buong repo (hindi kasama ang `node_modules`, `dist`, `build`, `.react-router`). Walang COD code na natira sa `app` o `extensions`.
- Ang `CLAUDE.md` ng repo (linya 32) ay nagsasabing inalis noong 2026-10-20: ang function na `cod-eligibility`, ang extension na `cod-fee-notice`, ang COD part ng `delivery-thank-you`, at ang code na nagdadagdag ng fee line. Hindi ginalaw ang produktong `COD-FEE` at ang mga lumang order na may fee line. Nakumpirma sa git (2026-10-25): commit `c8338c9` (2026-10-21, PR #8) ang nag-alis ng `cod-eligibility`, `cod-fee-notice` at ng COD part ng `delivery-thank-you`. Ang mga ito ay nasa Shopify pa hanggang sa susunod na `npm run deploy:prod`.
- Natirang sanggunian: ang mga column na `needsCodFee` at `codFeeDone` sa migration `20260826000000_add_delivery_sync_task`. Hindi pa nakikita kung dinrop ang table na iyon.
- Posibleng nasa live pa: ang pagtanggal ay nasa repo lang hanggang ma-deploy sa Shopify. Ang `SCOPES` sa Cloud Run ay may `write_order_edits`, `write_products` at `write_payment_customizations`. Ang `shopify.app.production.toml` ay wala ng tatlong iyon at may `read_products` na wala sa Cloud Run. Hindi masabi mula sa code kung ang `cod-eligibility` ay nasa Shopify pa.

## 2. Listahan ng file at linya
44 file, 3,243 linya (3,220 bago ang commit `62b72e1`), hindi kasama ang `dist`.

| Extension | File | Linya |
|---|---|---|
| delivery-date-editor | `src/index.tsx` | 372 |
| | `tests/index.test.ts` | 250 |
| | `shopify.extension.toml` | 31 |
| | `tsconfig.json` | 16 |
| | `package.json` | 9 |
| | `shopify.d.ts` | 7 |
| | `locales/en.default.json` | 3 |
| delivery-fee-checker | `assets/delivery-fee-checker.css` | 109 |
| | `assets/delivery-fee-checker.js` | 160 |
| | `blocks/delivery-fee-checker.liquid` | 90 |
| | `shopify.extension.toml` | 3 |
| | `locales/en.default.json` | 1 |
| delivery-reschedule-action | `src/OrderActionExtension.jsx` | 187 |
| | `src/format-timestamp.js` | 48 |
| | `tests/action.test.ts` | 157 |
| | `shopify.extension.toml` | 13 |
| | `shopify.d.ts` | 13 |
| | `tsconfig.json` | 14 |
| | `package.json` | 11 |
| | `locales/en.default.json` | 1 |
| delivery-reschedule-customer | `src/order-action-modal.tsx` | 690 (667 bago ang commit `62b72e1`) |
| | `src/order-action-menu-item.tsx` | 9 |
| | `tests/order-action-modal.test.ts` | 355 |
| | `shopify.extension.toml` | 19 |
| | `shopify.d.ts` | 13 |
| | `tsconfig.json` | 16 |
| | `package.json` | 9 |
| delivery-thank-you | `src/Checkout.jsx` | 77 |
| | `tests/checkout.test.ts` | 78 |
| | `README.md` | 39 |
| | `shopify.extension.toml` | 28 |
| | `shopify.d.ts` | 7 |
| | `tsconfig.json` | 13 |
| | `package.json` | 11 |
| | `locales/en.default.json` | 3 |
| order-delivery-block | `src/BlockExtension.jsx` | 86 |
| | `src/format-timestamp.js` | 48 |
| | `tests/block.test.ts` | 155 |
| | `shopify.extension.toml` | 47 |
| | `shopify.d.ts` | 13 |
| | `tsconfig.json` | 15 |
| | `package.json` | 11 |
| | `locales/en.default.json` | 3 |
| | `locales/fr.json` | 3 |

Mga backend route na tinatawag ng mga extension (nasa `app/routes`):

| File | Linya |
|---|---|
| `public.customer-account.order-delivery.ts` | 297 |
| `public.customer-account.reschedule.ts` | 628 |
| `public.customer-account.schedule-rules.ts` | 214 |
| `apps.schedule-rules.coverage.ts` | 91 |

Iba pa:
- `dist/` ay may 10 file, 50 linya. Mga nabuong file lang.
- Ang `shopify.d.ts` ng limang extension ay binubuo ng `shopify app dev` at nasa uncommitted na pagbabago.

## 3. Mga extension at ang logic

### 3.1 delivery-date-editor ("Order Status Delivery Schedule")
- Target: `customer-account.order-status.block.render`. Capabilities: `api_access`, `network_access`.
- Mga metafield na naka-declare: `$app.reschedule_status`, `$app.reschedule_requested_at`, `custom.date`, `custom.time_slot`.
- Read-only. Hindi nag-eedit kahit "editor" ang handle.
- Ipinapakita ang petsa, time slot, card message (attribute na `Card Message`), at badge na "Rescheduled to ..." kapag ang status ay `confirmed`.
- Priyoridad ng petsa at slot: ang sagot ng backend (`POST /public/customer-account/order-delivery`), tapos ang metafield na `custom.date` at `custom.time_slot`, tapos ang mga attribute na `Delivery Date` at `Delivery Time`.
- Walang ipinapakita kapag walang petsa at walang slot.
- Proteksyon sa backend read: isang fetch bawat order id, isa lang ang sabay, humihinto pagkatapos ng 3 auth failure o 20 kabuuang pagkabigo.
- Ang format ng petsa ay naka-pin sa Ingles (`en-PH`).

### 3.2 delivery-fee-checker (theme extension)
- Uri: `theme`. Isang block (`delivery-fee-checker.liquid`), target na `section`. Ayon sa komento, isa lang ang pinapayagang theme extension bawat app.
- Isang input, hindi bababa sa 3 character, debounce na 400 ms.
- Tumatawag sa app proxy na `GET /apps/schedule-rules/coverage?q=`. Bini-verify ng route ang signature ng app proxy at kung tugma ang shop.
- Ang apat na digit lang ay ZIP. Ang iba ay area, kasama ang digits bilang ZIP.
- Ipinapakita ang hanggang 5 lugar, na may "mula sa ₱X" o "Message us" kung walang fee.
- Ang "FREE delivery on orders ₱2,500 and up" ay naka-hardcode sa route (`apps.schedule-rules.coverage.ts:87`).
- May disclaimer na nagmumula sa setting ng block. May cache na isang oras sa sagot ng route.
- Ang aktuwal na kuwenta ng fee ay nasa `services/delivery-coverage.server.ts` (hindi pa nababasa).

### 3.3 delivery-reschedule-action ("Admin Reschedule Delivery")
- Target: `admin.order-details.action.render`. Capability: `network_access`.
- Read-only na status view. Hindi ito nagre-reschedule at wala itong binabago.
- Binabasa sa Admin API: `shop.ianaTimezone` at ang mga metafield na `$app.reschedule_status`, `custom.date`, `custom.time_slot`, `$app.reschedule_requested_at`.
- Mga sangay: walang napili, walang naitalang reschedule, `confirmed`, `rejected`, `pending` (sinasabi ng teksto na lumang status at hindi na suportado), at iba pang status.
- Ang oras ay ayon sa timezone ng shop (`format-timestamp.js`).

### 3.4 delivery-reschedule-customer ("Account Reschedule Delivery")
- Dalawang target: `customer-account.order.action.menu-item.render` (ang buton) at `customer-account.order.action.render` (ang modal). Capabilities: `api_access`, `network_access`.
- Ang menu item ay isang buton na "Reschedule Delivery" lang, walang tseke.
- Ang modal ay kumukuha ng rules mula sa `POST /public/customer-account/schedule-rules` (may session token at order id).
- Gumagamit ito ng `app/lib/delivery-availability` (ang rules engine) para sa saklaw ng petsa, mga hindi available na petsa, at mga slot.
- Pumipili ang customer ng petsa at slot, bina-validate sa client (`validateDeliverySelection`), at isinusumite sa `POST /public/customer-account/reschedule`.
- Kapag pumalya ang pagkuha ng rules, gumagamit ito ng `DEFAULT_DELIVERY_SCHEDULE_RULES`.
- Ang teksto ay nagsasabing isang beses lang puwedeng mag-reschedule online.
- Pagkatapos ng tagumpay, ipinapakita ang kumpirmasyon gamit ang mga halagang kasasave lang, nang hindi hinihintay ang pag-refresh ng page.
- Hindi tumatanggap ng pangalawang Confirm habang may tumatakbong request.
- Kapag 422 na `already_rescheduled_once`, `order_already_fulfilled` o `current_delivery_date_too_close_or_past`, ipinapakita ang mensahe ng server bilang error at naka-lock ang date field at ang Confirm (`isBlocked`).
- Kapag walang koneksyon, ang mensahe ay "We could not reach the server. Please check your connection and try again."
### 3.5 delivery-thank-you ("Thank You Delivery Schedule")
- Target: `purchase.thank-you.block.render`. Mga metafield na naka-declare: `custom.date`, `custom.time_slot`. Walang naka-declare na capability.
- Isang card na may petsa (`en-PH`, mahaba) at time slot.
- Binabasa ang cart metafield (`target.type === 'cart'`) na `custom.date` at `custom.time_slot`; backup ang mga attribute na `Delivery Date` at `Delivery Time`.
- Walang ipinapakita kapag walang petsa at slot.
- Walang COD sa file na ito.

### 3.6 order-delivery-block
- Target: `admin.order-details.block.render`. Capability: `network_access`. Ang pangalan sa toml ay `t:name` (galing sa locale).
- Read-only na block sa order page ng admin: petsa, slot, at "Rescheduled at" (kapag `confirmed` at may naitalang oras).
- Binabasa sa Admin API ang custom attributes, `custom.date`, `custom.time_slot`, `$app.reschedule_requested_at`, `$app.reschedule_status`, at ang timezone ng shop. Backup ang mga attribute na `Delivery Date` at `Delivery Time`.
- Ang `shopify.extension.toml` ay may mahabang komento ng mga valid na target (naiwan mula sa template).

## 4. Ang backend ng customer reschedule (`public.customer-account.reschedule.ts`)
1. POST lang. Tinatanggap ang Origin na `https://extensions.shopifycdn.com` lang (CORS).
2. Bini-verify ang session token: HS256, ang `aud` ay dapat kapareho ng `SHOPIFY_API_KEY`. Ang `sub` ang customer at ang `dest` ang shop.
3. Dapat ang order ay sa customer na iyon. Kung hindi, 404 na walang detalye.
4. Mga harang:
   - Fulfillment status na `FULFILLED`, `PARTIALLY_FULFILLED`, `IN_PROGRESS` o `SCHEDULED` (422, `order_already_fulfilled`).
   - Ang tag na `resched` (422, `already_rescheduled_once`).
   - Ang kasalukuyang petsa ng delivery ay masyadong malapit, lipas, o wala (422, `current_delivery_date_too_close_or_past`). Sarado kapag wala o hindi `YYYY-MM-DD` ang petsa (galing sa `custom.date` o sa attribute na `Delivery Date`), mas maaga kaysa sa `getMinSelectableDate`, o lampas na ang oras ng huling order ng slot (simula ng slot minus `prepHours`). Tingnan ang `canRescheduleDelivery`, `lib/delivery-availability.ts:283`.
5. Bina-validate ang bagong petsa at slot ayon sa rules at sa bilang ng booking, na hindi kasama ang sariling booking ng order (422 kapag bigo).
6. Binabasa muli ang fulfillment status at ang tag bago magsulat.
7. Isinusulat sa `rescheduleOrderDelivery` (source `customer`). Ang sagot ay laging `rescheduleStatus: "confirmed"`, may `deliveryAttributeSync`, `deliveryTagSync` at `rescheduleHistorySync`.

Ang `public.customer-account.order-delivery.ts` ay may parehong pag-verify ng token at pagtingin ng may-ari ng order. Ang `public.customer-account.schedule-rules.ts` ay bini-verify ang token pero hindi tinitingnan ang may-ari ng order.

## 5. Config ng app (`shopify.app.production.toml`)
- Mga webhook: `app/uninstalled`, `app/scopes_update`. Wala nang `orders/create`.
- App proxy: `/apps/schedule-rules` papunta sa Cloud Run.
- Mga metafield ng order na naka-declare: `$app.reschedule_requested_at`, `$app.reschedule_status`.
- Mga scope sa toml (15): read_orders, write_orders, read_customers, read_products, read_metaobjects, write_metaobjects, write_metaobject_definitions, read_fulfillments, write_fulfillments, read_merchant_managed_fulfillment_orders, write_merchant_managed_fulfillment_orders, write_files, read_files, read_draft_orders, write_draft_orders.
- Mga scope sa Cloud Run `SCOPES` (17): ang mga nasa toml maliban sa `read_products`, dagdag ang `write_order_edits`, `write_products`, `write_payment_customizations`.
- Naiwan ang `[metaobjects.app.example]` mula sa template.

## 6. Mga pagkakaiba at panganib
| # | Flag | Saan |
|---|---|---|
| 1 | Laging nakikita ng customer ang "Reschedule Delivery" sa menu, kahit nag-reschedule na o naka-fulfill na ang order. Sa pagsumite lang lumalabas ang error | `order-action-menu-item.tsx`, `public.customer-account.reschedule.ts:441-467` |
| 2 | Kapag pumalya ang pagkuha ng rules, gumagamit ang modal ng default na rules, kaya baka mali ang slot at petsa na nakikita ng customer. Ang server pa rin ang bahala sa validation sa pagsumite | `order-action-modal.tsx:427-444` |
| 3 | Naka-hardcode ang URL ng Cloud Run sa dalawang extension | `delivery-date-editor/src/index.tsx:179`, `order-action-modal.tsx:57` |
| 4 | Ang `schedule-rules` route ay hindi tinitingnan ang may-ari ng order at hindi iniko-convert ang `orderId` sa gid. Ang reschedule route ay ginagawa ang dalawa | `public.customer-account.schedule-rules.ts:199-201`, `public.customer-account.reschedule.ts:393-395,437` |
| 5 | Hindi atomic ang muling pagbabasa bago magsulat. Maliit ang puwang pero may pagitan pa rin ng dalawang sabay na request | `public.customer-account.reschedule.ts:514-560` |
| 6 | Tatlong route ang may halos parehong code (CORS, token, parse) na paulit-ulit | tatlong `public.customer-account.*.ts` |
| 7 | Ang `$app.reschedule_requested_at` ay naka-declare sa toml ng `delivery-date-editor` pero hindi binabasa ng code nito | `delivery-date-editor/shopify.extension.toml:17-19` |
| 8 | Ang `README.md` ng `delivery-thank-you` ay template pa rin ng Shopify (target na `purchase.checkout.block.render`, binabanggit ang `fr.json`), hindi tugma sa tunay na target at locale | `delivery-thank-you/README.md` |
| 9 | Dalawang admin extension (`delivery-reschedule-action`, `order-delivery-block`) ay halos pareho ang binabasa at ipinapakita. Magkapareho ang `format-timestamp.js` sa dalawa ayon sa nabasa at sa komento | |
| 10 | Ang `rejected` at `pending` na sangay sa admin action ay legacy. Ang customer route ay `confirmed` lang ang isinusulat. Hindi pa nakikita ang ibang sumusulat | `OrderActionExtension.jsx:107-175` |
| 11 | Ang libreng delivery na ₱2,500 ay naka-hardcode sa route ng fee checker | `apps.schedule-rules.coverage.ts:87` |
| 12 | Ang COD ay inalis sa repo pero hindi masabi kung nasa Shopify pa. Magkaiba ang scopes ng toml at ng Cloud Run | seksyon 1 at 5 |
| 13 | Hindi tinitingnan ng reschedule route ang `cancelledAt` (hindi ito kasama sa `ORDER_CUSTOMER_QUERY`). Ang cancelled na order na UNFULFILLED ay puwedeng i-reschedule. Hindi pa nakukumpirma kung itinatago ng Shopify ang action sa cancelled na order | `public.customer-account.reschedule.ts:23-47` |
| 14 | `api_access = true` sa `delivery-reschedule-customer`, pero walang direktang Shopify API call ang modal (`fetch` sa app backend lang). Hindi pa nakukumpirma kung kailangan ito ng `sessionToken.get()` | `delivery-reschedule-customer/shopify.extension.toml` |

## 7. Hindi pa nababasa
- Ang mga test ng bawat extension, ang mga `locales` (maliban sa pangalan ng mga file), at ang `test/extension-*.test.ts` sa repo.
- `lib/delivery-availability.ts` (ang rules engine na ginagamit ng customer modal).
- `services/reschedule-order-delivery.server.ts`, `services/delivery-coverage.server.ts`, `services/schedule-rules.server.ts`.
- `apps.schedule-rules.ts`, `apps.schedule-rules.validate.ts`, `apps.schedule-rules.reschedule.ts`, `apps.schedule-rules.products.ts` (ang app proxy ng date picker sa theme).
- Ang theme date picker sa Dawn (wala sa repo).
- Ang estado ng mga extension at function sa Shopify (Partner dashboard).

## 8. Binago pagkatapos ng audit (2026-10-25)
- Commit `62b72e1` sa `order-action-modal.tsx` (client lang): double-submit guard, lock kapag terminal ang sagot ng server, at plain na mensahe sa network error. Walang binago sa backend, tag, metafield, attribute o fulfillment.
- Resulta ng test: typecheck pasado, `npm run test:extensions` 37/37, `npm test` 510/510.
- Wala sa mga flag sa seksyon 6 ang naayos ng pagbabagong ito. Ang flag #13 at #14 ay idinagdag pagkatapos ng audit.
- Lalabas ang pagbabago sa customer account pagkatapos ng Shopify deploy (`npm run deploy:prod`), hindi ng Cloud Run deploy.
- Ayon kay Jhay (hindi ko nakita ang resulta): gumana sa dev server nang may `custom.date` at `custom.time_slot` ang test order. Sa order na walang valid na `custom.date`, lumabas ang banner na "too close or has already passed" at naka-lock ang form (ayon sa screenshot).
