# Architecture ayon sa audit ng code (2026-10-24)

Ano ito: paglalarawan ng app mula sa mismong code na nabasa. Hindi ito galing sa `architecture.md`.
Pinagmulan: `C:\Staging\delivery-scheduler`, branch `feature/orders-delivery-map`.
Hindi pa nakumpirma sa live (Cloud Run revision `00009-bw2`). Ang live app ang source of truth.

## 1. Stack at nav
- Shopify embedded app. React Router 7, Polaris web components (`s-*`), App Bridge. Prisma 7 + Postgres. Naka-deploy sa Cloud Run (`us-central1`).
- Dalawang nav item (`app/routes/app.jsx`): **Order operations** (`app.orders.tsx`) at **Delivery Scheduler** (`app.scheduler.tsx`).

## 2. Order operations (`app/routes/app.orders.tsx`)

### Loader
- Auth: `authenticate.admin`. Timezone mula sa schedule rules ng shop (may default kapag pumalya ang Postgres).
- URL params: `tab`, `deliveryDate`, `search`, `timeWindow`, `sort`, `after`, `before`.
- Query sa Shopify ayon sa tab: unfulfilled, unpaid, archived (`status:closed`), iba pa (`-status:closed`).
- Ang mga date tab (Today, Yesterday, Tomorrow, This week, Last week) at ang date filter ay naghahanap gamit ang date tag na `YYYY-MM-DD` (eksaktong tugma).
- Sa client lang ginagawa: time slot filter at sort ayon sa delivery date.
- Laki ng page: 25. Nagiging 250 kapag may date tab, date filter o time slot filter.
- Ikalawang query: mga kamakailang reschedule (tag `resched-<day>`, 50 order). Hindi nagpapabagsak ng page kapag pumalya.
- Postgres: `EmailSendLog` bawat order para sa timeline. Hindi nagpapabagsak ng page kapag pumalya.
- Env na binabasa: `GOOGLE_MAPS_API_KEY`, `MAPBOX_PUBLIC_TOKEN`, `META_PAGE_ID` o `MESSENGER_PAGE_ID`.
- `Cache-Control: no-store`. Hindi nagre-reload ang loader kapag `?order=` lang ang nagbago.

### Pinagmulan ng petsa at oras ng delivery (pagkakasunod)
- Petsa: `custom.date`, `delivery.date`, custom attributes, date tag.
- Slot: `custom.time_slot`, `delivery.time_slot`, custom attributes, time slot tag.

### Table (`OrdersIndexTable.tsx`)
- Mga column: Order, Items, Customer, City, Delivery date, Time slot, Payment, Fulfillment, Total, Tags.
- Ang "Today / Tomorrow / In N days" ay lumalabas lang kung bukas ang order (hindi cancelled at UNFULFILLED, ON_HOLD o SCHEDULED).
- Mga tab: All, Today, Tomorrow, This week, Yesterday, Last week, Unfulfilled, Unpaid, Archived.
- Bulk bar: Add to map, Update delivery slot, Mark as fulfilled, Mark as paid, Add tags, Remove tags. Sa More: Archive, Unarchive, Cancel.

### KPI (kinukuwenta sa client mula sa `displayedOrders`, ibig sabihin ay "this page")
| Card | Lohika |
|---|---|
| Orders | Bilang ng order sa page. Ang "delivering today" ay galing sa `tabCounts.today`, walang tseke sa cancelled o fulfilled |
| Revenue | Kabuuan ng `currentTotalPriceSet`, kasama ang cancelled |
| Unpaid | pending, authorized, partially_paid. Kasama ang cancelled |
| Unfulfilled | UNFULFILLED at hindi cancelled. "Due today or earlier" = petsa <= ngayon |
| Delivery Fees | Kabuuan ng `totalShippingPriceSet` |
| Items to prepare (modal) | Bilang ng line item ayon sa pangalan, hindi kasama ang cancelled |

### Action endpoint (POST lang, `_action`)
- Isang order: `sendEmail`, `markRescheduleSeen`, `markEmailReplySeen`, `editDetails`.
- Bulk (`executeBulkAction` sa `services/bulk-actions.server.ts`): `archive`, `unarchive`, `markAsPaid`, `cancel`, `tagsAdd`, `tagsRemove`, `markFulfilled`, `reschedule`.
- Reschedule: sinusuri sa schedule rules. Kapag lampas sa capacity at walang override, 409 `capacity_override_required`.

## 3. Side panel (`OrderDetailsPanel.tsx`)
Binubuksan ng `?order=`. Pagkakasunod: Header, Delivery, Items, Order history, Tags, Delivery timeline.

| Bahagi | Component |
|---|---|
| Header, Actions menu, Order history, Tags | `OrderDetailsPanel` |
| Delivery | `panel/DeliverySection` |
| Items, Subtotal, Shipping fee, Total | `panel/ItemsSection` |
| Delivery timeline | `panel/DeliveryTimeline` |

- Actions menu: Update delivery slot, Edit details, Send email (naka-disable kung walang email ang customer record), Lalabook (laging `https://web.lalamove.com/`), View order status page, Open in Shopify Admin, Open Messenger conversation (naka-disable kung walang page ID at PSID).
- Ang panel mismo ay isa lang ang kayang baguhin: magdagdag ng tag (`tagsAdd`).
- Delivery status ay hinango ng app: Cancelled, Fulfilled (ayon sa Shopify fulfillment, hindi sa aktuwal na pagkakadeliver), Rescheduled, Scheduled, o "—".
- Receiver phone = phone ng shipping address lang. Sender phone = phone ng customer, at kung wala, phone ng shipping address.
- "Subtotal" = total na binawasan ng shipping.
- Timeline: mga reschedule, fulfilled, delivered, email na ipinadala ng app, at email sa mailbox. Pinakabago muna, pinagsama-sama ayon sa araw (oras ng browser). Ang email log ay itinatapon kapag may kopya sa mailbox sa loob ng 2 minuto.

## 4. Mga modal at notification
| Component | Ginagawa |
|---|---|
| `EditDetailsModal` | Binabago ang street, address2, city, receiver phone, at ZIP (mula lang sa address search). Hindi na-eedit: pangalan ng recipient, company, province, country. Sa server (`services/update-order-contact.server.ts`): `orderUpdate` na nagme-merge, at ang address2 at phone ay laging ipinapadala (ang walang laman ay nagbubura). Pagkatapos ng save: event tag `addressEdited`. Hindi ginagalaw ang delivery metafields o tags |
| `lib/google-places.client.ts` | Google Places (New) address search. Nilo-load lang sa unang bukas ng modal. Limitado sa PH, may bias sa Metro Manila. Iisang session token bawat pagta-type |
| `SendEmailModal` | Subject (max 200), Message (max 5000, plain text), hanggang 3 larawan (JPEG, PNG, WebP; 8 MB bawat isa; 15 MB kabuuan). Galing sa business mailbox, may BCC na kopya. Ang To ay display lang |
| `EmailViewModal` | Pagtingin ng isang email, may "Show quoted text" at mga quick reply (kinokopya ang mensahe). May Reply kung galing sa customer |
| `NotificationsBell` | Pinagsasamang listahan ng mga bagong reply ng customer at mga reschedule ng customer. Oras ayon sa timezone ng shop. Ang "matched by sender email" ay lumalabas kapag tinugma ayon sa email ng nagpadala |
| `ui/AppModal` | Balat ng lahat ng modal (`<s-modal>`). Ina-unmount ang laman pagkatapos ng hide animation |

### Email thread (`app/routes/app.orders_.email-thread.ts`)
- `GET /app/orders/email-thread?orderId=...`. Ang order id lang ang galing sa browser. Ang pangalan ng order at email ng customer ay binabasa sa Shopify.
- Ang email ay: email ng customer record, at kung wala, `order.email`.
- Bawat load ay isang IMAP login. Nagre-revalidate lang kapag `_action = sendEmail`.
- Ang mga quick reply ay galing sa shop metafield `$app quick_replies`.

## 5. Delivery Scheduler (`app/routes/app.scheduler.tsx`)
- Loader: `getScheduleRulesDetailed`. Action: POST at JSON lang.
- `refreshCounts` ay lumalampas sa cache ng bilang. Ang ibang op ay dumadaan sa `runSchedulerOp` at kailangan ng integer na `version` (optimistic concurrency). Mga sagot sa error: `stale_config`, `unknown_op`, `validation`, `error`.
- Hindi nagre-reload ang loader kapag `?date=` lang ang nagbago.
- Mga card ayon sa pagkakasunod:

| Card | Laman |
|---|---|
| Overview | Delivery slots, Blocked dates, Capacity days, "N full / N near", "Refresh counts", listahan ng capacity |
| Delivery settings | Timezone, Same-day cutoff (24 opsyon), Preparation time (0-72 oras), Booking window (1-120 araw) |
| Time slots | Mga slot ayon sa pagkakasunod. Hindi mababago ang oras ng slot kapag nagawa na. Minimum na 1 slot. Ang pagbura ay nagtatanggal din ng mga date override ng slot |
| Date overrides | Block ng buong araw, block ng slot, capacity ng slot sa isang petsa. Hindi puwede ang nakaraang petsa |
| Quick replies | Label at Message. Ise-save sa `/app/scheduler/quick-replies` |

## 6. Pagsulat ng delivery tags at metafields
- Ang webhook na `orders/create` ay inalis (commit `ac6c75d`). Ang Shopify Flow ang dapat sumulat ng mga tag at metafield.
- Ang `app.schedule-rules.tsx` ay isang route na wala sa nav. Hindi pa nababasa.

## 7. Delivery map (nasa branch)
Mga file: `DispatchMap.tsx`, `useMapOrders.ts`, `dispatch-directions.ts`, `dispatch-geocode.ts`, `dispatch-map.ts`, `dispatch-route.ts`, `dispatch-map.css`, at tatlong test. Ang loob ng mga ito ay hindi pa na-audit.
Ang `dev.map-preview.tsx` ay para sa dev lang at hindi dapat ma-deploy.

## 8. Config sa Cloud Run (2026-10-24, mula sa console)
- 14 na env var. Wala ang `MAPBOX_PUBLIC_TOKEN`, `META_PAGE_ID` at `MESSENGER_PAGE_ID`. Dahil dito, sa live ay laging naka-disable ang "Open Messenger conversation".
- Detalye: `docs/gcp-baseline-2026-10-24.md`.

## 9. Mga komentong hindi tugma sa code
- `app.orders.tsx:542-546` ay nagsasabing ang date tag ay isinusulat ng `orders/create` sync. Inalis na ito.
- `app.orders.tsx:454` ay nagsasabing "last 48 h", pero ang komento sa `:316` ay tatlong araw ng shop.
- `update-order-contact.server.ts:1-3` ay hindi binabanggit ang address2, pero binabago ito (`:233-234`).
- `EditDetailsModal.tsx:24-30` ay naglilista ng ZIP bilang hindi na-eedit, pero isinusulat ito mula sa address search.

## 10. Mga gawi na dapat malaman
| Gawi | Saan |
|---|---|
| Ang Sender phone ay bumabalik sa phone ng receiver kapag walang phone ang customer | `lib/order-utils.ts:392-398` |
| Ang "Copy delivery info" ay gumagamit ng pangalan at phone ng customer, at walang address2 at province | `lib/order-utils.ts:481-487` |
| Ang pagpili ng suggestion sa Search address ay pinapalitan ang buong Street address | `EditDetailsModal.tsx:176-181` |
| Hindi nagbabago ang province kapag nagbago ang city | `update-order-contact.server.ts:222-230` |
| Walang pagharang sa server para sa cancelled o fulfilled na order sa Edit details | `update-order-contact.server.ts:88-109` |
| Kapag isinara ang modal habang nagse-save at nag-fail, hindi makikita ang error | `ui/AppModal.tsx:69-71` |
| Ang timeline ay gumagamit ng oras ng browser. Ang bell ay gumagamit ng timezone ng shop | `lib/order-utils.ts:631-650`, `NotificationsBell.tsx:40-46` |
| Ang email thread ay may fallback sa `order.email`. Ang Send email sa panel ay wala | `app.orders_.email-thread.ts:104-108`, `OrderDetailsPanel.tsx:80-81,180` |

## 11. Ayon kay Jhay (hindi pa na-verify sa code)
- Ang scheduler rules ay kapareho ng ginagamit ng date picker sa customer account extension. Sa Order operations, ang tawag sa prinsipyo ay "merchant override".
- Ang "Capacity days" na 0 ay label lang para sa mga holiday, kaya hindi ito nagbibilang.
- Ang live app ang source of truth, hindi ang repo.

## 12. Hindi pa nababasa
`services/bulk-actions.server.ts`, `services/scheduler-ops.server.ts`, `services/schedule-rules.server.ts`, `services/customer-inbox.server.ts`, `services/send-customer-email.server.ts`, `lib/scheduler-overview.ts`, `lib/quick-replies.ts`, `lib/recent-reschedules.ts`, `lib/order-tags.ts`, `app.schedule-rules.tsx`, `app.scheduler_.quick-replies.ts`, ang pagkakabit ng mga modal sa `app.orders.tsx`, ang buong delivery map, at ang mga extension.
