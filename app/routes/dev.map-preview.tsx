// DEV-ONLY preview of the Orders table + delivery map, with made-up orders, so the
// way they work together can be tried on this computer without the Shopify admin.
// It uses the real OrdersIndexTable, the real row selection and the real map hook.
// It never calls Shopify, answers 404 when NODE_ENV is "production", and is NOT
// committed. Delete this file when the map test is done.

import { useState } from "react";
import { useLoaderData } from "react-router";

import { DispatchMap } from "../components/orders/DispatchMap";
import { OrdersIndexTable } from "../components/orders/OrdersIndexTable";
import { useMapOrders } from "../hooks/useMapOrders";
import { useRowSelection } from "../hooks/useRowSelection";
import type { Order } from "../lib/order-utils";
import { POLARIS_URL } from "../lib/polaris-url";
import dispatchMapStylesHref from "../styles/dispatch-map.css?url";
import mapboxStylesHref from "mapbox-gl/dist/mapbox-gl.css?url";

export const links = () => [
  { rel: "stylesheet", href: dispatchMapStylesHref },
  { rel: "stylesheet", href: mapboxStylesHref },
];

export const loader = async () => {
  if (process.env.NODE_ENV === "production") {
    throw new Response("Not found", { status: 404 });
  }
  // Read the local .env so MAPBOX_PUBLIC_TOKEN is available outside `shopify app dev`.
  const dotenv = await import("dotenv");
  dotenv.config();
  return { mapboxPublicToken: process.env.MAPBOX_PUBLIC_TOKEN ?? "" };
};

/** Builds one made-up order. A position means Shopify "already placed" it; no position means the map looks it up. */
function sampleOrder(
  number: number,
  address1: string,
  city: string,
  province: string,
  position?: [number, number],
): Order {
  return {
    id: `gid://shopify/Order/${number}`,
    name: `#${number}`,
    createdAt: "2026-10-23T09:00:00Z",
    cancelledAt: null,
    displayFulfillmentStatus: "UNFULFILLED",
    displayFinancialStatus: number % 2 === 0 ? "PAID" : "PENDING",
    tags: [],
    customer: {
      id: `gid://shopify/Customer/${number}`,
      firstName: "Test",
      lastName: `Customer ${number}`,
      defaultEmailAddress: null,
      defaultPhoneNumber: null,
    },
    deliveryDate: null,
    deliveryTimeSlot: null,
    customDate: { value: "2026-10-24" },
    customTimeSlot: { value: number % 3 === 0 ? "12PM-3PM" : "9AM-12PM" },
    rescheduleHistory: null,
    shippingAddress: {
      address1,
      address2: null,
      city,
      province,
      zip: null,
      country: "Philippines",
      phone: null,
      latitude: position ? position[1] : null,
      longitude: position ? position[0] : null,
    },
    billingAddress: null,
    note: null,
    currentTotalPriceSet: { shopMoney: { amount: "1099.00", currencyCode: "PHP" } },
    totalShippingPriceSet: null,
    customAttributes: [],
    lineItems: {
      edges: [
        {
          node: {
            name: "Bouquet of flowers",
            quantity: 1,
            sku: null,
            image: null,
            product: null,
          },
        },
      ],
    },
    fulfillments: null,
    emailLog: [],
  };
}

// Public places only. Some have a position (like Shopify's own latitude and longitude);
// the rest are looked up by Mapbox; the "Nowhere" one cannot be found on purpose.
const SAMPLE_ORDERS: Order[] = [
  sampleOrder(9001, "SM Mall of Asia Complex", "Pasay City", "Metro Manila", [120.9822, 14.5352]),
  sampleOrder(9002, "SM North EDSA", "Quezon City", "Metro Manila", [121.0287, 14.6563]),
  sampleOrder(9003, "Bonifacio High Street", "Taguig", "Metro Manila"),
  sampleOrder(9004, "Aguinaldo Highway", "Bacoor", "Cavite"),
  sampleOrder(9005, "Marikina Riverbanks Center", "Marikina", "Metro Manila"),
  sampleOrder(9006, "Greenhills Shopping Center", "San Juan", "Metro Manila", [121.0488, 14.602]),
  sampleOrder(9007, "Ayala Triangle Gardens", "Makati", "Metro Manila", [121.0244, 14.5547]),
  sampleOrder(9008, "Eastwood City", "Quezon City", "Metro Manila"),
  sampleOrder(9009, "Zzzz Qqqq Nowhere Lane", "Nowhere", "Nowhere"),
  sampleOrder(9010, "Robinsons Galleria", "Quezon City", "Metro Manila"),
];

const getOrderId = (order: { id: string }) => order.id;
const doNothing = () => {};

export default function MapPreview() {
  const { mapboxPublicToken } = useLoaderData<typeof loader>();
  const [note, setNote] = useState("");

  const { selectedResources, selectAllState, selectRow, selectAll } = useRowSelection(
    SAMPLE_ORDERS,
    getOrderId,
  );
  const { mapOrders, addSelected, removeOrder, clearMap } = useMapOrders(
    SAMPLE_ORDERS,
    SAMPLE_ORDERS,
    selectedResources,
  );
  const [pinnedOrderId, setPinnedOrderId] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <script src={POLARIS_URL} />
      <h2 style={{ marginTop: 0 }}>Orders table + delivery map preview (made-up orders)</h2>
      <p style={{ color: "#4b5563" }}>
        Tick rows, press “Add to map”. The real table and the real map code run here; the other buttons do nothing.
        This page is for testing only.
      </p>
      {note && <p style={{ color: "#92400e" }}>{note}</p>}
      <s-stack gap="base">
        <DispatchMap
          accessToken={mapboxPublicToken}
          orders={mapOrders}
          onRemoveOrder={removeOrder}
          onClearAll={clearMap}
          onPinFocus={setPinnedOrderId}
          onPinBlur={(id) => setPinnedOrderId((current) => (current === id ? null : current))}
        />
        <s-section padding="none">
          <OrdersIndexTable
            orders={SAMPLE_ORDERS}
            todayISO="2026-10-24"
            loading={false}
            isSubmitting={false}
            hasNextPage={false}
            hasPreviousPage={false}
            onNextPage={doNothing}
            onPreviousPage={doNothing}
            tabs={[{ id: "all", label: "All", count: SAMPLE_ORDERS.length }]}
            activeTab="all"
            onTabChange={doNothing}
            queryValue=""
            onQueryChange={doNothing}
            onQueryClear={doNothing}
            deliveryDateFilter=""
            onDeliveryDateChange={doNothing}
            timeWindow=""
            onTimeWindowChange={doNothing}
            sortSelected="orderDate desc"
            onSortChange={doNothing}
            onClearFilters={doNothing}
            hasActiveFilters={false}
            selectedResources={selectedResources}
            selectAllState={selectAllState}
            onSelectRow={selectRow}
            onSelectAll={selectAll}
            onOpenOrder={() => setNote("Preview only: opening an order does nothing here.")}
            onShowTags={doNothing}
            onOpenBulkModal={() => setNote("Preview only: this action does nothing here.")}
            onAddToMap={addSelected}
            highlightedOrderId={pinnedOrderId}
          />
        </s-section>
      </s-stack>
    </div>
  );
}
