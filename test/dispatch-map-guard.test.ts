// The Orders map must stay a read-only picture. These checks read the map's own
// source files and fail if one of them starts importing server code, tag logic,
// or anything that could write to a Shopify order.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const MAP_FILES = [
  "app/components/orders/DispatchMap.tsx",
  "app/lib/dispatch-map.ts",
  "app/lib/dispatch-route.ts",
  "app/lib/dispatch-geocode.ts",
  "app/lib/dispatch-directions.ts",
];

const read = (file: string) => readFileSync(resolve(__dirname, "..", file), "utf8");

describe("the Orders map stays read-only", () => {
  it.each(MAP_FILES)("%s does not import server code or tag logic", (file) => {
    const source = read(file);
    expect(source).not.toMatch(/from\s+["'][^"']*\.server["']/);
    expect(source).not.toMatch(/from\s+["'][^"']*order-tags["']/);
    expect(source).not.toMatch(/from\s+["'][^"']*shopify\.server["']/);
  });

  it.each(MAP_FILES)("%s has no Shopify write or form submit", (file) => {
    const source = read(file);
    expect(source).not.toMatch(
      /orderUpdate|orderCancel|tagsAdd|tagsRemove|metafieldsSet|fulfillmentCreate|orderMarkAsPaid|useFetcher|useSubmit|\.submit\(|admin\.graphql/,
    );
  });

  it.each(MAP_FILES)("%s only talks to Mapbox over the network", (file) => {
    const urls = read(file).match(/https?:\/\/[^\s"'`)]+/g) ?? [];
    for (const url of urls) {
      // The SVG namespace is a name, not a request.
      if (url === "http://www.w3.org/2000/svg") continue;
      expect(url).toMatch(/^https:\/\/api\.mapbox\.com\//);
    }
  });
});
