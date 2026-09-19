# 🚀 Compás — Servidor API de Notificaciones Web Push

Este servidor permite que las notificaciones de tus pendientes y exámenes lleguen a tu celular **estilo WhatsApp** incluso cuando la app o el APK están completamente cerrados y la pantalla está bloqueada.

---

## ¿Cómo funciona?

1. Cuando abres Compás y activas las notificaciones, tu celular genera una suscripción cifrada con **Google FCM (Firebase Cloud Messaging)**.
2. Compás envía esta suscripción y tus fechas de entrega al servidor.
3. El servidor tiene un temporizador inteligente que revisa tus entregas y, al llegar la fecha (según tu configuración: 4 días antes, 1 día antes o el mismo día), contacta a los servidores de Google para **despertar tu celular**, mostrando la notificación con vibración y sonido en tu barra de estado.

---

## Instalación y ejecución local

1. Entra a la carpeta \push-server\:
   \\ash
   cd push-server
   \2. Instala las dependencias:
   \\ash
   npm install
   \3. Inicia el servidor:
   \\ash
   npm start
   \   El servidor iniciará en \http://localhost:3000\.

---

## Despliegue gratuito en la nube (para que funcione 24/7)

Para que tu celular reciba avisos a cualquier hora sin tener tu laptop encendida, puedes subir este servidor a cualquier plataforma gratuita con soporte de Node.js:

- **Render.com** (Gratis):
  1. Crea una cuenta en [Render.com](https://render.com).
  2. Crea un **New Web Service** y conecta este repositorio.
  3. En *Root Directory* coloca \push-server\.
  4. En *Build Command* coloca pm install\.
  5. En *Start Command* coloca ode server.js\.
  6. Copia la URL que te dé Render (ejemplo: \https://compas-push.onrender.com\).
  7. Abre Compás en tu celular o PC → **Ajustes** → pega esa URL en **Servidor Web Push**. ¡Listo!

- **Railway.app** o **Koyeb**:
  El procedimiento es idéntico: selecciona la carpeta \push-server\ y despliega con un clic.
