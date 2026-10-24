# Order operations: notes from code (2026-10-24)

Source: app/routes/app.orders.tsx, app/components/orders/OrdersIndexTable.tsx, app/lib/order-utils.ts.
Not read yet: services/bulk-actions.server.ts, useSmartRefresh, useBulkActions, lib/order-tags.ts, OrderDetailsPanel, reschedule-rules and inbox routes.

## Loader (app.orders.tsx:460-688)
- Auth: authenticate.admin. Timezone from getScheduleRules(shop), with a default if Postgres fails. todayISO is the shop date.
- URL params: tab, deliveryDate, search, timeWindow, sort, after, before.
- Shopify query by tab: unfulfilled = `fulfillment_status:unfulfilled status:open`; unpaid = financial_status pending/authorized/partially_paid + `status:open`; archived = `status:closed`; all others = `-status:closed`.
- Date tabs (today, yesterday, tomorrow, thisWeek, lastWeek) and the date filter send the `YYYY-MM-DD` delivery-date tag (exact match).
- Client side only: time slot filter, delivery-date sort.
- Page size 25; 250 when a date tab, date filter or time slot filter is active.
- Search: sent as-is; quoted when it contains ":".
- Second query: recent reschedules (tag `resched-<day>`, 50 orders). Fails open.
- Postgres: emailSendLog per order for the panel timeline. Fails open.
- Env vars read: GOOGLE_MAPS_API_KEY, MAPBOX_PUBLIC_TOKEN, META_PAGE_ID or MESSENGER_PAGE_ID.
- Header Cache-Control: no-store. shouldRevalidate skips the loader when only ?order= changes.
- Order fields: customer, shippingAddress (with latitude, longitude), billingAddress, currentTotalPriceSet, totalShippingPriceSet, customAttributes, metafields (delivery.*, custom.*, reschedule_history, $app.reschedule_status), fulfillments(first 5), lineItems(first 10). No weight, no shipping method name.

## Table (OrdersIndexTable.tsx)
- Columns: Order, Items, Customer, City, Delivery date, Time slot, Payment, Fulfillment, Total, Tags.
- Items: 1 line item = `×qty`; 2 to 9 = `N items`; 10 or more = `10+ items`. Up to 2 thumbnails (variant image, then product image).
- Customer: name or "Guest", email. Messenger link when the order came from Messenger. Phone is not shown.
- Delivery date source order: custom.date, delivery.date, custom attributes, bare date tag.
- Time slot source order: custom.time_slot, delivery.time_slot, custom attributes, time slot tag.
- Relative badge (Today, Tomorrow, In N days) only when the order is open: not cancelled and fulfillment UNFULFILLED, ON_HOLD or SCHEDULED. Critical tone when the date has passed.
- Payment tone: paid neutral; pending and authorized caution; partially_paid warning.
- Fulfillment badge: "Cancelled" (critical) when cancelledAt is set.
- Tags: date tags and time slot tags hidden; 2 shown, then `+N`. `resched` shows rescheduleBadgeLabel. `ops_md_checked` shows "Checked".
- Tabs: All, Today, Tomorrow, This week, Yesterday, Last week, Unfulfilled, Unpaid, Archived. Counts only when the page size is 250; "N+" when more pages exist; only the active tab has a count on date-scoped pages.
- Bulk bar: Add to map, Update delivery slot, Mark as fulfilled, Mark as paid, Add tags, Remove tags; More: Archive, Unarchive, Cancel.

## KPI (app.orders.tsx:1643-1761), all computed from displayedOrders
| Card | Logic |
|---|---|
| Orders | displayedOrders.length. "delivering today" = tabCounts.today, from `orders`, no cancelled or fulfilled check |
| Revenue | Sum of currentTotalPriceSet, cancelled included. Average = total / orders with a total |
| Unpaid | pending, authorized, partially_paid; cancelled not excluded; "pending" total |
| Unfulfilled | UNFULFILLED and not cancelled; "due today or earlier" = date <= todayISO |
| Delivery Fees | Sum of totalShippingPriceSet; not clickable; no `|| 0` on parseFloat |
| Items to prepare (modal) | Line item quantities by name, cancelled orders skipped |

## Action endpoint (app.orders.tsx:704-958)
- POST only; `_action` selects the operation.
- Single order: sendEmail, markRescheduleSeen, markEmailReplySeen, editDetails.
- Bulk: archive, unarchive, markAsPaid, cancel, tagsAdd, tagsRemove, markFulfilled, reschedule (executeBulkAction in services/bulk-actions.server.ts).
- Reschedule: checked against schedule rules; over capacity without override returns 409 `capacity_override_required`.

## Code comments that disagree with other facts
- app.orders.tsx:542-546 says the date tag is "written by the orders/create sync"; commit ac6c75d removed that webhook.
- app.orders.tsx:454 says reschedules "from the last 48 h"; the query comment at :316 says the last three shop-local days.
- META_PAGE_ID is not among the 14 Cloud Run environment variables on 2026-10-24 (docs/gcp-baseline-2026-10-24.md).
