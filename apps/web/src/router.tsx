import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter
} from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";

import { DashboardPage, HomeManagePage } from "./components/dashboard-page";
import { ClassicShotPage } from "./components/classic-shot-page";
import { CinematicPage } from "./components/cinematic-page";
import { HistoryPage } from "./components/history-page";
import { LedgerPage } from "./components/ledger-page";
import { NewsPage } from "./components/news-page";
import { SummaryPage } from "./components/summary-page";
import { TodoPage } from "./components/todo-module";
import { TopicPage } from "./components/topic-page";
import { useWallpaperScrollSupport } from "./scroll-support";

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
  path: "/",
  component: DashboardPage
});

const newsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/news",
  component: NewsPage
});

const topicsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/topics",
  component: TopicPage
});

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: HistoryPage
});

const cinematicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cinematic",
  component: CinematicPage
});

const classicShotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classic-shots",
  component: ClassicShotPage
});

const manageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/manage",
  component: HomeManagePage
});

const ledgerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ledger",
  component: LedgerPage
});

const todoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/todo",
  component: TodoPage
});

const summaryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/summaries",
  component: SummaryPage
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  manageRoute,
  newsRoute,
  topicsRoute,
  historyRoute,
  cinematicRoute,
  classicShotRoute,
  ledgerRoute,
  todoRoute,
  summaryRoute
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
