// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  createPointerScrollSession,
  findScrollablePointerTarget,
  findScrollableWheelTarget,
  scrollElementByPointer,
  scrollElementByControl,
  scrollElementByWheel
} from "./scroll-support";

function makeScrollable() {
  const scrollable = document.createElement("div");
  const child = document.createElement("button");

  scrollable.style.overflowY = "auto";
  Object.defineProperties(scrollable, {
    clientHeight: {
      configurable: true,
      value: 100
    },
    scrollHeight: {
      configurable: true,
      value: 300
    }
  });

  scrollable.appendChild(child);
  document.body.appendChild(scrollable);

  return {
    scrollable,
    child
  };
}

describe("wallpaper scroll support", () => {
  it("finds the nearest scrollable ancestor for wheel events", () => {
    const { scrollable, child } = makeScrollable();

    expect(findScrollableWheelTarget(child, 0, 80)).toBe(scrollable);

    scrollable.remove();
  });

  it("scrolls the target element manually", () => {
    const { scrollable } = makeScrollable();

    expect(scrollElementByWheel(scrollable, 0, 80)).toBe(true);
    expect(scrollable.scrollTop).toBe(80);

    scrollable.remove();
  });

  it("finds a scrollable ancestor for pointer dragging", () => {
    const { scrollable, child } = makeScrollable();

    expect(findScrollablePointerTarget(child)).toBe(scrollable);

    scrollable.remove();
  });

  it("scrolls the target element by pointer drag distance", () => {
    const { scrollable } = makeScrollable();
    const session = createPointerScrollSession(scrollable, 1, 20, 120);

    expect(scrollElementByPointer(session, 20, 40)).toBe(true);
    expect(scrollable.scrollTop).toBe(80);

    scrollable.remove();
  });

  it("scrolls the target element from explicit controls", () => {
    const { scrollable } = makeScrollable();

    expect(scrollElementByControl(scrollable, "down")).toBe(true);
    expect(scrollable.scrollTop).toBeGreaterThan(0);

    const afterDown = scrollable.scrollTop;

    expect(scrollElementByControl(scrollable, "up")).toBe(true);
    expect(scrollable.scrollTop).toBeLessThan(afterDown);

    scrollable.remove();
  });
});
