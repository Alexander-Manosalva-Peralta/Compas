/* =========================================================
   UNIFLOW — notifications.js
   Motor de notificaciones de alta precisión para Android y PWA.
   Soporta alertas por días de anticipación, alertas 10 minutos antes,
   avisos al vencimiento exacto y Web Push en segundo plano.
   ========================================================= */
const Notifier = (() => {

  const DEFAULT_VAPID_KEY = 'BFFcMvDg-jIN_LqDGhP1tMPJ0Q9u0OHAfoPMO_s5OaSzkj4XUpGFFkElb3nZ4Hj1O86fXL6EEDW01hhmUY02rmo';

  // Almacén de temporizadores exactos en memoria
  let activeTimeouts = {};

  function supported() {
    return ('Notification' in window) || ('serviceWorker' in navigator);
  }

  function permission() {
    if ('Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  }

  /* Sonido suave estilo Apple (Web Audio API) */
  function playChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

      gain.gain.setValueAtTime(0.28, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.38);
    } catch (e) {
      // Ignorar si el audio está bloqueado antes de la primera interacción
    }
  }

  /* Solicitar permisos y registrar SW / Push */
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
        await subscribePush();
      }
      return res;
    } catch (e) {
      console.warn('[UniFlow] Error solicitando permiso:', e);
      return 'denied';
    }
  }

  /* Disparo garantizado en Android (Service Worker showNotification obligatorio) */
  async function fire(title, body, tag, extra = {}) {
    if (permission() !== 'granted') return;

    playChime();

    // Haptics en móvil si está disponible
    if ('vibrate' in navigator) {
      try { navigator.vibrate([180, 80, 180]); } catch(e) {}
    }

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
        { action: 'view', title: '👀 Ver en UniFlow' },
        { action: 'close', title: 'Entendido' }
      ]
    };

    // 1. Prioridad: Service Worker (Obligatorio en Android Chrome / TWA / APK)
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, options);
          return;
        }
      } catch (err) {
        console.warn('[UniFlow] Error en SW showNotification:', err);
      }
    }

    // 2. Respaldo para escritorio
    try {
      if ('Notification' in window) {
        const n = new Notification(title, options);
        n.onclick = () => { window.focus(); n.close(); };
      }
    } catch (e) {}
  }

  /* Notificación de prueba inmediata */
  async function testNotification() {
    const perm = await requestPermission();
    if (perm !== 'granted') {
      alert('Debes permitir las notificaciones en tu celular para recibir avisos.');
      return false;
    }

    await fire(
      '🔔 ¡UniFlow funciona correctamente!',
      'Esta es una notificación real en tu celular. Recibirás avisos de tus tareas y exámenes con sonido y vibración.',
      'uniflow-test-' + Date.now()
    );
    return true;
  }

  /* Programa temporizadores exactos en memoria para tareas próximas en las siguientes 24 horas */
  function scheduleExactTimers() {
    // Limpiar temporizadores anteriores
    Object.values(activeTimeouts).forEach(t => clearTimeout(t));
    activeTimeouts = {};

    if (!Store || !Store.tasks) return;
    const now = Date.now();

    Store.tasks.filter(t => !t.done).forEach(task => {
      const timeStr = task.dueTime ? task.dueTime : '23:59';
      const taskDate = new Date(`${task.dueDate}T${timeStr}:00`);
      const targetTime = taskDate.getTime();

      if (isNaN(targetTime)) return;

      // 1. Temporizador a los 10 minutos antes (exactos)
      const tenMinBefore = targetTime - (10 * 60 * 1000);
      const msUntilTenMin = tenMinBefore - now;

      if (msUntilTenMin > 0 && msUntilTenMin <= (24 * 60 * 60 * 1000)) {
        if (!Store.wasNotified(task.id, '10m')) {
          const timeoutId = setTimeout(() => {
            const course = Store.getCourse(task.courseId);
            fire(
              '⏰ En 10 minutos: ' + task.title,
              `${course ? course.name + ' · ' : ''}Vence a las ${task.dueTime || 'pronto'}`,
              'uniflow-10m-' + task.id,
              { taskId: task.id }
            );
            Store.markNotified(task.id, '10m');
            if (window.UI && UI.pushToast) UI.pushToast(task.title, 'Vence en 10 minutos');
          }, msUntilTenMin);
          activeTimeouts[task.id + '_10m'] = timeoutId;
        }
      }

      // 2. Temporizador al momento exacto de vencimiento
      const msUntilDue = targetTime - now;
      if (msUntilDue > 0 && msUntilDue <= (24 * 60 * 60 * 1000)) {
        if (!Store.wasNotified(task.id, 'due')) {
          const timeoutId = setTimeout(() => {
            const course = Store.getCourse(task.courseId);
            fire(
              '📌 ¡Vence ahora!: ' + task.title,
              `${course ? course.name + ' · ' : ''}Es hora de entregar tu pendiente (${task.dueTime || 'hoy'})`,
              'uniflow-due-' + task.id,
              { taskId: task.id }
            );
            Store.markNotified(task.id, 'due');
            if (window.UI && UI.pushToast) UI.pushToast(task.title, 'Vence ahora');
          }, msUntilDue);
          activeTimeouts[task.id + '_due'] = timeoutId;
        }
      }
    });
  }

  /* Revisa tareas por fecha (días de anticipación) y por minutos exactos */
  function checkTasks() {
    if (!Store || !Store.tasks) return;
    const now = new Date();
    const lead = parseInt(Store.profile.leadDays, 10) || 4;
    const thresholds = Array.from(new Set([lead, 1, 0])).sort((a,b)=>b-a);

    Store.tasks.filter(t => !t.done).forEach(task => {
      // 1. Revisión de días de anticipación
      const days = Smart.daysUntil(task.dueDate);
      thresholds.forEach(th => {
        // Solo alertar el umbral de "hoy" si no tiene hora específica o si ya es temprano
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

      // 2. Revisión al minuto (para tareas de hoy con hora configurada)
      if (task.dueDate && task.dueTime) {
        const taskDateTime = new Date(`${task.dueDate}T${task.dueTime}:00`);
        const diffMs = taskDateTime.getTime() - now.getTime();
        const diffMins = Math.round(diffMs / 60000);

        // Alerta de 10 minutos antes (ventana de 1 a 10 minutos)
        if (diffMins <= 10 && diffMins > 0 && !Store.wasNotified(task.id, '10m')) {
          const course = Store.getCourse(task.courseId);
          fire(
            '⏰ En 10 minutos: ' + task.title,
            `${course ? course.name + ' · ' : ''}Vence a las ${task.dueTime}`,
            'uniflow-10m-' + task.id,
            { taskId: task.id }
          );
          Store.markNotified(task.id, '10m');
          if (window.UI && UI.pushToast) UI.pushToast(task.title, 'Vence en 10 minutos');
        }

        // Alerta al momento exacto de entrega (ventana entre -3 y 0 minutos)
        if (diffMins <= 0 && diffMins >= -3 && !Store.wasNotified(task.id, 'due')) {
          const course = Store.getCourse(task.courseId);
          fire(
            '📌 ¡Vence ahora!: ' + task.title,
            `${course ? course.name + ' · ' : ''}El plazo de entrega vence ahora (${task.dueTime})`,
            'uniflow-due-' + task.id,
            { taskId: task.id }
          );
          Store.markNotified(task.id, 'due');
          if (window.UI && UI.pushToast) UI.pushToast(task.title, 'Vence ahora');
        }
      }
    });

    // Programar temporizadores de precisión milimétrica
    scheduleExactTimers();

    // Sincronizar con servidor Push si está activo
    syncWithPushServer();
  }

  /* Conversión VAPID base64 a Uint8Array */
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

  /* Suscripción a Web Push */
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

      if (sub && Store.setProfile) {
        Store.setProfile({ pushSubscription: sub.toJSON() });
      }

      return sub;
    } catch (err) {
      console.info('[UniFlow] PushManager suscripción:', err.message);
      return null;
    }
  }

  /* Sincronización con Servidor Push (enviando dueDate y dueTime) */
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
          tasks: Store.tasks.filter(t => !t.done).map(t => ({
            id: t.id,
            title: t.title,
            dueDate: t.dueDate,
            dueTime: t.dueTime || '23:59',
            courseId: t.courseId
          })),
          leadDays: Store.profile.leadDays || 4
        })
      });
    } catch (e) {}
  }

  /* Registro del Service Worker */
  async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('service-worker.js', { scope: './' });
        console.log('[UniFlow] Service Worker registrado:', reg.scope);
        return reg;
      } catch (err) {
        console.warn('[UniFlow] Error registrando SW:', err);
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

    // Revisión frecuente: cada 15 segundos mientras la app está activa
    setInterval(checkTasks, 15 * 1000);

    // Revisión inmediata al desbloquear pantalla o volver a la app
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
