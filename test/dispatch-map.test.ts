// These tests pin the map contract to the same order fields and tag vocabulary
// used by the Orders page, so the map cannot silently create a second state.

import { describe, expect, it } from "vitest";

import {
  addSelectedToMap,
  buildPopupDetails,
  normalizeDispatchAddress,
  removeFromMap,
  resolveMapOrders,
  toDispatchMapOrder,
} from "../app/lib/dispatch-map";
import type { Order } from "../app/lib/order-utils";

const order = {
  id: "gid://shopify/Order/1",
  name: "#1001",
  createdAt: "2026-10-23T00:00:00Z",
  cancelledAt: null,
  displayFulfillmentStatus: "UNFULFILLED",
  displayFinancialStatus: "PAID",
  tags: ["2026-10-24", "9AM-12PM", "ops_md_checked"],
  customer: {
    id: "gid://shopify/Customer/1",
    firstName: "Mia",
    lastName: "Reyes",
    defaultEmailAddress: null,
    defaultPhoneNumber: null,
  },
  deliveryDate: null,
  deliveryTimeSlot: null,
  customDate: { value: "2026-10-24" },
  customTimeSlot: { value: "9AM-12PM" },
  rescheduleHistory: null,
  shippingAddress: {
    address1: " 12  Kamias Road ",
    address2: null,
    city: "Quezon City",
    province: "Metro Manila",
    zip: "1102",
    country: "Philippines",
    phone: null,
  },
  billingAddress: null,
  note: null,
  currentTotalPriceSet: null,
  totalShippingPriceSet: null,
  customAttributes: [],
  lineItems: null,
  fulfillments: null,
  emailLog: [],
} satisfies Order;

describe("dispatch map order adapter", () => {
  it("uses the same canonical delivery fields as the Orders table", () => {
    expect(toDispatchMapOrder(order)).toMatchObject({
      id: order.id,
      orderNumber: "#1001",
      deliveryDate: "2026-10-24",
      deliveryTimeSlot: "9AM-12PM",
    });
  });

  it("normalizes whitespace without changing address fields", () => {
    expect(normalizeDispatchAddress(order)).toBe(
      "12 Kamias Road, Quezon City, Metro Manila, 1102, Philippines",
    );
  });
});

// The popup shows one field per line and never a placeholder.
describe("pin popup details", () => {
  const fullOrder = {
    ...order,
    customAttributes: [],
    shippingAddress: {
      ...order.shippingAddress,
      firstName: "john",
      lastName: "doe",
      address1: "blk3",
      address2: "lot19, phase 2",
      city: "tanay",
      province: "rizal",
    },
    lineItems: {
      edges: [
        {
          node: {
            name: "bouquet of flowers",
            quantity: 1,
            sku: null,
            image: null,
            product: null,
          },
        },
      ],
    },
    currentTotalPriceSet: { shopMoney: { amount: "1099.00", currencyCode: "PHP" } },
  } satisfies Order;

  it("gives one value per field: name, street lines, area, delivery, items and price", () => {
    expect(buildPopupDetails(fullOrder)).toEqual({
      name: "john doe",
      streetLines: ["blk3", "lot19, phase 2"],
      area: "tanay, rizal",
      delivery: "10-24-2026, 9:00 AM - 12:00 PM",
      items: ["1x bouquet of flowers"],
      price: "₱1,099",
    });
  });

  it("is what the map order carries for the popup", () => {
    expect(toDispatchMapOrder(fullOrder)?.popup).toEqual(buildPopupDetails(fullOrder));
  });

  it("falls back to the buyer's name when the address has no name", () => {
    const details = buildPopupDetails({
      ...fullOrder,
      shippingAddress: { ...fullOrder.shippingAddress, firstName: null, lastName: null },
    });
    expect(details.name).toBe("Mia Reyes");
  });

  it("leaves out anything missing instead of showing a placeholder", () => {
    const details = buildPopupDetails({
      ...fullOrder,
      customAttributes: [],
      tags: [],
      customDate: null,
      customTimeSlot: null,
      lineItems: null,
      currentTotalPriceSet: null,
    });
    expect(details).toEqual({
      name: "john doe",
      streetLines: ["blk3", "lot19, phase 2"],
      area: "tanay, rizal",
      delivery: "",
      items: [],
      price: "",
    });
    expect(JSON.stringify(details)).not.toMatch(/—|N\/A|undefined|null/);
  });

  it("drops an empty second street line", () => {
    const details = buildPopupDetails({
      ...fullOrder,
      shippingAddress: { ...fullOrder.shippingAddress, address2: "  " },
    });
    expect(details.streetLines).toEqual(["blk3"]);
  });

  it("lists each item on its own entry", () => {
    const item = fullOrder.lineItems.edges[0];
    const details = buildPopupDetails({
      ...fullOrder,
      lineItems: {
        edges: [item, { node: { ...item.node, name: "card", quantity: 2 } }],
      },
    });
    expect(details.items).toEqual(["1x bouquet of flowers", "2x card"]);
  });

  it("shows cents only when the price has cents", () => {
    const details = buildPopupDetails({
      ...fullOrder,
      currentTotalPriceSet: { shopMoney: { amount: "1099.50", currencyCode: "PHP" } },
    });
    expect(details.price).toBe("₱1,099.50");
  });

  it("shows an unreadable time slot as it was saved", () => {
    const details = buildPopupDetails({
      ...fullOrder,
      customTimeSlot: { value: "Anytime" },
    });
    expect(details.delivery).toBe("10-24-2026, Anytime");
  });
});

// Shopify's own position is used when it is valid; otherwise the map looks the address up.
describe("map position from Shopify", () => {
  it("uses Shopify latitude and longitude as [longitude, latitude]", () => {
    const placed = toDispatchMapOrder({
      ...order,
      shippingAddress: { ...order.shippingAddress, latitude: 14.6, longitude: 121.05 },
    });
    expect(placed?.coordinates).toEqual([121.05, 14.6]);
  });

  it("ignores a missing, zero or out-of-country position", () => {
    for (const position of [
      {},
      { latitude: null, longitude: null },
      { latitude: 0, longitude: 0 },
      { latitude: 51.5, longitude: -0.12 },
    ]) {
      const placed = toDispatchMapOrder({
        ...order,
        shippingAddress: { ...order.shippingAddress, ...position },
      });
      expect(placed?.coordinates).toBeNull();
    }
  });
});

// "Add to map": only the ticked rows go on the map, and they stay when the table filter changes.
describe("orders on the map", () => {
  const make = (number: number): Order => ({
    ...order,
    id: `gid://shopify/Order/${number}`,
    name: `#${number}`,
  });
  const [a, b, c] = [make(1), make(2), make(3)];

  it("adds only the ticked rows, in table order", () => {
    expect(addSelectedToMap([], [a, b, c], [c.id, a.id]).map((o) => o.name)).toEqual(["#1", "#3"]);
  });

  it("keeps the place of orders already on the map and adds the new ones after", () => {
    const onMap = addSelectedToMap([], [a, b, c], [b.id]);
    expect(addSelectedToMap(onMap, [a, b, c], [a.id, b.id]).map((o) => o.name)).toEqual([
      "#2",
      "#1",
    ]);
  });

  it("adds nothing for ids that are not in the table's list", () => {
    expect(addSelectedToMap([], [a], ["gid://shopify/Order/999"])).toEqual([]);
  });

  it("removes one order from the map", () => {
    expect(removeFromMap([a, b, c], b.id).map((o) => o.name)).toEqual(["#1", "#3"]);
  });

  it("keeps an order on the map after it leaves the table list, and prefers the newer copy", () => {
    const newerB = { ...b, name: "#2-edited" };
    const result = resolveMapOrders([a, b], [newerB]);
    expect(result.map((o) => o.orderNumber)).toEqual(["#1", "#2-edited"]);
  });
});
