// These tests pin the map contract to the same order fields and tag vocabulary
// used by the Orders page, so the map cannot silently create a second state.

import { describe, expect, it } from "vitest";

import {
  buildPopupText,
  normalizeDispatchAddress,
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

// The popup shows one short delivery summary and never a placeholder.
describe("pin popup text", () => {
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

  it("writes name, address, date, time, items and price in one line", () => {
    expect(buildPopupText(fullOrder)).toBe(
      "john doe, blk3, lot19, phase 2, tanay, rizal. 10-24-2026, 9:00 AM - 12:00 PM, 1x bouquet of flowers, ₱1,099",
    );
  });

  it("is what the map order carries for the popup", () => {
    expect(toDispatchMapOrder(fullOrder)?.popupText).toBe(buildPopupText(fullOrder));
  });

  it("falls back to the buyer's name when the address has no name", () => {
    const text = buildPopupText({
      ...fullOrder,
      shippingAddress: { ...fullOrder.shippingAddress, firstName: null, lastName: null },
    });
    expect(text.startsWith("Mia Reyes, blk3")).toBe(true);
  });

  it("leaves out anything missing instead of showing a placeholder", () => {
    const text = buildPopupText({
      ...fullOrder,
      customAttributes: [],
      tags: [],
      customDate: null,
      customTimeSlot: null,
      lineItems: null,
      currentTotalPriceSet: null,
    });
    expect(text).toBe("john doe, blk3, lot19, phase 2, tanay, rizal");
    expect(text).not.toMatch(/—|N\/A|undefined|null/);
  });

  it("shows cents only when the price has cents", () => {
    const text = buildPopupText({
      ...fullOrder,
      currentTotalPriceSet: { shopMoney: { amount: "1099.50", currencyCode: "PHP" } },
    });
    expect(text.endsWith("₱1,099.50")).toBe(true);
  });

  it("shows an unreadable time slot as it was saved", () => {
    const text = buildPopupText({
      ...fullOrder,
      customTimeSlot: { value: "Anytime" },
    });
    expect(text).toContain("10-24-2026, Anytime, 1x bouquet of flowers");
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
