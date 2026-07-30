import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles.css";
import { logger } from "./src/utils/logger";
import { router } from "./router";

const vueApp = createApp(App);
vueApp.use(createPinia());
vueApp.use(router);

vueApp.config.errorHandler = (error, _instance, info) => {
  logger.error("renderer.vue.error 未捕获的组件异常", { error, info });
};

window.addEventListener("error", (event) => {
  logger.error("renderer.window.error 未捕获的页面异常", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  logger.error("renderer.promise.unhandled 未处理的 Promise 拒绝", event.reason);
});

logger.info("renderer.lifecycle 应用启动");
vueApp.mount("#app");
