import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter
} from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";

import { DashboardPage, HomeManagePage } from "./components/dashboard-page";
import { HistoryPage } from "./components/history-page";
import { LedgerPage } from "./components/ledger-page";
import { LogsPage } from "./components/logs-page";
import { NewsPage } from "./components/news-page";
import { SummaryPage } from "./components/summary-page";
import { TodoPage } from "./components/todo-module";
import { PhotoRenamerPage } from "./components/photo-renamer-page";
import { FileOrganizerPage } from "./components/file-organizer-page";
import { BrowserAutomationPage } from "./components/browser-automation-page";
import { PromptTemplatePage } from "./components/prompt-template-page";
import { ScreenMonitorPage } from "./components/screen-monitor-page";
import { ToolsPage } from "./components/tools-page";
import { ChildMealPage } from "./components/child-meal-page";
import { MhxyPage } from "./components/mhxy-page";
import { GameCreatorPage } from "./components/game-creator-page";
import { useWallpaperScrollSupport } from "./scroll-support";
import { UI_ROUTE_PATHS } from "./ui-contract";

const queryClient = new QueryClient();

function RootLayout() {
  useWallpaperScrollSupport();

  return <Outlet />;
}

const rootRoute = createRootRoute({
  component: RootLayout
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: UI_ROUTE_PATHS.home,
  component: DashboardPage
});

const newsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: UI_ROUTE_PATHS.news,
  component: NewsPage
});

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: UI_ROUTE_PATHS.history,
  component: HistoryPage
});

const manageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: UI_ROUTE_PATHS.manage,
  component: HomeManagePage
});

const ledgerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: UI_ROUTE_PATHS.ledger,
  component: LedgerPage
});

const mhxyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: UI_ROUTE_PATHS.mhxy,
  component: MhxyPage
});

const todoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: UI_ROUTE_PATHS.todo,
  component: TodoPage
});

const summaryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: UI_ROUTE_PATHS.summaries,
  component: SummaryPage
});

const logsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: UI_ROUTE_PATHS.logs,
  component: LogsPage
});

const toolsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: UI_ROUTE_PATHS.tools,
  component: ToolsPage
});

const photoRenamerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: UI_ROUTE_PATHS.photoRenamer,
  component: PhotoRenamerPage
});

const fileOrganizerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: UI_ROUTE_PATHS.fileOrganizer,
  component: FileOrganizerPage
});

const browserAutomationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: UI_ROUTE_PATHS.browserAutomation,
  component: BrowserAutomationPage
});

const screenMonitorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: UI_ROUTE_PATHS.screenMonitor,
  component: ScreenMonitorPage
});

const promptTemplateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: UI_ROUTE_PATHS.promptTemplates,
  component: PromptTemplatePage
});

const childMealRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: UI_ROUTE_PATHS.childMeal,
  component: ChildMealPage
});

const gameCreatorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: UI_ROUTE_PATHS.gameCreator,
  component: GameCreatorPage
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  manageRoute,
  newsRoute,
  historyRoute,
  ledgerRoute,
  mhxyRoute,
  todoRoute,
  summaryRoute,
  toolsRoute,
  photoRenamerRoute,
  fileOrganizerRoute,
  browserAutomationRoute,
  screenMonitorRoute,
  promptTemplateRoute,
  childMealRoute,
  gameCreatorRoute,
  logsRoute
]);

const router = createRouter({
  routeTree,
  context: {
    queryClient
  }
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} context={{ queryClient }} />;
}

export { queryClient };
