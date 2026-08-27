/* =========================================================
   COMPÁS — notifications.js
   Notificaciones locales (Web Notifications API) + Service Worker
   para permitir instalar la app y avisar cuando un pendiente se acerca.

   IMPORTANTE (léelo también en el README):
   Un navegador solo puede disparar notificaciones "en el momento" mientras
   la pestaña/PWA está abierta o corriendo en segundo plano según el sistema
   operativo. Para avisos garantizados con la app totalmente cerrada se
   necesitaría un servidor de push (Web Push) — está fuera del alcance de
   una app 100% de archivos estáticos, pero se deja el punto de extensión
   marcado más abajo.
========================================================= */
const Notifier = (() => {

  function supported() {
    return 'Notification' in window;
  }

  function permission() {
    return supported() ? Notification.permission : 'unsupported';
  }

  async function requestPermission() {
    if (!supported()) return 'unsupported';
    try {
      return await Notification.requestPermission();
    } catch (e) {
      return 'denied';
    }
  }

  function fire(title, body, tag) {
    if (supported() && Notification.permission === 'granted') {
      try {
        const n = new Notification(title, {
          body,
          tag,
          icon: 'icons/icon-192.png',
          badge: 'icons/icon-192.png'
        });
        n.onclick = () => { window.focus(); n.close(); };
      } catch (e) { /* algunos navegadores móviles requieren SW; se ignora si falla */ }
    }
  }

  // Revisa todas las tareas y decide si corresponde avisar, según leadDays.
  // Umbrales: leadDays, 1 día antes y "hoy". Evita repetir usando Store.wasNotified.
  function checkTasks() {
    const lead = parseInt(Store.profile.leadDays, 10) || 4;
    const thresholds = Array.from(new Set([lead, 1, 0])).sort((a,b)=>b-a);

    Store.tasks.filter(t => !t.done).forEach(task => {
      const days = Smart.daysUntil(task.dueDate);
      thresholds.forEach(th => {
        if (days === th && !Store.wasNotified(task.id, th)) {
          const course = Store.getCourse(task.courseId);
          const when = th === 0 ? 'vence hoy' : (th === 1 ? 'vence mañana' : `vence en ${th} días`);
          fire(
            '📌 ' + task.title,
            `${course ? course.name + ' · ' : ''}${when.charAt(0).toUpperCase()+when.slice(1)}`,
            'compas-task-' + task.id + '-' + th
          );
          Store.markNotified(task.id, th);
          UI && UI.pushToast && UI.pushToast(task.title, when);
        }
      });
    });
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
  }

  function start() {
    registerServiceWorker();
    checkTasks();
    // Revisa cada 30 min mientras la app está abierta.
    setInterval(checkTasks, 30 * 60 * 1000);
    // También revisa cada vez que la pestaña vuelve a estar visible.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkTasks();
    });
  }

  return { supported, permission, requestPermission, fire, checkTasks, start };
})();
