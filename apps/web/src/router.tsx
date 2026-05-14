import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter
} from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";

import { DashboardPage, DetailPlaceholderPage, HomeManagePage } from "./components/dashboard-page";
import { HistoryPage } from "./components/history-page";
import { LedgerPage } from "./components/ledger-page";
import { NewsPage } from "./components/news-page";
import { TopicPage } from "./components/topic-page";

const queryClient = new QueryClient();

function RootLayout() {
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
  component: () => (
    <DetailPlaceholderPage
      section="todo"
      title="待办详情"
      description="完整任务管理页会在后续版本扩展，这一期首页只展示待办预览和状态摘要。"
    />
  )
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  manageRoute,
  newsRoute,
  topicsRoute,
  historyRoute,
  ledgerRoute,
  todoRoute
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
