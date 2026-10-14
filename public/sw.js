self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() }; }
  const title = payload.title || "Próximo partido";
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || "Tienes una designación próxima.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "refflow-match-reminder",
    renotify: false,
    data: { url: payload.url || "/?view=calendario" },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/?view=calendario", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) { existing.navigate(target); return existing.focus(); }
    return self.clients.openWindow(target);
  }));
});
