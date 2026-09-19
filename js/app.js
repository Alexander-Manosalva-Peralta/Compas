/* =========================================================
   UNIFLOW — app.js
   Controlador principal: vistas, render y eventos de UI.
========================================================= */
const UI = (() => {

  const COLORS = ['#3B82F6','#10B981','#6366F1','#F59E0B','#06B6D4','#8B5CF6','#EC4899','#64748B'];
  const GRID_START_H = 7;   // 7:00
  const GRID_END_H = 22;    // 22:00
  const ROW_PX = 56;

  let blockEditorRows = []; // filas temporales del formulario de curso
  let scheduleDay = null;   // día seleccionado en la agenda móvil (1..6)

  /* ---------------- utilidades ---------------- */
  function $(sel, ctx=document){ return ctx.querySelector(sel); }
  function $all(sel, ctx=document){ return Array.from(ctx.querySelectorAll(sel)); }
  function todayDow(){ return new Date().getDay(); } // 0=domingo..6=sábado
  function pad(n){ return String(n).padStart(2,'0'); }
  function timeToMin(t){ const [h,m] = t.split(':').map(Number); return h*60+m; }

  /* ---------------- navegación ---------------- */
  function switchView(name){
    $all('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
    $all('.rail-link').forEach(b => {
      const active = b.dataset.view === name;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', active);
    });
    $all('.tab-link').forEach(b => b.classList.toggle('is-active', b.dataset.view === name));
    if (name === 'dashboard') renderDashboard();
    if (name === 'horario') renderSchedule();
    if (name === 'cursos') renderCourses();
    if (name === 'tareas') renderTaskFull();
  }

  function initNav(){
    $all('.rail-link, .tab-link').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
    $all('[data-view-link]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.viewLink)));
  }

  /* ---------------- toasts ---------------- */
  function pushToast(title, sub){
    const stack = $('#toastStack');
    const el = document.createElement('div');
    el.className = 'toast glass';
    el.innerHTML = `<span style="font-size:18px">⏰</span><div><b>${Smart.escapeHTML(title)}</b><p>${Smart.escapeHTML(sub)}</p></div>`;
    stack.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform='translateX(20px)'; setTimeout(()=>el.remove(), 300); }, 5500);
  }

  /* ---------------- dashboard ---------------- */
  function greetingWord(){
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }

  function renderWeekDial(svg){
    const size = 220, cx = size/2, cy = size/2, r = 84;
    const dow = todayDow(); // 0..6
    const order = [1,2,3,4,5,6,0]; // lunes..sábado, domingo al final
    const labels = ['L','M','X','J','V','S','D'];
    let html = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="7"/>`;

    const pendingByDow = {};
    Store.tasks.filter(t=>!t.done).forEach(t=>{
      const d = new Date(t.dueDate + 'T00:00:00').getDay();
      pendingByDow[d] = (pendingByDow[d]||0)+1;
    });

    order.forEach((d,i) => {
      const angle = (-90 + i * (360/7)) * Math.PI/180;
      const x = cx + r*Math.cos(angle), y = cy + r*Math.sin(angle);
      const isToday = d === dow;
      const hasPending = pendingByDow[d] > 0;
      const fill = isToday ? '#3B82F6' : (hasPending ? '#EF4444' : 'rgba(255,255,255,0.22)');
      const rad = isToday ? 8 : 5;
      html += `<circle cx="${x}" cy="${y}" r="${rad}" fill="${fill}"/>`;
      html += `<text x="${x}" y="${y - 15}" text-anchor="middle" font-size="11" fill="${isToday?'#FFFFFF':'rgba(255,255,255,0.5)'}" font-family="-apple-system, sans-serif" font-weight="${isToday?700:500}">${labels[i]}</text>`;
    });

    html += `<text x="${cx}" y="${cy-4}" text-anchor="middle" font-size="28" fill="#FFFFFF" font-family="-apple-system, sans-serif" font-weight="700">${new Date().getDate()}</text>`;
    html += `<text x="${cx}" y="${cy+16}" text-anchor="middle" font-size="11" fill="#94A3B8" font-family="Inter, sans-serif">${new Date().toLocaleDateString('es-PE',{month:'long'})}</text>`;
    svg.innerHTML = html;
  }

  function renderDashboard(){
    const name = Store.profile.name;
    $('#greetingEyebrow').textContent = greetingWord() + (name ? ', ' + name : '');
    $('#greetingTitle').textContent = 'Vamos a organizar tu semana';
    $('#dialDate').textContent = new Date().toLocaleDateString('es-PE', { weekday:'long', day:'numeric', month:'long' });
    renderWeekDial($('#weekDial'));

    const dow = todayDow();
    const todaysBlocks = [];
    Store.courses.forEach(c => c.blocks.forEach(b => { if (b.day === dow) todaysBlocks.push({course:c, block:b}); }));
    todaysBlocks.sort((a,b)=> timeToMin(a.block.start) - timeToMin(b.block.start));

    const pending = Store.tasks.filter(t=>!t.done);
    const weekPending = pending.filter(t => Smart.daysUntil(t.dueDate) <= 7 && Smart.daysUntil(t.dueDate) >= 0);
    const urgent = pending.filter(t => Smart.daysUntil(t.dueDate) <= parseInt(Store.profile.leadDays,10));

    $('#statToday').textContent = todaysBlocks.length;
    $('#statWeek').textContent = weekPending.length;
    $('#statUrgent').textContent = urgent.length;

    $('#dialHeadline').textContent = dow === 0
      ? 'Hoy es domingo: día libre para estudiar a tu ritmo'
      : (todaysBlocks.length ? `Hoy tienes ${todaysBlocks.length} clase${todaysBlocks.length>1?'s':''}` : 'Hoy no tienes clases programadas');
    $('#dialSub').textContent = urgent.length
      ? `Tienes ${urgent.length} pendiente${urgent.length>1?'s':''} que requiere${urgent.length>1?'n':''} atención pronto.`
      : 'Todo bajo control por ahora.';

    // Clases de hoy
    const todayList = $('#todayClasses');
    $('#todayTag').textContent = Store.DAY_NAMES[dow] || 'Domingo';
    todayList.innerHTML = '';
    if (!todaysBlocks.length) {
      todayList.innerHTML = `<p class="empty-note">${dow===0 ? 'Domingo sin clases. Buen día para adelantar pendientes.' : 'No tienes clases hoy.'}</p>`;
    } else {
      todaysBlocks.forEach(({course,block}) => {
        const el = document.createElement('div');
        el.className = 'today-item';
        el.innerHTML = `
          <span class="today-dot" style="background:${COLORS[course.colorIdx]}"></span>
          <span class="today-time">${block.start}–${block.end}</span>
          <div class="today-info"><strong>${Smart.escapeHTML(course.name)}</strong><div>${course.prof ? Smart.escapeHTML(course.prof) : 'Clase programada'}</div></div>`;
        todayList.appendChild(el);
      });
    }

    // Insights
    const insightsList = $('#insightsList');
    insightsList.innerHTML = '';
    Smart.buildInsights(Store.courses, Store.tasks, parseInt(Store.profile.leadDays,10)).forEach(txt => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="dot"></span><span>${txt}</span>`;
      insightsList.appendChild(li);
    });

    // Próximos a vencer
    const upcoming = pending.slice().sort((a,b)=>Smart.urgency(b)-Smart.urgency(a)).slice(0,5);
    renderTaskListInto($('#upcomingTasks'), upcoming, 'No tienes pendientes registrados. ¡Vas al día!');

    // Chips de cursos
    const chipWrap = $('#courseChipList');
    chipWrap.innerHTML = '';
    if (!Store.courses.length) {
      chipWrap.innerHTML = '<p class="empty-note">Agrega tu primer curso desde "Horario".</p>';
    } else {
      Store.courses.forEach(c => {
        const chip = document.createElement('span');
        chip.className = 'course-chip';
        chip.innerHTML = `<span class="dot" style="background:${COLORS[c.colorIdx]}"></span>${Smart.escapeHTML(c.name)}`;
        chipWrap.appendChild(chip);
      });
    }
  }

  function renderTaskListInto(container, tasks, emptyMsg){
    container.innerHTML = '';
    if (!tasks.length) { container.innerHTML = `<p class="empty-note">${emptyMsg}</p>`; return; }
    tasks.forEach(t => container.appendChild(taskItemEl(t)));
  }

  function taskItemEl(t){
    const course = Store.getCourse(t.courseId);
    const days = Smart.daysUntil(t.dueDate);
    const el = document.createElement('div');
    el.className = 'task-item' + (t.done ? ' is-done' : '');
    const dueClass = days < 0 || days === 0 ? 'due-urgent' : (days <= 2 ? 'due-soon' : '');
    el.innerHTML = `
      <button class="task-check ${t.done?'is-done':''}" data-toggle="${t.id}" aria-label="Marcar como hecho">
        <svg viewBox="0 0 24 24"><path d="M4 12l6 6L20 6"/></svg>
      </button>
      <div class="task-main" data-open="${t.id}">
        <div class="t-title">${Smart.escapeHTML(t.title)}</div>
        <div class="t-meta">
          ${course ? `<span class="t-course-dot" style="background:${COLORS[course.colorIdx]}"></span>${Smart.escapeHTML(course.name)}` : 'Sin curso'}
          <span>·</span><span>${capitalize(t.type)}</span>
        </div>
      </div>
      <span class="t-due ${dueClass}">${Smart.dueLabel(t.dueDate, t.dueTime)}</span>
    `;
    el.querySelector('[data-toggle]').addEventListener('click', (e) => {
      e.stopPropagation();
      Store.toggleTask(t.id);
      refreshCurrentView();
    });
    el.querySelector('[data-open]').addEventListener('click', () => openTaskModal(t.id));
    return el;
  }

  function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

  /* ---------------- horario ---------------- */
  function renderSchedule(){
    renderScheduleAgenda();
    renderScheduleGrid();
  }

  // Vista de agenda por día — pensada para móvil: evita la tabla semanal
  // ancha (que obligaba a hacer zoom) mostrando solo el día seleccionado.
  function renderScheduleAgenda(){
    const dow = todayDow();
    if (scheduleDay === null || scheduleDay < 1 || scheduleDay > 6) {
      scheduleDay = (dow >= 1 && dow <= 6) ? dow : 1;
    }

    const blocksByDay = {1:[],2:[],3:[],4:[],5:[],6:[]};
    Store.courses.forEach(course => {
      course.blocks.forEach(b => {
        if (blocksByDay[b.day]) blocksByDay[b.day].push({ course, block: b });
      });
    });
    Object.values(blocksByDay).forEach(list => list.sort((a,b)=>timeToMin(a.block.start)-timeToMin(b.block.start)));

    const tabs = $('#dayTabs');
    tabs.innerHTML = '';
    for (let d = 1; d <= 6; d++){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day-tab' + (d === dow ? ' is-today' : '') + (d === scheduleDay ? ' is-active' : '');
      btn.setAttribute('role','tab');
      btn.setAttribute('aria-selected', d === scheduleDay);
      const count = blocksByDay[d].length;
      btn.innerHTML = `<span class="dt-name">${Store.DAY_SHORT[d]}</span><span class="dt-count">${count || '—'}</span>`;
      btn.addEventListener('click', () => { scheduleDay = d; renderScheduleAgenda(); });
      tabs.appendChild(btn);
    }

    const agenda = $('#scheduleAgenda');
    agenda.innerHTML = '';
    const dayBlocks = blocksByDay[scheduleDay];
    if (!dayBlocks.length) {
      agenda.innerHTML = `<p class="empty-note">Sin clases el ${Store.DAY_NAMES[scheduleDay].toLowerCase()}. Toca "Nuevo curso" para agregar un bloque.</p>`;
      return;
    }
    dayBlocks.forEach(({course, block}) => {
      const el = document.createElement('div');
      el.className = 'agenda-item';
      el.style.setProperty('--c', COLORS[course.colorIdx]);
      el.innerHTML = `
        <div class="agenda-time">${block.start}<span>${block.end}</span></div>
        <div class="agenda-info"><strong>${Smart.escapeHTML(course.name)}</strong><div>${course.prof ? Smart.escapeHTML(course.prof) : 'Clase programada'}</div></div>`;
      el.addEventListener('click', () => openCourseModal(course.id));
      agenda.appendChild(el);
    });
  }

  function renderScheduleGrid(){
    const grid = $('#scheduleGrid');
    grid.innerHTML = '';
    const dow = todayDow();
    const hours = [];
    for (let h = GRID_START_H; h <= GRID_END_H; h++) hours.push(h);

    // fila de cabecera
    grid.style.gridTemplateRows = `44px repeat(${hours.length}, ${ROW_PX}px)`;
    const corner = document.createElement('div'); corner.className='sg-corner'; grid.appendChild(corner);
    for (let d=1; d<=6; d++){
      const head = document.createElement('div');
      head.className = 'sg-day' + (d===dow ? ' is-today' : '');
      head.textContent = Store.DAY_NAMES[d];
      grid.appendChild(head);
    }
    hours.forEach(h => {
      const hourLabel = document.createElement('div');
      hourLabel.className = 'sg-hour';
      hourLabel.textContent = pad(h) + ':00';
      grid.appendChild(hourLabel);
      for (let d=1; d<=6; d++){
        const cell = document.createElement('div');
        cell.className = 'sg-cell';
        cell.dataset.day = d; cell.dataset.hour = h;
        grid.appendChild(cell);
      }
    });

    // posicionar bloques de curso encima de las celdas
    grid.style.position = 'relative';
    const gridStartMin = GRID_START_H*60;
    Store.courses.forEach(course => {
      course.blocks.forEach(b => {
        const cell = grid.querySelector(`.sg-cell[data-day="${b.day}"][data-hour="${GRID_START_H}"]`);
        if (!cell) return;
        const top = ((timeToMin(b.start) - gridStartMin)/60)*ROW_PX;
        const height = ((timeToMin(b.end) - timeToMin(b.start))/60)*ROW_PX;
        if (height <= 0) return;
        const block = document.createElement('div');
        block.className = 'sg-block';
        block.style.background = COLORS[course.colorIdx];
        block.innerHTML = `${Smart.escapeHTML(course.name)}<small>${b.start}–${b.end}</small>`;
        block.title = `${course.name} · ${b.start}–${b.end}`;
        block.addEventListener('click', () => openCourseModal(course.id));
        cell.parentElement.appendChild(placeBlock(block, cell, top, height));
      });
    });
  }

  // Coloca el bloque directamente dentro de la celda inicial usando position absolute
  // relativo al contenedor de la grilla completa (para que abarque varias horas).
  function placeBlock(block, firstCell, top, height){
    // Se ancla al grid completo (ya con position:relative) usando la celda inicial como referencia.
    block.style.position = 'absolute';
    block.style.top = (firstCell.offsetTop + top) + 'px';
    block.style.height = Math.max(height, 26) + 'px';
    block.style.left = firstCell.offsetLeft + 3 + 'px';
    block.style.width = (firstCell.offsetWidth - 6) + 'px';
    return block;
  }

  /* ---------------- cursos ---------------- */
  function renderCourses(){
    const wrap = $('#courseGrid');
    wrap.innerHTML = '';
    if (!Store.courses.length) {
      wrap.innerHTML = '<p class="empty-note">Todavía no agregas cursos. Usa el botón "Nuevo curso".</p>';
      return;
    }
    Store.courses.forEach(c => {
      const pendCount = Store.tasks.filter(t => t.courseId === c.id && !t.done).length;
      const card = document.createElement('div');
      card.className = 'course-card glass';
      card.style.setProperty('--c', COLORS[c.colorIdx]);
      card.innerHTML = `
        <div class="cc-head">
          <div><h3>${Smart.escapeHTML(c.name)}</h3><div class="cc-prof">${c.prof ? Smart.escapeHTML(c.prof) : 'Sin profesor asignado'}</div></div>
          <span class="cc-dot" style="background:${COLORS[c.colorIdx]}"></span>
        </div>
        <div class="cc-sched">
          ${c.blocks.length ? c.blocks.map(b => `<div>${Store.DAY_SHORT[b.day]} · ${b.start}–${b.end}</div>`).join('') : '<div>Sin horario asignado</div>'}
        </div>
        <div class="cc-foot"><span>${pendCount} pendiente${pendCount!==1?'s':''}</span><span>Editar →</span></div>
      `;
      card.addEventListener('click', () => openCourseModal(c.id));
      wrap.appendChild(card);
    });
  }

  /* ---------------- tareas (vista completa) ---------------- */
  let taskFilter = 'pendientes';
  function renderTaskFull(){
    const list = $('#taskFullList');
    let tasks = Store.tasks.slice();
    if (taskFilter === 'pendientes') tasks = tasks.filter(t=>!t.done);
    if (taskFilter === 'urgentes') tasks = tasks.filter(t=>!t.done && Smart.daysUntil(t.dueDate) <= parseInt(Store.profile.leadDays,10));
    if (taskFilter === 'hechas') tasks = tasks.filter(t=>t.done);
    tasks.sort((a,b)=> Smart.urgency(b) - Smart.urgency(a));
    renderTaskListInto(list, tasks, 'No hay pendientes en este filtro.');
  }

  function initTaskFilters(){
    $all('#taskFilters .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        $all('#taskFilters .chip').forEach(c=>c.classList.remove('is-active'));
        chip.classList.add('is-active');
        taskFilter = chip.dataset.filter;
        renderTaskFull();
      });
    });
  }

  function refreshCurrentView(){
    const active = $('.view.is-active');
    if (!active) return;
    switchView(active.id.replace('view-',''));
  }

  /* ---------------- modal genérico ---------------- */
  function openModal(id){
    $('#modalBackdrop').classList.add('is-active');
    $('#' + id).classList.add('is-active');
  }
  function closeModals(){
    $('#modalBackdrop').classList.remove('is-active');
    $all('.modal').forEach(m => m.classList.remove('is-active'));
  }
  function initModalClosers(){
    $('#modalBackdrop').addEventListener('click', closeModals);
    $all('[data-close-modal]').forEach(b => b.addEventListener('click', closeModals));
  }

  /* ---------------- modal: curso ---------------- */
  function buildColorRow(selectedIdx){
    const row = $('#colorRow');
    row.innerHTML = '';
    COLORS.forEach((hex, idx) => {
      const dot = document.createElement('span');
      dot.className = 'color-dot' + (idx === selectedIdx ? ' is-selected' : '');
      dot.style.background = hex;
      dot.addEventListener('click', () => {
        $('#courseColor').value = idx;
        $all('.color-dot', row).forEach(d=>d.classList.remove('is-selected'));
        dot.classList.add('is-selected');
      });
      row.appendChild(dot);
    });
  }

  function addBlockRow(data = { day:'1', start:'08:00', end:'10:00' }){
    const wrap = $('#scheduleBlocks');
    const row = document.createElement('div');
    row.className = 'block-row';
    const dayOpts = [1,2,3,4,5,6].map(d => `<option value="${d}" ${String(d)===String(data.day)?'selected':''}>${Store.DAY_NAMES[d]}</option>`).join('');
    row.innerHTML = `
      <select class="blk-day">${dayOpts}</select>
      <input type="time" class="blk-start" value="${data.start}" />
      <input type="time" class="blk-end" value="${data.end}" />
      <button type="button" class="btn-remove-block" aria-label="Quitar bloque">✕</button>
    `;
    row.querySelector('.btn-remove-block').addEventListener('click', () => row.remove());
    wrap.appendChild(row);
  }

  function openCourseModal(id){
    const isEdit = !!id;
    const course = isEdit ? Store.getCourse(id) : null;
    $('#courseModalTitle').textContent = isEdit ? 'Editar curso' : 'Nuevo curso';
    $('#courseId').value = id || '';
    $('#courseName').value = course ? course.name : '';
    $('#courseProf').value = course ? course.prof : '';
    buildColorRow(course ? course.colorIdx : Store.courses.length % COLORS.length);
    $('#courseColor').value = course ? course.colorIdx : Store.courses.length % COLORS.length;
    $('#scheduleBlocks').innerHTML = '';
    if (course && course.blocks.length) course.blocks.forEach(b => addBlockRow(b));
    else addBlockRow();
    $('#btnDeleteCourse').style.display = isEdit ? 'inline-flex' : 'none';
    openModal('modalCourse');
  }

  function initCourseForm(){
    $('#btnAddCourse').addEventListener('click', () => openCourseModal(null));
    $('#btnAddCourse2').addEventListener('click', () => openCourseModal(null));
    $('#btnAddBlock').addEventListener('click', () => addBlockRow());

    $('#formCourse').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = $('#courseId').value || null;
      const blocks = $all('.block-row', $('#scheduleBlocks')).map(row => ({
        day: parseInt(row.querySelector('.blk-day').value, 10),
        start: row.querySelector('.blk-start').value,
        end: row.querySelector('.blk-end').value
      })).filter(b => b.start && b.end && b.start < b.end);

      Store.upsertCourse({
        id,
        name: $('#courseName').value.trim(),
        prof: $('#courseProf').value.trim(),
        colorIdx: parseInt($('#courseColor').value, 10),
        blocks
      });
      closeModals();
      populateCourseSelect();
      refreshCurrentView();
    });

    $('#btnDeleteCourse').addEventListener('click', () => {
      const id = $('#courseId').value;
      if (id && confirm('¿Eliminar este curso? También se eliminarán sus pendientes.')) {
        Store.deleteCourse(id);
        closeModals();
        populateCourseSelect();
        refreshCurrentView();
      }
    });
  }

  /* ---------------- modal: tarea ---------------- */
  function populateCourseSelect(){
    const sel = $('#taskCourse');
    const current = sel.value;
    sel.innerHTML = Store.courses.map(c => `<option value="${c.id}">${Smart.escapeHTML(c.name)}</option>`).join('') || '<option value="">Agrega un curso primero</option>';
    if (current) sel.value = current;
  }

  function openTaskModal(id){
    const isEdit = !!id;
    const task = isEdit ? Store.getTask(id) : null;
    $('#taskModalTitle').textContent = isEdit ? 'Editar pendiente' : 'Nuevo pendiente';
    $('#taskId').value = id || '';
    $('#taskQuick').value = '';
    $('#taskTitle').value = task ? task.title : '';
    populateCourseSelect();
    $('#taskCourse').value = task ? task.courseId : ($('#taskCourse').options[0]?.value || '');
    $('#taskType').value = task ? task.type : 'tarea';
    $('#taskDate').value = task ? task.dueDate : Smart.fmtISO(new Date());
    $('#taskTime').value = task ? (task.dueTime || '') : '';
    $('#taskNotes').value = task ? (task.notes || '') : '';
    $('#btnDeleteTask').style.display = isEdit ? 'inline-flex' : 'none';
    openModal('modalTask');
    $('#taskQuick').focus();
  }

  function initTaskForm(){
    $('#btnAddTask').addEventListener('click', () => openTaskModal(null));

    $('#taskQuick').addEventListener('input', (e) => {
      const text = e.target.value;
      if (text.trim().length < 4) return;
      const date = Smart.parseDate(text);
      const course = Smart.matchCourse(text, Store.courses);
      let hint = [];
      if (date) { $('#taskDate').value = Smart.fmtISO(date); hint.push('Fecha: ' + date.toLocaleDateString('es-PE', {weekday:'long', day:'numeric', month:'long'})); }
      if (course) { $('#taskCourse').value = course.id; hint.push('Curso: ' + course.name); }
      if (!$('#taskTitle').value || $('#taskTitle').dataset.auto === '1') {
        $('#taskTitle').value = text;
        $('#taskTitle').dataset.auto = '1';
      }
      $('#quickHint').textContent = hint.length ? hint.join(' · ') : 'Escribe con lenguaje natural y detectaré el curso y la fecha.';
    });
    $('#taskTitle').addEventListener('input', () => { $('#taskTitle').dataset.auto = '0'; });

    $('#formTask').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!$('#taskCourse').value) { alert('Primero agrega un curso desde "Horario".'); return; }
      const id = $('#taskId').value || null;
      Store.upsertTask({
        id,
        title: $('#taskTitle').value.trim(),
        courseId: $('#taskCourse').value,
        type: $('#taskType').value,
        dueDate: $('#taskDate').value,
        dueTime: $('#taskTime').value,
        notes: $('#taskNotes').value.trim()
      });
      closeModals();
      refreshCurrentView();
      Notifier.checkTasks();
    });

    $('#btnDeleteTask').addEventListener('click', () => {
      const id = $('#taskId').value;
      if (id && confirm('¿Eliminar este pendiente?')) {
        Store.deleteTask(id);
        closeModals();
        refreshCurrentView();
      }
    });
  }

  /* ---------------- ajustes ---------------- */
  function updateNotifStatusBtn(){
    const p = Notifier.permission();
    const btn = $('#btnNotifStatus');
    if (!btn) return;
    btn.textContent = p === 'granted' ? '✓ Notificaciones activas en tu celular' : (p === 'denied' ? 'Bloqueadas — actívalas en ajustes del celular' : 'Activar notificaciones');
  }

  function openSettingsModal(){
    $('#settingName').value = Store.profile.name || '';
    $('#settingLeadDays').value = Store.profile.leadDays || 4;
    const srv = $('#settingPushServer');
    if (srv) srv.value = Store.profile.pushServerUrl || '';
    updateNotifStatusBtn();
    openModal('modalSettings');
  }

  function initSettings(){
    $('#btnSettings').addEventListener('click', openSettingsModal);
    $('#btnSettingsMobile')?.addEventListener('click', openSettingsModal);
    $('#btnOpenLegal')?.addEventListener('click', () => openModal('modalLegal'));
    $all('[data-open-legal]').forEach(b => b.addEventListener('click', () => openModal('modalLegal')));
    $('#settingName').addEventListener('change', (e) => { Store.setProfile({ name: e.target.value.trim() }); renderDashboard(); });
    $('#settingLeadDays').addEventListener('change', (e) => { Store.setProfile({ leadDays: parseInt(e.target.value,10) }); refreshCurrentView(); });
    $('#settingPushServer')?.addEventListener('change', (e) => {
      Store.setProfile({ pushServerUrl: e.target.value.trim().replace(/\/$/, '') });
      Notifier.syncWithPushServer();
      pushToast('Servidor Push', 'Servidor actualizado y sincronizado.');
    });

    $('#btnNotifStatus').addEventListener('click', async () => {
      await Notifier.requestPermission();
      updateNotifStatusBtn();
    });

    $('#btnTestNotif')?.addEventListener('click', async () => {
      const ok = await Notifier.testNotification();
      updateNotifStatusBtn();
      if (ok) {
        pushToast('Notificación enviada', 'Revisa la barra de estado de tu celular.');
      }
    });

    $('#btnEnableNotifs').addEventListener('click', async () => {
      const p = await Notifier.requestPermission();
      pushToast('Notificaciones', p === 'granted' ? 'Listo, te avisaremos a tiempo.' : 'No se activaron los avisos.');
      updateNotifStatusBtn();
    });

    $('#btnExportData').addEventListener('click', () => {
      const blob = new Blob([Store.exportJSON()], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'uniflow-datos.json';
      a.click();
    });
    $('#btnResetData').addEventListener('click', () => {
      if (confirm('Esto borrará todos tus cursos y pendientes. ¿Continuar?')) {
        Store.resetAll();
        closeModals();
        populateCourseSelect();
        switchView('dashboard');
      }
    });

    // Escuchar mensajes desde el Service Worker (por ejemplo, clic en notificación)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'COMPAS_HIGHLIGHT_TASK') {
          switchView('tareas');
        }
      });
    }
  }

  /* Manejo de accesos directos de PWA / Android APK (shortcuts) */
  function handleUrlParams(){
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'new-task') {
      openTaskModal();
    } else if (params.get('view')) {
      switchView(params.get('view'));
    }
  }

  /* ---------------- init ---------------- */
  function init(){
    initNav();
    initModalClosers();
    initCourseForm();
    initTaskForm();
    initSettings();
    initTaskFilters();
    populateCourseSelect();
    switchView('dashboard');
    Notifier.start();
    handleUrlParams();
  }

  return { init, pushToast };
})();

document.addEventListener('DOMContentLoaded', UI.init);
