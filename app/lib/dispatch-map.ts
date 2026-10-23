// The map reads this small, stable shape from the Orders loader. It never
// creates a second order record or guesses delivery values outside that loader.

import {
  getDeliveryDateValue,
  getDeliveryTimeValue,
  type Order,
} from "./order-utils";
import { isPhilippineLngLat } from "./dispatch-geocode";
import type { LngLat } from "./dispatch-route";
import { parseSlotValueToTimes, type SlotTimePart } from "./slot-times";

export interface DispatchMapOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  address: string;
  addressKey: string;
  /** Shopify's own position for the address, or null when the map must look the address up. */
  coordinates: LngLat | null;
  deliveryDate: string | null;
  deliveryTimeSlot: string | null;
  fulfillmentStatus: string;
  /** The one-line delivery summary shown when a pin is clicked. */
  popupText: string;
}

/** Turns "2026-10-23" into "10-23-2026". Anything else gives "" so it is left out. */
function formatPopupDate(iso: string | null): string {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}-${match[3]}-${match[1]}` : "";
}

/** Turns "9AM-12PM" into "9:00 AM - 12:00 PM". A slot we cannot read is shown as it was saved. */
function formatPopupTime(slot: string | null): string {
  if (!slot) return "";
  const times = parseSlotValueToTimes(slot);
  if (!times) return slot;
  const clock = (part: SlotTimePart) =>
    `${part.hour}:${String(part.minute).padStart(2, "0")} ${part.meridiem}`;
  return `${clock(times.start)} - ${clock(times.end)}`;
}

/** Writes the order total like "₱1,099". Cents only show when the amount has cents. */
function formatPopupPrice(order: Order): string {
  const money = order.currentTotalPriceSet?.shopMoney;
  const amount = Number(money?.amount);
  if (!money || !Number.isFinite(amount)) return "";
  const digits = Number.isInteger(amount) ? 0 : 2;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: money.currencyCode,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Builds the delivery summary for the pin popup, for example
 * "john doe, blk3, tanay, rizal. 10-23-2026, 9:00 AM - 12:00 PM, 1x bouquet, ₱1,099".
 * A part that has no value is left out, so the popup never shows a placeholder.
 */
export function buildPopupText(order: Order): string {
  const address = order.shippingAddress;
  const clean = (value: string | null | undefined) =>
    value?.trim().replace(/\s+/g, " ") ?? "";
  const joinParts = (parts: Array<string | null | undefined>, separator: string) =>
    parts.map(clean).filter(Boolean).join(separator);

  const name =
    joinParts([address?.firstName, address?.lastName], " ") ||
    joinParts([order.customer?.firstName, order.customer?.lastName], " ");
  const place = joinParts(
    [address?.address1, address?.address2, address?.city, address?.province],
    ", ",
  );
  const items = (order.lineItems?.edges ?? [])
    .map(({ node }) => `${node.quantity}x ${clean(node.name)}`)
    .join(", ");
  const date = getDeliveryDateValue(order);
  const slot = getDeliveryTimeValue(order);

  const who = joinParts([name, place], ", ");
  const when = joinParts(
    [
      formatPopupDate(date === "—" ? null : date),
      formatPopupTime(slot === "—" ? null : slot),
      items,
      formatPopupPrice(order),
    ],
    ", ",
  );
  return joinParts([who, when], ". ");
}

/** Normalizes address text so one address gets one geocoding cache key. */
export function normalizeDispatchAddress(order: Order): string {
  const address = order.shippingAddress;
  if (!address) return "";

  return [
    address.address1,
    address.address2,
    address.city,
    address.province,
    address.zip,
    address.country,
  ]
    .map((value) => value?.trim().replace(/\s+/g, " ") ?? "")
    .filter(Boolean)
    .join(", ");
}

/** Adapts an Orders-page order into map input without changing Shopify data. */
export function toDispatchMapOrder(order: Order): DispatchMapOrder | null {
  const address = normalizeDispatchAddress(order);
  if (!address) return null;

  const date = getDeliveryDateValue(order);
  const timeSlot = getDeliveryTimeValue(order);
  const { latitude, longitude } = order.shippingAddress ?? {};
  const customerName =
    [order.customer?.firstName, order.customer?.lastName]
      .filter(Boolean)
      .join(" ") || order.name;

  return {
    id: order.id,
    orderNumber: order.name,
    customerName,
    address,
    addressKey: address.toLowerCase(),
    coordinates: isPhilippineLngLat(longitude, latitude)
      ? [longitude as number, latitude as number]
      : null,
    deliveryDate: date === "—" ? null : date,
    deliveryTimeSlot: timeSlot === "—" ? null : timeSlot,
    fulfillmentStatus: order.displayFulfillmentStatus,
    popupText: buildPopupText(order),
  };
}
