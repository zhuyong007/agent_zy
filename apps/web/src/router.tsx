import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter
} from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";

import { DashboardPage, DetailPlaceholderPage } from "./components/dashboard-page";
import { NewsPage } from "./components/news-page";

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

const ledgerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ledger",
  component: () => (
    <DetailPlaceholderPage
      section="ledger"
      title="记账入口"
      description="记账详情页暂未设计，这一期只在顶部命令路由条中保留入口，避免首页主体被账本模块抢占。"
    />
  )
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

const routeTree = rootRoute.addChildren([indexRoute, newsRoute, ledgerRoute, todoRoute]);

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
