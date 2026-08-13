import { createRouter, createWebHashHistory } from "vue-router";

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
      path: "/accounts",
      name: "accounts",
      component: () => import("@/views/AccountsView.vue"),
    },
    {
      path: "/publish",
      name: "publish",
      component: () => import("@/views/PublishView.vue"),
    },
    {
      path: "/records",
      name: "records",
      component: () => import("@/views/RecordsView.vue"),
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: { name: "accounts" },
    },
  ],
});
