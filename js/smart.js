/* =========================================================
   UNIFLOW — smart.js
   El "cerebro" del asistente: sin backend ni API keys.
   - Parsea fechas en lenguaje natural (español) para el campo rápido.
   - Calcula un puntaje de urgencia por tarea.
   - Genera frases de resumen ("insights") para el dashboard.
========================================================= */
const Smart = (() => {

  const WEEKDAYS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

  function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }

  function fmtISO(d) {
    const x = startOfDay(d);
    return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0');
  }

  // Intenta extraer una fecha de un texto en español coloquial.
  // Soporta: "hoy", "mañana", "pasado mañana", "en 3 días", "el viernes",
  // "el próximo miércoles", "17 de octubre", "17/10".
  function parseDate(text, base = new Date()) {
    const t = text.toLowerCase();
    const today = startOfDay(base);

    if (/\bhoy\b/.test(t)) return today;
    if (/\bpasado\s+ma[ñn]ana\b/.test(t)) { const d = new Date(today); d.setDate(d.getDate()+2); return d; }
    if (/\bma[ñn]ana\b/.test(t)) { const d = new Date(today); d.setDate(d.getDate()+1); return d; }

    let m = t.match(/\ben\s+(\d+)\s+d[ií]as?\b/);
    if (m) { const d = new Date(today); d.setDate(d.getDate()+parseInt(m[1],10)); return d; }

    m = t.match(/\ben\s+(\d+)\s+semanas?\b/);
    if (m) { const d = new Date(today); d.setDate(d.getDate()+7*parseInt(m[1],10)); return d; }

    // "17 de octubre" o "17 de octubre de 2026"
    m = t.match(/\b(\d{1,2})\s+de\s+([a-záéíóúñ]+)(?:\s+de\s+(\d{4}))?\b/);
    if (m) {
      const day = parseInt(m[1],10);
      const monthIdx = MONTHS.findIndex(mo => mo === m[2] || mo.startsWith(m[2]));
      if (monthIdx >= 0) {
        const year = m[3] ? parseInt(m[3],10) : today.getFullYear();
        let d = new Date(year, monthIdx, day);
        if (d < today && !m[3]) d.setFullYear(d.getFullYear()+1);
        return startOfDay(d);
      }
    }

    // dd/mm o dd/mm/yyyy
    m = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    if (m) {
      const day = parseInt(m[1],10), month = parseInt(m[2],10)-1;
      let year = m[3] ? parseInt(m[3],10) : today.getFullYear();
      if (year < 100) year += 2000;
      let d = new Date(year, month, day);
      if (d < today && !m[3]) d.setFullYear(d.getFullYear()+1);
      return startOfDay(d);
    }

    // "el/este/próximo <día de la semana>"
    for (let i = 0; i < WEEKDAYS.length; i++) {
      const re = new RegExp('\\b' + WEEKDAYS[i] + '\\b');
      if (re.test(t)) {
        const d = new Date(today);
        const todayDow = today.getDay();
        let diff = (i - todayDow + 7) % 7;
        if (diff === 0) diff = 7; // si hoy es ese día, se asume la próxima semana
        d.setDate(d.getDate() + diff);
        return startOfDay(d);
      }
    }
    return null;
  }

  // Intenta emparejar el curso mencionado en el texto con la lista de cursos.
  function matchCourse(text, courses) {
    const t = text.toLowerCase();
    let best = null, bestScore = 0;
    courses.forEach(c => {
      const name = c.name.toLowerCase();
      if (t.includes(name)) { best = c; bestScore = 99; return; }
      const words = name.split(/\s+/).filter(w => w.length > 3);
      const score = words.filter(w => t.includes(w)).length;
      if (score > bestScore) { bestScore = score; best = c; }
    });
    return bestScore > 0 ? best : null;
  }

  // Puntaje de urgencia: entre 0 (lejano) y 100 (vence hoy o vencido)
  function urgency(task) {
    if (task.done) return -1;
    const due = startOfDay(new Date(task.dueDate + 'T00:00:00'));
    const today = startOfDay(new Date());
    const days = Math.round((due - today) / 86400000);
    if (days < 0) return 100;
    if (days === 0) return 98;
    if (days === 1) return 90;
    const typeWeight = { examen: 12, proyecto: 10, exposicion: 9, tarea: 5, lectura: 3 }[task.type] || 5;
    return Math.max(0, 80 - days * 6 + typeWeight);
  }

  function daysUntil(dateStr) {
    const due = startOfDay(new Date(dateStr + 'T00:00:00'));
    const today = startOfDay(new Date());
    return Math.round((due - today) / 86400000);
  }

  function dueLabel(dateStr, timeStr) {
    const days = daysUntil(dateStr);
    let base;
    if (days < 0) base = `Venció hace ${Math.abs(days)} día${Math.abs(days)===1?'':'s'}`;
    else if (days === 0) base = 'Vence hoy';
    else if (days === 1) base = 'Vence mañana';
    else if (days <= 6) base = `Vence en ${days} días`;
    else base = new Date(dateStr + 'T00:00:00').toLocaleDateString('es-PE', { day:'numeric', month:'short' });
    if (timeStr) base += ` · ${timeStr}`;
    return base;
  }

  // Genera frases de asistente para el panel "Asistente" del dashboard.
  function buildInsights(courses, tasks, leadDays) {
    const insights = [];
    const pending = tasks.filter(t => !t.done);
    const today = startOfDay(new Date());
    const todayDow = today.getDay(); // 0=domingo

    const overdue = pending.filter(t => daysUntil(t.dueDate) < 0);
    if (overdue.length) {
      insights.push(`Tienes <b>${overdue.length}</b> pendiente${overdue.length>1?'s':''} vencido${overdue.length>1?'s':''}. Revísalo${overdue.length>1?'s':''} primero.`);
    }

    const dueSoon = pending.filter(t => {
      const d = daysUntil(t.dueDate);
      return d >= 0 && d <= leadDays;
    }).sort((a,b) => daysUntil(a.dueDate) - daysUntil(b.dueDate));

    if (dueSoon.length) {
      const t = dueSoon[0];
      const c = courses.find(c => c.id === t.courseId);
      insights.push(`Lo más urgente: <b>${escapeHTML(t.title)}</b>${c ? ' de ' + escapeHTML(c.name) : ''}, ${dueLabel(t.dueDate).toLowerCase()}.`);
    } else if (!overdue.length) {
      insights.push('No tienes nada urgente en los próximos días. Buen momento para adelantar lecturas.');
    }

    // Clases de mañana
    const tomorrowDow = (todayDow % 7) + 1 <= 6 ? ((todayDow + 1) === 0 ? 1 : (todayDow + 1)) : null;
    const tmw = new Date(today); tmw.setDate(tmw.getDate()+1);
    const tmwDow = tmw.getDay();
    if (tmwDow >= 1 && tmwDow <= 6) {
      const count = courses.reduce((acc,c) => acc + c.blocks.filter(b => b.day === tmwDow).length, 0);
      if (count > 0) insights.push(`Mañana (${Store.DAY_NAMES[tmwDow]}) tienes <b>${count}</b> clase${count>1?'s':''} programada${count>1?'s':''}.`);
    } else {
      insights.push('Mañana es domingo: buen día para estudiar sin clases.');
    }

    // Balance de carga por curso (curso con más pendientes activos)
    const byCourse = {};
    pending.forEach(t => { byCourse[t.courseId] = (byCourse[t.courseId]||0)+1; });
    const top = Object.entries(byCourse).sort((a,b)=>b[1]-a[1])[0];
    if (top && top[1] >= 2) {
      const c = courses.find(c => c.id === top[0]);
      if (c) insights.push(`<b>${escapeHTML(c.name)}</b> concentra ${top[1]} pendientes activos. Podría ser tu prioridad esta semana.`);
    }

    if (!courses.length) {
      insights.length = 0;
      insights.push('Aún no registras cursos. Ve a "Horario" y agrega el primero para activar el asistente.');
    }

    return insights.slice(0, 4);
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  return { parseDate, matchCourse, urgency, daysUntil, dueLabel, buildInsights, fmtISO, escapeHTML };
})();
