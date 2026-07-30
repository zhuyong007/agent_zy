export const UI_VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1280, height: 720 }
} as const;

export const UI_TOUCH_TARGET_PX = 44;
export const UI_MOBILE_BREAKPOINT_PX = 760;

export function shouldCollapseNavigationByDefault(viewportWidth: number) {
  return viewportWidth <= UI_MOBILE_BREAKPOINT_PX;
}

export const UI_ROUTE_PATHS = {
  home: "/",
  manage: "/manage",
  news: "/news",
  history: "/history",
  ledger: "/ledger",
  mhxy: "/mhxy",
  todo: "/todo",
  summaries: "/summaries",
  logs: "/logs",
  tools: "/tools",
  photoRenamer: "/tools/photo-renamer",
  fileOrganizer: "/tools/file-organizer",
  browserAutomation: "/tools/browser-automation",
  screenMonitor: "/tools/screen-monitor",
  promptTemplates: "/tools/prompt-templates",
  childMeal: "/tools/child-meal",
  gameCreator: "/game-creator"
} as const;

export const UI_ROUTES = [
  { key: "home", label: "工作台", group: "core", path: UI_ROUTE_PATHS.home },
  { key: "manage", label: "管理", group: "core", path: UI_ROUTE_PATHS.manage },
  { key: "news", label: "热点情报", group: "core", path: UI_ROUTE_PATHS.news },
  { key: "history", label: "历史知识", group: "core", path: UI_ROUTE_PATHS.history },
  { key: "ledger", label: "记账", group: "core", path: UI_ROUTE_PATHS.ledger },
  { key: "mhxy", label: "梦幻西游", group: "core", path: UI_ROUTE_PATHS.mhxy },
  { key: "todo", label: "待办", group: "core", path: UI_ROUTE_PATHS.todo },
  { key: "summaries", label: "总结", group: "core", path: UI_ROUTE_PATHS.summaries },
  { key: "logs", label: "日志", group: "core", path: UI_ROUTE_PATHS.logs },
  { key: "tools", label: "工具", group: "tools", path: UI_ROUTE_PATHS.tools },
  { key: "photoRenamer", label: "媒体重命名", group: "tools", path: UI_ROUTE_PATHS.photoRenamer },
  { key: "fileOrganizer", label: "文件整理", group: "tools", path: UI_ROUTE_PATHS.fileOrganizer },
  {
    key: "browserAutomation",
    label: "浏览器自动化",
    group: "tools",
    path: UI_ROUTE_PATHS.browserAutomation
  },
  { key: "screenMonitor", label: "屏幕监控", group: "tools", path: UI_ROUTE_PATHS.screenMonitor },
  { key: "promptTemplates", label: "提示词模版", group: "tools", path: UI_ROUTE_PATHS.promptTemplates },
  { key: "childMeal", label: "孩子食谱", group: "tools", path: UI_ROUTE_PATHS.childMeal },
  { key: "gameCreator", label: "游戏创作", group: "tools", path: UI_ROUTE_PATHS.gameCreator }
] as const;

export const UI_ROUTE_COUNT = UI_ROUTES.length;
