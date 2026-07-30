import { describe, expect, it } from "vitest";

import { HOME_MODULE_DEFINITIONS, HOME_MODULE_SIZE_OPTIONS } from "./home-layout";
import {
  COLLAPSED_HOME_MODULE_RULE,
  HOME_MODULE_SIZE_RULES,
  getHomeModuleSizeRule
} from "./home-module-size-contract";

describe("home module size contract", () => {
  it("defines one explicit presentation rule for all 40 module-size combinations", () => {
    const moduleIds = HOME_MODULE_DEFINITIONS.map((definition) => definition.id);
    const sizes = HOME_MODULE_SIZE_OPTIONS.map((option) => option.value);
    const rules = moduleIds.flatMap((moduleId) =>
      sizes.map((size) => getHomeModuleSizeRule(moduleId, size))
    );

    expect(Object.keys(HOME_MODULE_SIZE_RULES)).toEqual(moduleIds);
    expect(rules).toHaveLength(40);
    expect(new Set(rules.map((rule) => rule.variant)).size).toBe(40);

    for (const rule of rules) {
      expect(rule.mustShow).toContain("identity");
      expect(rule.mustShow).toContain("primaryAction");
      expect(rule.primaryAction.length).toBeGreaterThan(0);
      expect(rule.maxItems).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps compact modules decisive and larger modules progressively richer", () => {
    for (const definition of HOME_MODULE_DEFINITIONS) {
      const small = getHomeModuleSizeRule(definition.id, "small");
      const smaller = getHomeModuleSizeRule(definition.id, "smaller");
      const large = getHomeModuleSizeRule(definition.id, "large");
      const max = getHomeModuleSizeRule(definition.id, "max");

      expect(small.maxItems).toBeLessThanOrEqual(1);
      expect(smaller.maxItems).toBeLessThanOrEqual(3);
      expect(large.maxItems).toBeGreaterThanOrEqual(smaller.maxItems);
      expect(max.maxItems).toBeGreaterThanOrEqual(large.maxItems);
      expect(small.features).not.toContain("internalScroll");
      expect(smaller.features).not.toContain("internalScroll");
    }
  });

  it("defines the shared collapsed state as identity, status, and expand control only", () => {
    expect(COLLAPSED_HOME_MODULE_RULE).toEqual({
      mustShow: ["identity", "status", "expandControl"],
      mayOmit: ["allDetails", "secondaryActions"],
      primaryAction: "expand",
      maxItems: 0
    });
  });
});
