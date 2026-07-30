import { createRouter, createWebHashHistory } from "vue-router";
import { getAccessToken } from "@/config";

/**
 * Renderer 路由使用 hash history，确保开发服务器和 Electron file 协议使用同一套地址。
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      redirect: { name: "accounts" },
    },
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginView.vue"),
    },
    {
      path: "/accounts",
      name: "accounts",
      component: () => import("@/views/AccountsView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/works",
      name: "works",
      component: () => import("@/views/WorksView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/publish",
      name: "publish",
      component: () => import("@/views/PublishView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/records",
      name: "records",
      component: () => import("@/views/RecordsView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: { name: "accounts" },
    },
  ],
});

router.beforeEach((to) => {
  const hasAccessToken = Boolean(getAccessToken());
  if (to.meta.requiresAuth && !hasAccessToken) {
    return { name: "login" };
  }
  if (to.name === "login" && hasAccessToken) {
    return { name: "accounts" };
  }
  return true;
});
