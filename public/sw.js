/* public/sw.js — Web Push + clique. Servido de hackiasc.com (escopo '/'). */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "HackIA SC";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag,
    data: { url: data.url || "#participante" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || "#participante";
  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const url =
        self.location.origin +
        "/" +
        (target.startsWith("#") ? target : "#" + target);
      for (const c of all) {
        if ("focus" in c) {
          c.postMessage({ type: "navigate", url: target });
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })(),
  );
});
