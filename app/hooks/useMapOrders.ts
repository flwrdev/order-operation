// Keeps the list of orders on the Orders-page map. The merchant ticks rows in the
// table and presses "Add to map"; only those orders are drawn. The list lives in
// the browser only: it is never saved to Shopify or the database.

import { useCallback, useMemo, useState } from "react";

import {
  addSelectedToMap,
  removeFromMap,
  resolveMapOrders,
} from "../lib/dispatch-map";
import type { Order } from "../lib/order-utils";

// `loadedOrders` is the page the loader gave, `displayedOrders` the rows now in the
// table, and `selectedIds` the ticked rows.
export function useMapOrders(
  loadedOrders: Order[],
  displayedOrders: Order[],
  selectedIds: string[],
) {
  const [onMap, setOnMap] = useState<Order[]>([]);

  const mapOrders = useMemo(
    () => resolveMapOrders(onMap, loadedOrders),
    [onMap, loadedOrders],
  );

  // Adds the ticked rows to the map.
  const addSelected = useCallback(() => {
    setOnMap((current) => addSelectedToMap(current, displayedOrders, selectedIds));
  }, [displayedOrders, selectedIds]);

  // Takes one order off the map (the trash button in its popup).
  const removeOrder = useCallback((orderId: string) => {
    setOnMap((current) => removeFromMap(current, orderId));
  }, []);

  // Empties the map.
  const clearMap = useCallback(() => {
    setOnMap([]);
  }, []);

  return { mapOrders, addSelected, removeOrder, clearMap };
}
