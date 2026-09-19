# 📱 Guía para Generar el APK de UniFlow con PWABuilder (Sin Play Store)

Esta guía te explica detalladamente cómo convertir tu proyecto **UniFlow** en un archivo **APK** instalable directamente en tu celular Android usando **PWABuilder**, y cómo asegurarte de que las **notificaciones con sonido y vibración lleguen como WhatsApp**.

---

## 1. Publicar tu PWA con HTTPS (Requisito de PWABuilder)

PWABuilder necesita una dirección web pública con HTTPS para empaquetar tu código en un APK. La forma más rápida y gratuita es **GitHub Pages**:

1. En tu repositorio de GitHub (`Compas`):
   - Ve a **Settings** (Ajustes del repositorio).
   - En el menú lateral izquierdo, haz clic en **Pages**.
   - En la sección **Build and deployment → Branch**, selecciona la rama `main` y la carpeta `/(root)`.
   - Haz clic en **Save**.
2. Espera 1 a 2 minutos. GitHub te dará un enlace con candado seguro (HTTPS), por ejemplo:
   ```
   https://alexander-manosalva-peralta.github.io/Compas/
   ```

*(También puedes usar Vercel o Netlify arrastrando la carpeta si prefieres).*

---

## 2. Generar el APK en PWABuilder

1. Abre tu navegador y entra a: **[https://www.pwabuilder.com](https://www.pwabuilder.com)**.
2. Pega la URL de tu app (la de GitHub Pages o tu hosting HTTPS) y presiona **Start**.
3. PWABuilder analizará la aplicación. Como ya configuramos el `manifest.json`, los íconos, las capturas de pantalla (`screenshots`) y el `service-worker.js`, verás una calificación alta en verde.
4. Haz clic en el botón superior derecho: **Package for Stores**.
5. En la sección **Android**, haz clic en el botón **Package**:
   - En el modal de opciones de Android:
     - **Package ID**: Puedes dejar el que sugiere o poner algo como `com.vexum.uniflow`.
     - **App Name**: `UniFlow`.
     - **Signing Key**: Si es para uso personal sin Play Store, selecciona **"None"** o **"Auto-generate"** (PWABuilder generará las claves por ti).
6. Haz clic en **Generate** o **Download Package**.
7. Se descargará un archivo `.zip`. Descomprímelo y dentro encontrarás tu archivo instalable:
   ```
   app-release.apk  (o app-debug.apk)
   ```

---

## 3. Instalar el APK en tu celular Android

1. Pasa el archivo `.apk` a tu celular (por WhatsApp, Telegram, Google Drive o conectando el cable USB).
2. Toca el archivo `.apk` en tu celular para instalarlo.
3. Si Android te muestra el aviso *"Por motivos de seguridad, tu teléfono no tiene permitido instalar apps desconocidas de esta fuente"*:
   - Toca en **Ajustes / Configuración**.
   - Marca la casilla **"Permitir desde esta fuente"**.
   - Vuelve atrás y pulsa **Instalar**.
4. ¡Listo! Verás el ícono de **UniFlow** en el menú de aplicaciones de tu celular como cualquier otra app nativa.

---

## 4. Configurar tu Celular para Notificaciones Estilo WhatsApp

Android tiene sistemas estrictos de ahorro de batería que pueden suspender las apps que no son de mensajería comercial. Para garantizar que los avisos suenen siempre a tiempo:

### A. Otorgar permisos dentro de la app
1. Abre **UniFlow** en tu celular.
2. Toca en el ícono de engranaje (⚙️ **Ajustes**).
3. En la sección **Notificaciones y avisos en celular**, pulsa **"Activar notificaciones"** y selecciona **Permitir** en el diálogo del sistema.
4. Pulsa el botón **"🔔 Probar notificación en mi celular"**.
   - En ese mismo instante verás la notificación deslizarse en la barra superior con el ícono de UniFlow, sonido y vibración.

### B. Desactivar el ahorro de batería de Android para UniFlow
1. En tu celular, entra a **Ajustes del Sistema → Aplicaciones → UniFlow**.
2. Entra a **Batería** (o *Uso de batería*).
3. Cambia la opción de *"Optimizado"* a **"Sin restricciones"** (o *"Permitir actividad en segundo plano"*).
   *Esto evita que Android congele UniFlow cuando apagas la pantalla.*
4. En **Notificaciones**, asegúrate de que esté marcado **"Permitir sonido y vibración"**.

---

## 5. Avisos 100% en Segundo Plano con Servidor Push (Opcional)

- **Modo Local (Sin servidor)**: La aplicación revisa tus entregas cada vez que la abres, la dejas en segundo plano o vuelves a la app, alertándote con sonido nativo y vibración mediante el Service Worker.
- **Modo Servidor Push (24/7 con app cerrada)**:
  - En la carpeta `push-server` incluimos el microservicio de notificaciones.
  - Puedes desplegarlo gratis en **Render.com** (ver instrucciones en `push-server/README.md`).
  - Luego en la app, vas a **Ajustes → Servidor Web Push** y colocas tu URL (ej. `https://uniflow-push.onrender.com`).
  - Con esto, los avisos llegarán vía Google FCM aunque el celular lleve horas apagado.
