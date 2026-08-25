/** Home-screen (PWA) support + local notifications for new messages. */

export type NotifyPermission = "default" | "granted" | "denied" | "unsupported";

export function isStandalone() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function notifySupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function currentPermission(): NotifyPermission {
  if (!notifySupported()) return "unsupported";
  return Notification.permission as NotifyPermission;
}

let swReady: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  if (!swReady) {
    swReady = navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .catch(() => null);
  }
  return swReady;
}

/** Must be called from a user gesture (required by iOS Safari). */
export async function requestNotificationPermission(): Promise<NotifyPermission> {
  if (!notifySupported()) return "unsupported";
  await registerServiceWorker();
  try {
    return (await Notification.requestPermission()) as NotifyPermission;
  } catch {
    return Notification.permission as NotifyPermission;
  }
}

export async function showMessageNotification(opts: {
  title: string;
  body: string;
  tag?: string;
  force?: boolean;
}) {
  if (!notifySupported() || Notification.permission !== "granted") return;
  if (!opts.force && typeof document !== "undefined" && document.visibilityState === "visible")
    return;
  const options: NotificationOptions = {
    body: opts.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: opts.tag ?? "junglechat",
  };
  const reg = await registerServiceWorker();
  if (reg) {
    await reg.showNotification(opts.title, options);
    return;
  }
  try {
    new Notification(opts.title, options);
  } catch {
    /* ignore */
  }
}
