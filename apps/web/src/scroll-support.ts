import { useEffect } from "react";

const scrollableOverflowValues = new Set(["auto", "scroll", "overlay"]);
const interactiveSelector = "button, input, textarea, select, [role='button'], [contenteditable='true']";

export type PointerScrollSession = {
  element: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  startTop: number;
  startLeft: number;
  moved: boolean;
};

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

function canScrollByPointer(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const canUseY = scrollableOverflowValues.has(style.overflowY) && element.scrollHeight > element.clientHeight;
  const canUseX = scrollableOverflowValues.has(style.overflowX) && element.scrollWidth > element.clientWidth;

  return canUseY || canUseX;
}

export function findScrollablePointerTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  let element: Element | null = target;

  while (element && element !== document.body && element !== document.documentElement) {
    if (element instanceof HTMLElement && canScrollByPointer(element)) {
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

export function createPointerScrollSession(
  element: HTMLElement,
  pointerId: number,
  clientX: number,
  clientY = 0
): PointerScrollSession {
  return {
    element,
    pointerId,
    startX: clientX,
    startY: clientY,
    startTop: element.scrollTop,
    startLeft: element.scrollLeft,
    moved: false
  };
}

export function scrollElementByPointer(session: PointerScrollSession, clientX: number, clientY: number) {
  const nextTop = session.startTop + session.startY - clientY;
  const nextLeft = session.startLeft + session.startX - clientX;
  const beforeTop = session.element.scrollTop;
  const beforeLeft = session.element.scrollLeft;

  session.element.scrollTop = nextTop;
  session.element.scrollLeft = nextLeft;
  session.moved = session.moved || Math.abs(clientY - session.startY) > 3 || Math.abs(clientX - session.startX) > 3;

  return session.element.scrollTop !== beforeTop || session.element.scrollLeft !== beforeLeft;
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(interactiveSelector));
}

export function useWallpaperScrollSupport() {
  useEffect(() => {
    let pointerSession: PointerScrollSession | null = null;
    let suppressNextClick = false;

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

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || isInteractiveTarget(event.target)) {
        return;
      }

      const scrollTarget = findScrollablePointerTarget(event.target);

      if (!scrollTarget) {
        return;
      }

      pointerSession = createPointerScrollSession(scrollTarget, event.pointerId, event.clientX, event.clientY);
      (event.target as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerSession || pointerSession.pointerId !== event.pointerId) {
        return;
      }

      if (scrollElementByPointer(pointerSession, event.clientX, event.clientY)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (!pointerSession || pointerSession.pointerId !== event.pointerId) {
        return;
      }

      suppressNextClick = pointerSession.moved;
      pointerSession = null;
    };

    const handleClick = (event: MouseEvent) => {
      if (!suppressNextClick) {
        return;
      }

      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false
    });
    document.addEventListener("pointerdown", handlePointerDown, {
      capture: true
    });
    document.addEventListener("pointermove", handlePointerMove, {
      capture: true,
      passive: false
    });
    document.addEventListener("pointerup", handlePointerEnd, {
      capture: true
    });
    document.addEventListener("pointercancel", handlePointerEnd, {
      capture: true
    });
    document.addEventListener("click", handleClick, {
      capture: true
    });

    return () => {
      document.removeEventListener("wheel", handleWheel, {
        capture: true
      });
      document.removeEventListener("pointerdown", handlePointerDown, {
        capture: true
      });
      document.removeEventListener("pointermove", handlePointerMove, {
        capture: true
      });
      document.removeEventListener("pointerup", handlePointerEnd, {
        capture: true
      });
      document.removeEventListener("pointercancel", handlePointerEnd, {
        capture: true
      });
      document.removeEventListener("click", handleClick, {
        capture: true
      });
    };
  }, []);
}
