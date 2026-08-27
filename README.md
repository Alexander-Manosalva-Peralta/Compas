# Compás 🧭 — tu semestre, ordenado

**Un producto de Vexum.**

Gestor académico para tus cursos universitarios: horario semanal (lunes a sábado),
pendientes por curso con avisos anticipados, y un asistente local que te resume
lo importante cada día. Diseño estilo "vidrio esmerilado" (glassmorphism),
funciona en laptop y celular, y se puede **instalar como app** (PWA).

## Abrir el proyecto en PyCharm

1. Abre PyCharm → **File → Open…** → selecciona esta carpeta (`compas`).
2. Es un proyecto 100% HTML/CSS/JS (sin build ni dependencias de Python), así
   que no necesitas crear un intérprete de Python para verlo funcionar.
3. Para probarlo con recarga en vivo, instala el plugin **PyCharm: "Live templates"
   no hace falta** — simplemente usa cualquiera de estas opciones:

   **Opción A — Servidor embebido de PyCharm**
   Click derecho sobre `index.html` → **Open in Browser** (ícono de Chrome/Firefox
   en la esquina superior derecha del editor). PyCharm levanta un servidor local
   automáticamente.

   **Opción B — Servidor de Python (siempre funciona)**
   Abre una terminal en PyCharm (`Alt+F12`) y ejecuta:
   ```bash
   python -m http.server 8000
   ```
   Luego abre `http://localhost:8000` en tu navegador.

   > ⚠️ No abras `index.html` con doble clic (protocolo `file://`): el Service
   > Worker y las notificaciones necesitan que el sitio se sirva por `http://` o `https://`.

## Instalarlo como app (laptop y celular)

- **Laptop (Chrome/Edge):** abre el sitio → ícono de instalar en la barra de
  direcciones (o menú ⋮ → "Instalar Compás"). Queda como app de escritorio.
- **Celular Android (Chrome):** menú ⋮ → "Añadir a pantalla de inicio" / "Instalar app".
- **iPhone (Safari):** botón compartir → "Añadir a pantalla de inicio".

Para instalarlo desde cualquier lugar (no solo `localhost`), sube la carpeta a
un hosting con HTTPS: **GitHub Pages, Netlify o Vercel** funcionan gratis y en
minutos, arrastrando esta misma carpeta.

## Cómo usarlo

1. **Horario** → "Nuevo curso": nombre, profesor, color, y uno o más bloques
   de horario (día + hora inicio/fin). Se dibuja automáticamente en la grilla.
2. **Pendientes** → "Nuevo pendiente": puedes escribir en lenguaje natural en el
   primer campo, por ejemplo:
   - *"Examen de Cálculo el próximo miércoles"*
   - *"Informe de laboratorio en 3 días"*
   - *"Exposición de Física el 17 de octubre"*

   Compás intenta detectar automáticamente el **curso** y la **fecha límite**;
   siempre puedes corregirlos manualmente antes de guardar.
3. **Resumen (dashboard)** te muestra: clases del día, lo más urgente por
   vencer, y un panel de "Asistente" con frases generadas según tu carga real
   (vencidos, lo más próximo, el curso con más pendientes, etc.).
4. **Ajustes** (ícono de engranaje abajo del riel lateral): define con cuántos
   días de anticipación quieres que te avise (por defecto, 4 días) y activa
   las notificaciones del navegador.

## Notificaciones

Compás usa la **Web Notifications API**: revisa tus pendientes al abrir la
app, cada 30 minutos mientras sigue abierta, y cada vez que vuelves a la
pestaña. Te avisa en 3 momentos por tarea: al llegar tu umbral configurado
(por defecto 4 días antes), 1 día antes, y el mismo día.

> **Límite técnico honesto:** ningún sitio 100% estático (sin servidor propio)
> puede garantizar notificaciones con el celular bloqueado y la app
> completamente cerrada — eso requiere un backend de *Web Push* con claves
> VAPID. Si más adelante quieres ese nivel de notificación "al estilo
> WhatsApp", el punto de extensión está marcado en `js/notifications.js`
> (función `fire`) y `service-worker.js` (evento `notificationclick`).

## Estructura del proyecto

```
compas/
├── index.html            → estructura de las 4 vistas + modales
├── css/styles.css         → sistema de diseño (glassmorphism, tokens, responsive)
├── js/store.js            → capa de datos (localStorage)
├── js/smart.js            → "cerebro": parseo de fechas en español, urgencia, insights
├── js/notifications.js    → notificaciones locales + registro del service worker
├── js/app.js               → controlador de vistas, render y eventos
├── manifest.json           → configuración PWA (nombre, ícono, colores)
├── service-worker.js       → caché para instalación y uso sin conexión
└── icons/                  → íconos de la app (192, 512, maskable)
```

Todos tus datos (cursos, pendientes, ajustes) se guardan **solo en tu
navegador** (`localStorage`), no se envían a ningún servidor. Puedes exportarlos
en cualquier momento desde Ajustes → "Exportar datos (.json)".

## Ideas para seguir creciendo el proyecto

- Vista de calendario mensual además de la semanal.
- Arrastrar y soltar tareas para replanificarlas.
- Sincronización entre dispositivos (requeriría una base de datos, p. ej.
  Firebase o Supabase).
- Un asistente con IA real (Anthropic API) que redacte planes de estudio;
  para eso necesitarías un pequeño backend que guarde tu API key de forma
  segura (nunca debe ir expuesta en el código del navegador).

## Legal y créditos

- **Desarrollado por:** Vexum.
- **© 2026 Vexum. Todos los derechos reservados.** "Compás" y su diseño de
  interfaz son marcas de Vexum. Este software se distribuye tal cual, sin
  garantía de ningún tipo, como herramienta de apoyo académico.
- **Privacidad:** todos los datos (cursos, pendientes, ajustes) se guardan
  únicamente en el `localStorage` del navegador del usuario. Vexum no
  recolecta ni transmite esta información a ningún servidor. Ver el detalle
  completo dentro de la app en **Ajustes → Legal y créditos**.
- **Contacto:** contacto@vexum.app

---
Un producto de **Vexum** — hecho con tipografía cuidada y un poco de lógica
"inteligente", sin frameworks, para que puedas leer y modificar cada línea. 🧭
