import { onBeforeUnmount, watch, type WatchSource } from "vue";

const DIALOG_OPEN_CLASS = "rm-dialog-open";

let activeDialogCount = 0;

const syncDialogClass = (): void => {
  if (typeof document === "undefined") {
    return;
  }
  document.body.classList.toggle(DIALOG_OPEN_CLASS, activeDialogCount > 0);
};

export const useDialogLayer = (source: WatchSource<boolean>): void => {
  let isRegistered = false;

  const updateRegistration = (nextVisible: boolean): void => {
    if (typeof document === "undefined" || nextVisible === isRegistered) {
      return;
    }

    isRegistered = nextVisible;
    activeDialogCount += nextVisible ? 1 : -1;
    activeDialogCount = Math.max(0, activeDialogCount);
    syncDialogClass();
  };

  watch(source, updateRegistration, { immediate: true });

  onBeforeUnmount(() => {
    updateRegistration(false);
  });
};
