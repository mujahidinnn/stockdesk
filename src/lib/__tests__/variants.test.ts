import { expect, it } from "vitest";
import { buildVariants } from "../variants";

it("builds every combination with product-attribute codes", () => {
  const combos = buildVariants("TEE", [
    { name: "color", values: ["Black", "Light Grey", "Black"] },
    { name: "size", values: ["M", "L"] },
    { name: "fit", values: [] },
  ]);
  expect(combos.map((c) => c.skuCode)).toEqual(["TEE-BLACK-M", "TEE-BLACK-L", "TEE-LIGHTGREY-M", "TEE-LIGHTGREY-L"]);
  expect(combos[2].attributes).toEqual({ color: "Light Grey", size: "M" });
});

it("gives a single plain SKU when there are no variants", () => {
  expect(buildVariants("mug", [])).toEqual([{ skuCode: "MUG", attributes: {} }]);
});
