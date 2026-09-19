/* =========================================================
   UNIFLOW — notifications.js
   Notificaciones móviles nativas (Service Worker + Web Push)
   Totalmente compatible con Android, PWA y APK (PWABuilder).
   ========================================================= */
const Notifier = (() => {

  // Clave VAPID pública por defecto para Web Push
  const DEFAULT_VAPID_KEY = 'BFFcMvDg-jIN_LqDGhP1tMPJ0Q9u0OHAfoPMO_s5OaSzkj4XUpGFFkElb3nZ4Hj1O86fXL6EEDW01hhmUY02rmo';

  function supported() {
    return ('Notification' in window) || ('serviceWorker' in navigator);
  }

  function permission() {
    if ('Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  }

  /* Sonido suave de aviso mediante Web Audio API */
  function playChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // Nota Re5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // Nota La5

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {
      // Ignorar si el navegador bloquea audio antes de interacción
    }
  }

  /* Solicita permisos y registra el Service Worker */
  async function requestPermission() {
    if (!supported()) return 'unsupported';

    try {
      let res;
      if ('Notification' in window && Notification.requestPermission) {
        res = await Notification.requestPermission();
      } else if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: 'notifications' });
        res = status.state;
      } else {
        res = 'granted';
      }

      if (res === 'granted') {
        await registerServiceWorker();
        // Intentar registrar Web Push para avisos en segundo plano
        await subscribePush();
      }
      return res;
    } catch (e) {
      console.warn('[UniFlow] Error solicitando permiso:', e);
      return 'denied';
    }
  }

  /* Disparo garantizado en Android móvil usando Service Worker */
  async function fire(title, body, tag, extra = {}) {
    if (permission() !== 'granted') return;

    playChime();

    const options = {
      body: body,
      tag: tag || ('uniflow-' + Date.now()),
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      vibrate: [200, 100, 200, 100, 200],
      renotify: true,
      requireInteraction: true,
      data: {
        url: extra.url || './index.html',
        taskId: extra.taskId || null
      },
      actions: [
        { action: 'view', title: '👀 Ver pendiente' },
        { action: 'close', title: 'Descartar' }
      ]
    };

    // 1. Android móvil / APK: ES OBLIGATORIO usar ServiceWorkerRegistration.showNotification
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, options);
          return;
        }
      } catch (err) {
        console.warn('[UniFlow] Error usando SW showNotification, intentando respaldo:', err);
      }
    }

    // 2. Respaldo para navegadores de escritorio tradicionales
    try {
      if ('Notification' in window) {
        const n = new Notification(title, options);
        n.onclick = () => { window.focus(); n.close(); };
      }
    } catch (e) {
      console.warn('[UniFlow] Notification constructor no soportado en esta plataforma.');
    }
  }

  /* Disparar notificación de prueba inmediata para que el usuario valide su celular */
  async function testNotification() {
    const perm = await requestPermission();
    if (perm !== 'granted') {
      alert('Debes permitir las notificaciones en tu navegador o en los ajustes de la app en tu celular.');
      return false;
    }

    await fire(
      '🔔 ¡UniFlow funciona correctamente!',
      'Esta es una notificación real en tu celular. Recibirás avisos de tus cursos y exámenes aquí.',
      'uniflow-test-notification'
    );
    return true;
  }

  /* Revisa todas las tareas y decide si corresponde avisar según leadDays */
  function checkTasks() {
    if (!Store || !Store.tasks) return;
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
            `${course ? course.name + ' · ' : ''}${when.charAt(0).toUpperCase()+when.slice(1)}${task.dueTime ? ' a las ' + task.dueTime : ''}`,
            'uniflow-task-' + task.id + '-' + th,
            { taskId: task.id }
          );
          Store.markNotified(task.id, th);
          if (window.UI && UI.pushToast) {
            UI.pushToast(task.title, when);
          }
        }
      });
    });

    // Si hay un servidor Push configurado, sincronizar tareas para avisos con app cerrada
    syncWithPushServer();
  }

  /* Conversión de clave VAPID base64 a Uint8Array */
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /* Suscripción a Web Push (FCM / Google Services para Android) */
  async function subscribePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        const vapidKey = (Store.profile && Store.profile.vapidPublicKey) || DEFAULT_VAPID_KEY;
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey)
        });
      }

      // Guardar suscripción en Store
      if (sub && Store.setProfile) {
        Store.setProfile({ pushSubscription: sub.toJSON() });
      }

      return sub;
    } catch (err) {
      console.info('[UniFlow] PushManager suscripción opcional:', err.message);
      return null;
    }
  }

  /* Sincronización automática de pendientes con el servidor Push si está activo */
  async function syncWithPushServer() {
    const serverUrl = Store.profile && Store.profile.pushServerUrl;
    const sub = Store.profile && Store.profile.pushSubscription;

    if (!serverUrl || !sub) return;

    try {
      await fetch(`${serverUrl}/api/sync-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub,
          tasks: Store.tasks.filter(t => !t.done),
          leadDays: Store.profile.leadDays || 4
        })
      });
    } catch (e) {
      // Servidor local o remoto no alcanzable en este momento
    }
  }

  /* Registro del Service Worker */
  async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('service-worker.js', { scope: './' });
        console.log('[UniFlow] Service Worker registrado con éxito:', reg.scope);
        return reg;
      } catch (err) {
        console.warn('[UniFlow] Error registrando Service Worker:', err);
      }
    }
    return null;
  }

  function start() {
    registerServiceWorker().then(() => {
      if (permission() === 'granted') {
        subscribePush();
      }
    });

    checkTasks();

    // Revisa periódicamente mientras la app esté abierta
    setInterval(checkTasks, 15 * 60 * 1000);

    // Revisa de inmediato cuando el usuario vuelve a ver la app o desbloquea la pantalla
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkTasks();
      }
    });
  }

  return {
    supported,
    permission,
    requestPermission,
    fire,
    testNotification,
    checkTasks,
    subscribePush,
    syncWithPushServer,
    start
  };
})();

