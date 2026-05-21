import { useEffect } from "react";

const scrollableOverflowValues = new Set(["auto", "scroll", "overlay"]);
const interactiveSelector = "button, input, textarea, select, [role='button'], [contenteditable='true']";
const controlClassName = "wallpaper-scroll-controls";

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

export function scrollElementByControl(element: HTMLElement, direction: "up" | "down") {
  const amount = Math.max(80, Math.floor(element.clientHeight * 0.72));
  const beforeTop = element.scrollTop;

  element.scrollTop += direction === "down" ? amount : -amount;

  return element.scrollTop !== beforeTop;
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(interactiveSelector));
}

export function useWallpaperScrollSupport() {
  useEffect(() => {
    let pointerSession: PointerScrollSession | null = null;
    let suppressNextClick = false;
    let activeScrollTarget: HTMLElement | null = null;
    let hideTimer: number | null = null;

    const controls = document.createElement("div");
    const upButton = document.createElement("button");
    const downButton = document.createElement("button");

    controls.className = controlClassName;
    controls.hidden = true;
    upButton.type = "button";
    downButton.type = "button";
    upButton.setAttribute("aria-label", "Scroll up");
    downButton.setAttribute("aria-label", "Scroll down");
    upButton.textContent = "^";
    downButton.textContent = "v";
    controls.append(upButton, downButton);
    document.body.appendChild(controls);

    const scheduleHide = () => {
      if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
      }

      hideTimer = window.setTimeout(() => {
        controls.hidden = true;
        activeScrollTarget = null;
      }, 1400);
    };

    const positionControls = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();

      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      activeScrollTarget = element;
      controls.hidden = false;
      controls.style.top = `${Math.max(8, rect.top + 10)}px`;
      controls.style.left = `${Math.min(window.innerWidth - 42, Math.max(8, rect.right - 42))}px`;
      scheduleHide();
    };

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
      if (event.target instanceof Element && event.target.closest(`.${controlClassName}`)) {
        return;
      }

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

    const handlePointerOver = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(`.${controlClassName}`)) {
        if (activeScrollTarget) {
          positionControls(activeScrollTarget);
        }
        return;
      }

      const scrollTarget = findScrollablePointerTarget(event.target);

      if (scrollTarget) {
        positionControls(scrollTarget);
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

    const handleControlPointerDown = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const handleControlClick = (direction: "up" | "down") => (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (activeScrollTarget) {
        scrollElementByControl(activeScrollTarget, direction);
        positionControls(activeScrollTarget);
      }
    };

    const handleUpClick = handleControlClick("up");
    const handleDownClick = handleControlClick("down");

    document.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false
    });
    document.addEventListener("pointerdown", handlePointerDown, {
      capture: true
    });
    document.addEventListener("pointerover", handlePointerOver, {
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
    controls.addEventListener("pointerdown", handleControlPointerDown);
    upButton.addEventListener("click", handleUpClick);
    downButton.addEventListener("click", handleDownClick);

    return () => {
      if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
      }

      document.removeEventListener("wheel", handleWheel, {
        capture: true
      });
      document.removeEventListener("pointerdown", handlePointerDown, {
        capture: true
      });
      document.removeEventListener("pointerover", handlePointerOver, {
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
      controls.removeEventListener("pointerdown", handleControlPointerDown);
      upButton.removeEventListener("click", handleUpClick);
      downButton.removeEventListener("click", handleDownClick);
      controls.remove();
    };
  }, []);
}
