import { describe, expect, it } from "vitest";

import { formatPercent, formatRatioPercent } from "../utils/format";

describe("percentage formatting", () => {
  it("keeps stored percentage values distinct from ratio values", () => {
    expect(formatPercent(82.5)).toBe("82.5%");
    expect(formatRatioPercent(0.825)).toBe("82.5%");
  });

  it("uses the empty-data label for missing values", () => {
    expect(formatPercent(null)).toBe("Not enough data");
    expect(formatRatioPercent(undefined)).toBe("Not enough data");
  });
});
