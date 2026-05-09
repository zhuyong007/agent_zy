import type { HistoryPostPayload, NotificationRecord } from "@agent-zy/shared-types";

import type { HomeModuleSize } from "./home-layout";

export interface HistoryHomePreviewRule {
  visibleCards: number;
  showSummary: boolean;
  showCaption: boolean;
  showPrompts: boolean;
  showStats: boolean;
  showMetaLine: boolean;
}

export const HISTORY_HOME_PREVIEW_RULES: Record<HomeModuleSize, HistoryHomePreviewRule> = {
  max: {
    visibleCards: 5,
    showSummary: true,
    showCaption: true,
    showPrompts: true,
    showStats: true,
    showMetaLine: true
  },
  large: {
    visibleCards: 4,
    showSummary: true,
    showCaption: true,
    showPrompts: false,
    showStats: true,
    showMetaLine: true
  },
  medium: {
    visibleCards: 3,
    showSummary: true,
    showCaption: true,
    showPrompts: false,
    showStats: false,
    showMetaLine: true
  },
  smaller: {
    visibleCards: 2,
    showSummary: true,
    showCaption: false,
    showPrompts: false,
    showStats: false,
    showMetaLine: false
  },
  small: {
    visibleCards: 1,
    showSummary: false,
    showCaption: false,
    showPrompts: false,
    showStats: false,
    showMetaLine: false
  }
};

export function getHistoryHomePreviewRule(size: HomeModuleSize) {
  return HISTORY_HOME_PREVIEW_RULES[size];
}

export function getHistoryNotifications(notifications: NotificationRecord[]) {
  return notifications.filter(
    (notification): notification is NotificationRecord & { payload: HistoryPostPayload } =>
      notification.kind === "history-post" && Boolean(notification.payload)
  );
}

export function buildCaptionExcerpt(caption: string, maxLength = 96) {
  if (caption.length <= maxLength) {
    return caption;
  }

  return `${caption.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
