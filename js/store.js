/* =========================================================
   COMPÁS — store.js
   Capa de datos: persistencia en localStorage.
   Modelo:
   course = { id, name, prof, colorIdx, blocks:[{day, start, end, room}] }
     day: 1=Lunes ... 6=Sábado
     start/end: "HH:MM" en formato 24h
   task = { id, courseId, title, type, dueDate, dueTime, notes, done, createdAt }
========================================================= */
const Store = (() => {
  const KEY = 'compas.v1';

  const DAY_NAMES = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const DAY_SHORT = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function seed() {
    return {
      profile: { name: '', leadDays: 4, notifPromptSeen: false },
      courses: [],
      tasks: [],
      notified: {} // taskId -> array of thresholds already notified, to avoid duplicate alerts
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return seed();
      const data = JSON.parse(raw);
      return Object.assign(seed(), data);
    } catch (e) {
      console.warn('Compás: no se pudo leer el almacenamiento, empezando de cero.', e);
      return seed();
    }
  }

  let state = load();

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  return {
    DAY_NAMES, DAY_SHORT,

    get profile() { return state.profile; },
    setProfile(p) { Object.assign(state.profile, p); save(); },

    get courses() { return state.courses; },
    getCourse(id) { return state.courses.find(c => c.id === id); },
    upsertCourse(course) {
      if (!course.id) {
        course.id = uid();
        state.courses.push(course);
      } else {
        const i = state.courses.findIndex(c => c.id === course.id);
        if (i >= 0) state.courses[i] = course; else state.courses.push(course);
      }
      save();
      return course;
    },
    deleteCourse(id) {
      state.courses = state.courses.filter(c => c.id !== id);
      state.tasks = state.tasks.filter(t => t.courseId !== id);
      save();
    },

    get tasks() { return state.tasks; },
    getTask(id) { return state.tasks.find(t => t.id === id); },
    upsertTask(task) {
      if (!task.id) {
        task.id = uid();
        task.createdAt = Date.now();
        task.done = false;
        state.tasks.push(task);
      } else {
        const i = state.tasks.findIndex(t => t.id === task.id);
        if (i >= 0) state.tasks[i] = Object.assign(state.tasks[i], task);
      }
      save();
      return task;
    },
    deleteTask(id) {
      state.tasks = state.tasks.filter(t => t.id !== id);
      save();
    },
    toggleTask(id) {
      const t = state.tasks.find(t => t.id === id);
      if (t) { t.done = !t.done; save(); }
      return t;
    },

    wasNotified(taskId, threshold) {
      return (state.notified[taskId] || []).includes(threshold);
    },
    markNotified(taskId, threshold) {
      if (!state.notified[taskId]) state.notified[taskId] = [];
      state.notified[taskId].push(threshold);
      save();
    },

    exportJSON() {
      return JSON.stringify(state, null, 2);
    },
    resetAll() {
      state = seed();
      save();
    }
  };
})();
