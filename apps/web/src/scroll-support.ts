import { useEffect } from "react";

const scrollableOverflowValues = new Set(["auto", "scroll", "overlay"]);

function canScrollVertically(element: HTMLElement, deltaY: number) {
  if (deltaY === 0 || element.scrollHeight <= element.clientHeight) {
    return false;
  }

  if (deltaY < 0) {
    return element.scrollTop > 0;
  }

  return element.scrollTop < element.scrollHeight - element.clientHeight;
}

function canScrollHorizontally(element: HTMLElement, deltaX: number) {
  if (deltaX === 0 || element.scrollWidth <= element.clientWidth) {
    return false;
  }

  if (deltaX < 0) {
    return element.scrollLeft > 0;
  }

  return element.scrollLeft < element.scrollWidth - element.clientWidth;
}

function isScrollableElement(element: HTMLElement, deltaX: number, deltaY: number) {
  const style = window.getComputedStyle(element);
  const canUseY = scrollableOverflowValues.has(style.overflowY) && canScrollVertically(element, deltaY);
  const canUseX = scrollableOverflowValues.has(style.overflowX) && canScrollHorizontally(element, deltaX);

  return canUseY || canUseX;
}

export function findScrollableWheelTarget(target: EventTarget | null, deltaX: number, deltaY: number) {
  if (!(target instanceof Element)) {
    return null;
  }

  let element: Element | null = target;

  while (element && element !== document.body && element !== document.documentElement) {
    if (element instanceof HTMLElement && isScrollableElement(element, deltaX, deltaY)) {
      return element;
    }

    element = element.parentElement;
  }

  return null;
}

export function scrollElementByWheel(element: HTMLElement, deltaX: number, deltaY: number) {
  const beforeTop = element.scrollTop;
  const beforeLeft = element.scrollLeft;

  element.scrollTop += deltaY;
  element.scrollLeft += deltaX;

  return element.scrollTop !== beforeTop || element.scrollLeft !== beforeLeft;
}

export function useWallpaperScrollSupport() {
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const scrollTarget = findScrollableWheelTarget(event.target, event.deltaX, event.deltaY);

      if (scrollTarget && scrollElementByWheel(scrollTarget, event.deltaX, event.deltaY)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false
    });

    return () => {
      document.removeEventListener("wheel", handleWheel, {
        capture: true
      });
    };
  }, []);
}
