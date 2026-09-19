/* =========================================================
   COMPÁS — Push Notification Server
   Microservicio para programar y enviar notificaciones Web Push
   al celular (Android / APK / PWA) estilo WhatsApp con la app cerrada.
   ========================================================= */

const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Claves VAPID (Par público/privado emparejado con js/notifications.js)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BFFcMvDg-jIN_LqDGhP1tMPJ0Q9u0OHAfoPMO_s5OaSzkj4XUpGFFkElb3nZ4Hj1O86fXL6EEDW01hhmUY02rmo';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'iQX3DpvUe0j27574pqTa8JRDam53Xzxc8FQvcjkSgpQ';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:contacto@vexum.app';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const DATA_FILE = path.join(__dirname, 'subscriptions.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error leyendo suscripciones:', e);
  }
  return { subscriptions: [], tasks: [] };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error guardando suscripciones:', e);
  }
}

let db = loadData();

// 1. Estado del servidor
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    appName: 'Compás Push API',
    vapidPublicKey: VAPID_PUBLIC_KEY,
    totalSubscriptions: db.subscriptions.length,
    totalActiveTasks: db.tasks.length
  });
});

// 2. Registro / actualización de suscripción del dispositivo
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Suscripción inválida' });
  }

  const existingIdx = db.subscriptions.findIndex(s => s.endpoint === subscription.endpoint);
  if (existingIdx >= 0) {
    db.subscriptions[existingIdx] = subscription;
  } else {
    db.subscriptions.push(subscription);
  }
  saveData(db);

  res.status(201).json({ success: true, message: 'Dispositivo registrado para recibir notificaciones push.' });
});

// 3. Sincronización de pendientes del usuario
app.post('/api/sync-tasks', (req, res) => {
  const { subscription, tasks, leadDays } = req.body;

  if (subscription && subscription.endpoint) {
    const existingIdx = db.subscriptions.findIndex(s => s.endpoint === subscription.endpoint);
    if (existingIdx >= 0) {
      db.subscriptions[existingIdx] = subscription;
    } else {
      db.subscriptions.push(subscription);
    }
  }

  if (Array.isArray(tasks)) {
    const endpoint = subscription ? subscription.endpoint : null;
    db.tasks = db.tasks.filter(t => t.endpoint !== endpoint);
    tasks.forEach(t => {
      db.tasks.push({
        ...t,
        endpoint,
        leadDays: leadDays || 4,
        notifiedThresholds: t.notifiedThresholds || []
      });
    });
    saveData(db);
  }

  res.json({ success: true, count: db.tasks.length });
});

// 4. Enviar notificación de prueba inmediata a un dispositivo
app.post('/api/send-test', async (req, res) => {
  const subscription = req.body.subscription || db.subscriptions[0];
  if (!subscription) {
    return res.status(400).json({ error: 'No hay ninguna suscripción activa para enviar la prueba.' });
  }

  const payload = JSON.stringify({
    title: '🔔 Compás — Notificación Push Real',
    body: '¡Esta notificación llegó directamente desde el servidor Push a tu celular!',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    url: './index.html'
  });

  try {
    await webpush.sendNotification(subscription, payload);
    res.json({ success: true, message: 'Notificación Push enviada con éxito.' });
  } catch (err) {
    console.error('Error enviando push:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Verificador periódico automático (Cron interno para avisar a tiempo)
function checkDeadlinesAndNotify() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  db.tasks.forEach(async (task) => {
    if (task.done || !task.endpoint) return;

    const sub = db.subscriptions.find(s => s.endpoint === task.endpoint);
    if (!sub) return;

    const due = new Date(task.dueDate + 'T00:00:00');
    const diffTime = due.getTime() - new Date(todayStr + 'T00:00:00').getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    const thresholds = [task.leadDays || 4, 1, 0];
    for (const th of thresholds) {
      if (diffDays === th && !task.notifiedThresholds.includes(th)) {
        const when = th === 0 ? 'vence hoy' : (th === 1 ? 'vence mañana' : 'vence en ' + th + ' días');
        const payload = JSON.stringify({
          title: '📌 ' + task.title,
          body: 'Aviso académico: ' + when.toUpperCase() + (task.dueTime ? ' a las ' + task.dueTime : ''),
          icon: 'icons/icon-192.png',
          badge: 'icons/icon-192.png',
          vibrate: [200, 100, 200, 100, 200],
          tag: 'compas-push-' + task.id + '-' + th,
          url: './index.html',
          taskId: task.id
        });

        try {
          await webpush.sendNotification(sub, payload);
          task.notifiedThresholds.push(th);
          saveData(db);
          console.log('[PUSH ENVIADO]', task.title, when);
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            db.subscriptions = db.subscriptions.filter(s => s.endpoint !== task.endpoint);
            saveData(db);
          }
        }
      }
    }
  });
}

setInterval(checkDeadlinesAndNotify, 10 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('====================================================');
  console.log('🚀 Compás Push Server escuchando en puerto:', PORT);
  console.log('📡 Clave VAPID Pública:', VAPID_PUBLIC_KEY);
  console.log('====================================================');
});
