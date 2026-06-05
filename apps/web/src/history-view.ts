import type { HistoryDynastyPayload, HistoryNotificationPayload, HistoryPostPayload, NotificationRecord } from "@agent-zy/shared-types";

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
    (notification): notification is NotificationRecord & { payload: HistoryNotificationPayload } =>
      notification.kind === "history-post" &&
      (isHistoryPostPayload(notification.payload) || isHistoryDynastyPayload(notification.payload))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function hasRenderableCards(value: unknown) {
  return Array.isArray(value);
}

function isRenderableDynastyModule(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.type === "string" &&
    typeof value.topic === "string" &&
    typeof value.summary === "string" &&
    typeof value.cardCount === "number" &&
    hasRenderableCards(value.cards) &&
    typeof value.xiaohongshuCaption === "string"
  );
}

export function isHistoryPostPayload(payload: HistoryNotificationPayload | undefined): payload is HistoryPostPayload {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    typeof payload.topic === "string" &&
    typeof payload.summary === "string" &&
    typeof payload.cardCount === "number" &&
    hasRenderableCards(payload.cards) &&
    typeof payload.xiaohongshuCaption === "string"
  );
}

export function isHistoryDynastyPayload(payload: HistoryNotificationPayload | undefined): payload is HistoryDynastyPayload {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    typeof payload.dynasty === "string" &&
    Array.isArray(payload.modules) &&
    payload.modules.every(isRenderableDynastyModule)
  );
}

export function getHistoryPayloadTitle(payload: HistoryNotificationPayload) {
  return isHistoryDynastyPayload(payload) ? payload.dynasty : payload.topic;
}

export function getHistoryPayloadSummary(payload: HistoryNotificationPayload) {
  return isHistoryDynastyPayload(payload)
    ? `${payload.dynasty}朝代四件套：${payload.modules.map((module) => module.type).join("、")}`
    : payload.summary;
}

export function getHistoryPayloadUpdatedAt(notification: NotificationRecord & { payload: HistoryNotificationPayload }) {
  return isHistoryPostPayload(notification.payload) ? notification.payload.generatedAt : notification.createdAt;
}

export function buildCaptionExcerpt(caption: string, maxLength = 96) {
  if (caption.length <= maxLength) {
    return caption;
  }

  return `${caption.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
