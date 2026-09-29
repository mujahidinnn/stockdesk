import { expect, it } from "vitest";
import { courierTrackUrl } from "../couriers";

it("finds the tracking page from a free-text courier name", () => {
  expect(courierTrackUrl("jne")).toBe("https://www.jne.co.id/tracking-package");
  expect(courierTrackUrl("J&T Express")).toBe("https://jet.co.id/track");
  expect(courierTrackUrl("pos indonesia")).toBe("https://www.posindonesia.co.id/id/tracking");
  expect(courierTrackUrl("Kurir internal")).toBeNull();
  expect(courierTrackUrl("Lion Parcel")).toBeNull();
  expect(courierTrackUrl(null)).toBeNull();
});
