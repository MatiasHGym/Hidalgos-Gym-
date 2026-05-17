(function () {
  const DB_NAME = "gimnasio-suite-db";
  const DB_VERSION = 4;
  const PROGRAM_ID = "pesas";
  const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  const state = {
    clients: [],
    schedules: [],
    attendance: [],
    selectedScheduleId: null,
    editingClientId: null,
    selectedClientId: null,
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const els = {
    statClients: $("#statClients"),
    statSchedules: $("#statSchedules"),
    statAttendance: $("#statAttendance"),
    tabs: $$(".tab"),
    views: $$(".view"),
    dayInput: $("#dayInput"),
    scheduleGrid: $("#scheduleGrid"),
    scheduleForm: $("#scheduleForm"),
    scheduleName: $("#scheduleName"),
    scheduleDay: $("#scheduleDay"),
    scheduleStart: $("#scheduleStart"),
    scheduleEnd: $("#scheduleEnd"),
    scheduleCount: $("#scheduleCount"),
    scheduleList: $("#scheduleList"),
    clientForm: $("#clientForm"),
    clientFormTitle: $("#clientFormTitle"),
    fullName: $("#fullName"),
    rut: $("#rut"),
    phone: $("#phone"),
    sex: $("#sex"),
    age: $("#age"),
    complications: $("#complications"),
    clientScheduleOptions: $("#clientScheduleOptions"),
    saveClientButton: $("#saveClientButton"),
    cancelEditButton: $("#cancelEditButton"),
    searchInput: $("#searchInput"),
    clientGrid: $("#clientGrid"),
    attendanceDialog: $("#attendanceDialog"),
    attendanceTitle: $("#attendanceTitle"),
    attendanceList: $("#attendanceList"),
    closeAttendanceButton: $("#closeAttendanceButton"),
    clientDialog: $("#clientDialog"),
    dialogClientName: $("#dialogClientName"),
    clientDetails: $("#clientDetails"),
    closeClientButton: $("#closeClientButton"),
    editClientButton: $("#editClientButton"),
    deleteClientButton: $("#deleteClientButton"),
    toast: $("#toast"),
  };

  let db;
  const syncChannel = "BroadcastChannel" in window ? new BroadcastChannel("gimnasio-suite-sync") : null;
  if (syncChannel) {
    syncChannel.addEventListener("message", () => {
      if (db) refreshState();
    });
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        ["clients", "attendance", "payments", "schedules", "plans"].forEach((name) => {
          if (!database.objectStoreNames.contains(name)) {
            database.createObjectStore(name, { keyPath: "id" });
          }
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function store(name, mode = "readonly") {
    return db.transaction(name, mode).objectStore(name);
  }

  function getAll(name) {
    if (window.HidalgoCloud?.isReady()) return window.HidalgoCloud.all(name);
    return new Promise((resolve, reject) => {
      const request = store(name).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  function putItem(name, item) {
    if (window.HidalgoCloud?.isReady()) return window.HidalgoCloud.put(name, item);
    return new Promise((resolve, reject) => {
      const request = store(name, "readwrite").put(item);
      request.onsuccess = () => {
        syncChannel?.postMessage({ type: "changed", store: name, at: Date.now() });
        resolve(item);
      };
      request.onerror = () => reject(request.error);
    });
  }

  function deleteItem(name, id) {
    if (window.HidalgoCloud?.isReady()) return window.HidalgoCloud.delete(name, id);
    return new Promise((resolve, reject) => {
      const request = store(name, "readwrite").delete(id);
      request.onsuccess = () => {
        syncChannel?.postMessage({ type: "changed", store: name, at: Date.now() });
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  function uid(prefix) {
    return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  }

  function todayInputValue() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  }

  function selectedDateValue() {
    return els.dayInput.value || todayInputValue();
  }

  function selectedDayIndex() {
    const [year, month, day] = selectedDateValue().split("-").map(Number);
    return new Date(year, month - 1, day).getDay();
  }

  function selectedDaySchedules() {
    const day = selectedDayIndex();
    return state.schedules.filter((schedule) => Number(schedule.day) === day);
  }

  function attendanceId(date, scheduleId, clientId) {
    return `${PROGRAM_ID}|${date}|${scheduleId}|${clientId}`;
  }

  async function refreshState() {
    const [clients, schedules, attendance] = await Promise.all([
      getAll("clients"),
      getAll("schedules"),
      getAll("attendance"),
    ]);
    state.clients = clients.filter((client) => membershipForProgram(client, PROGRAM_ID)).sort((a, b) => displayName(a).localeCompare(displayName(b), "es"));
    state.schedules = schedules.filter((schedule) => schedule.programId === PROGRAM_ID).sort((a, b) => `${a.day}${a.start}`.localeCompare(`${b.day}${b.start}`));
    state.attendance = attendance.filter((item) => item.programId === PROGRAM_ID);
    if (!state.selectedScheduleId && state.schedules.length) state.selectedScheduleId = state.schedules[0].id;
    render();
  }

  function render() {
    renderStats();
    renderSchedules();
    renderScheduleOptions();
    renderClients();
  }

  function renderStats() {
    const date = selectedDateValue();
    const present = selectedDaySchedules().reduce((total, schedule) => {
      return total + state.clients.filter((client) => clientInSchedule(client, schedule.id)).filter((client) =>
        state.attendance.some((item) => item.id === attendanceId(date, schedule.id, client.id))
      ).length;
    }, 0);
    els.statClients.textContent = state.clients.length;
    els.statSchedules.textContent = state.schedules.length;
    els.statAttendance.textContent = present;
  }

  function renderSchedules() {
    els.scheduleCount.textContent = state.schedules.length;
    if (!state.schedules.length) {
      els.scheduleGrid.innerHTML = `<div class="empty-state">Crea el primer horario de pesas.</div>`;
      els.scheduleList.innerHTML = `<div class="empty-state">No hay horarios creados.</div>`;
      return;
    }

    const schedulesForDay = selectedDaySchedules();
    if (!schedulesForDay.length) {
      els.scheduleGrid.innerHTML = `<div class="empty-state">No hay horarios creados para este día.</div>`;
    } else {
      els.scheduleGrid.innerHTML = schedulesForDay.map((schedule) => {
      const clients = state.clients.filter((client) => clientInSchedule(client, schedule.id));
      const date = selectedDateValue();
      const present = clients.filter((client) => state.attendance.some((item) => item.id === attendanceId(date, schedule.id, client.id))).length;
      return `
        <button class="schedule-card" type="button" data-schedule-id="${schedule.id}">
          <span>${DAYS[schedule.day]}</span>
          <strong>${escapeHtml(schedule.name || "Entrenamiento")}</strong>
          <span>${schedule.start} - ${schedule.end}</span>
          <small>${present}/${clients.length} asisten</small>
        </button>
      `;
      }).join("");
    }

    els.scheduleList.innerHTML = state.schedules.map((schedule) => `
      <article class="row-card">
        <div>
          <strong>${escapeHtml(schedule.name || "Entrenamiento")}</strong>
          <span>${DAYS[schedule.day]} · ${schedule.start} - ${schedule.end}</span>
        </div>
        <button class="ghost-button" type="button" data-delete-schedule="${schedule.id}">Eliminar</button>
      </article>
    `).join("");

    $$(".schedule-card").forEach((button) => {
      button.addEventListener("click", () => openAttendance(button.dataset.scheduleId));
    });
    $$("[data-delete-schedule]").forEach((button) => {
      button.addEventListener("click", () => deleteSchedule(button.dataset.deleteSchedule));
    });
  }

  function renderScheduleOptions() {
    if (!state.schedules.length) {
      els.clientScheduleOptions.innerHTML = `<div class="empty-state">Primero crea un horario.</div>`;
      return;
    }
    const selected = state.editingClientId ? membershipForProgram(state.clients.find((client) => client.id === state.editingClientId) || {}, PROGRAM_ID)?.schedules || [] : [];
    els.clientScheduleOptions.innerHTML = state.schedules.map((schedule) => `
      <label class="choice">
        <input type="checkbox" name="clientSchedule" value="${schedule.id}" ${selected.includes(schedule.id) ? "checked" : ""} />
        ${DAYS[schedule.day]} ${schedule.start}-${schedule.end}
      </label>
    `).join("");
  }

  function renderClients() {
    const query = els.searchInput.value.trim().toLowerCase();
    const clients = state.clients.filter((client) => `${displayName(client)} ${client.rut} ${client.phone || ""}`.toLowerCase().includes(query));
    if (!clients.length) {
      els.clientGrid.innerHTML = `<div class="empty-state">No hay clientes para mostrar.</div>`;
      return;
    }
    els.clientGrid.innerHTML = clients.map((client) => `
      <button class="client-card" type="button" data-client-id="${client.id}">
        <strong>${escapeHtml(displayName(client))}</strong>
        <span>${formatAge(client.age)} · ${escapeHtml(client.sex || "Sin registrar")}</span>
        <small>${membershipForProgram(client, PROGRAM_ID)?.schedules.length || 0} horario${membershipForProgram(client, PROGRAM_ID)?.schedules.length === 1 ? "" : "s"}</small>
      </button>
    `).join("");
    $$(".client-card").forEach((button) => button.addEventListener("click", () => openClient(button.dataset.clientId)));
  }

  async function saveSchedule(event) {
    event.preventDefault();
    const now = new Date().toISOString();
    await putItem("schedules", {
      id: uid("schedule"),
      programId: PROGRAM_ID,
      name: els.scheduleName.value.trim(),
      day: Number(els.scheduleDay.value),
      start: els.scheduleStart.value,
      end: els.scheduleEnd.value,
      createdAt: now,
      updatedAt: now,
    });
    els.scheduleForm.reset();
    await refreshState();
    showToast("Horario guardado.");
  }

  async function deleteSchedule(scheduleId) {
    const clientsInSchedule = state.clients.filter((client) => clientInSchedule(client, scheduleId));
    if (clientsInSchedule.length) {
      showToast("No se puede eliminar el horario porque hay clientes inscritos.");
      return;
    }
    const ok = window.confirm("¿Eliminar este horario?");
    if (!ok) return;
    const relatedAttendance = state.attendance.filter((item) => item.slotId === scheduleId);
    await Promise.all([
      deleteItem("schedules", scheduleId),
      ...relatedAttendance.map((item) => deleteItem("attendance", item.id)),
    ]);
    if (state.selectedScheduleId === scheduleId) state.selectedScheduleId = null;
    await refreshState();
    showToast("Horario eliminado.");
  }

  async function saveClient(event) {
    event.preventDefault();
    const schedules = $$("input[name='clientSchedule']:checked").map((input) => input.value);
    const existing = state.clients.find((client) => client.id === state.editingClientId);
    const now = new Date().toISOString();
    const previousMemberships = existing ? normalizeMemberships(existing).filter((membership) => membership.programId !== PROGRAM_ID) : [];
    const routeMembership = {
      id: membershipForProgram(existing || {}, PROGRAM_ID)?.id || uid("membership"),
      programId: PROGRAM_ID,
      planId: membershipForProgram(existing || {}, PROGRAM_ID)?.planId || "",
      paymentDate: membershipForProgram(existing || {}, PROGRAM_ID)?.paymentDate || "",
      schedules,
    };
    const memberships = [...previousMemberships, routeMembership];
    const primary = memberships[0];
    await putItem("clients", {
      id: existing ? existing.id : uid("client"),
      programId: primary.programId,
      fullName: els.fullName.value.trim(),
      rut: els.rut.value.trim(),
      phone: els.phone.value.trim(),
      sex: els.sex.value,
      age: els.age.value ? Number(els.age.value) : "",
      complications: els.complications.value.trim(),
      schedules: primary.schedules,
      planId: primary.planId,
      paymentDate: primary.paymentDate,
      memberships,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    });
    resetClientForm();
    await refreshState();
    showToast(existing ? "Cliente actualizado." : "Cliente creado.");
    switchTab("summary");
  }

  function openAttendance(scheduleId) {
    const schedule = state.schedules.find((item) => item.id === scheduleId);
    if (!schedule) return;
    state.selectedScheduleId = scheduleId;
    const date = selectedDateValue();
    const clients = state.clients.filter((client) => clientInSchedule(client, scheduleId));
    els.attendanceTitle.textContent = `${DAYS[schedule.day]} ${schedule.start}-${schedule.end}`;
    if (!clients.length) {
      els.attendanceList.innerHTML = `<div class="empty-state">No hay clientes en este horario.</div>`;
    } else {
      els.attendanceList.innerHTML = clients.map((client) => {
        const checked = state.attendance.some((item) => item.id === attendanceId(date, scheduleId, client.id));
        return `
          <article class="row-card">
            <div>
              <strong>${escapeHtml(shortName(client))}</strong>
              <span>${formatAge(client.age)}</span>
            </div>
            <label class="attendance-check">
              <input type="checkbox" data-client-id="${client.id}" ${checked ? "checked" : ""} />
              Asistió
            </label>
          </article>
        `;
      }).join("");
      $$("#attendanceList input[type='checkbox']").forEach((input) => {
        input.addEventListener("change", () => toggleAttendance(schedule, input.dataset.clientId, input.checked));
      });
    }
    if (!els.attendanceDialog.open) {
      els.attendanceDialog.showModal();
    }
  }

  async function toggleAttendance(schedule, clientId, checked) {
    const date = selectedDateValue();
    const id = attendanceId(date, schedule.id, clientId);
    if (checked) {
      await putItem("attendance", { id, programId: PROGRAM_ID, date, slotId: schedule.id, clientId, createdAt: new Date().toISOString() });
    } else {
      await deleteItem("attendance", id);
    }
    await refreshState();
    openAttendance(schedule.id);
  }

  function openClient(clientId) {
    const client = state.clients.find((item) => item.id === clientId);
    if (!client) return;
    state.selectedClientId = clientId;
    els.dialogClientName.textContent = displayName(client);
    els.clientDetails.innerHTML = `
      <div class="detail-item"><span>Edad</span><strong>${formatAge(client.age)}</strong></div>
      <div class="detail-item"><span>Sexo</span><strong>${escapeHtml(client.sex || "Sin registrar")}</strong></div>
      <div class="detail-item"><span>RUT</span><strong>${escapeHtml(client.rut)}</strong></div>
      <div class="detail-item"><span>Teléfono</span><strong>${escapeHtml(client.phone || "Sin teléfono")}</strong></div>
      <div class="detail-item is-wide"><span>Horarios</span><strong>${scheduleLabels(membershipForProgram(client, PROGRAM_ID)?.schedules || []).join("<br>") || "Sin horario"}</strong></div>
      <div class="detail-item is-wide"><span>Complicaciones</span><strong>${escapeHtml(client.complications || "Sin registros")}</strong></div>
    `;
    els.clientDialog.showModal();
  }

  function editClient() {
    const client = state.clients.find((item) => item.id === state.selectedClientId);
    if (!client) return;
    state.editingClientId = client.id;
    els.fullName.value = client.fullName || "";
    els.rut.value = client.rut || "";
    els.phone.value = client.phone || "";
    els.sex.value = client.sex || "";
    els.age.value = client.age || "";
    els.complications.value = client.complications || "";
    els.clientFormTitle.textContent = "Modificar cliente";
    els.saveClientButton.textContent = "Guardar cambios";
    els.cancelEditButton.hidden = false;
    renderScheduleOptions();
    els.clientDialog.close();
    switchTab("client");
  }

  async function deleteClient() {
    const client = state.clients.find((item) => item.id === state.selectedClientId);
    if (!client) return;
    const ok = window.confirm(`¿Eliminar a ${displayName(client)}?`);
    if (!ok) return;
    const relatedAttendance = state.attendance.filter((item) => item.clientId === client.id);
    await Promise.all([deleteItem("clients", client.id), ...relatedAttendance.map((item) => deleteItem("attendance", item.id))]);
    els.clientDialog.close();
    await refreshState();
    showToast("Cliente eliminado.");
  }

  function resetClientForm() {
    state.editingClientId = null;
    els.clientForm.reset();
    els.clientFormTitle.textContent = "Crear cliente";
    els.saveClientButton.textContent = "Guardar cliente";
    els.cancelEditButton.hidden = true;
    renderScheduleOptions();
  }

  function switchTab(tabName) {
    els.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === tabName));
    els.views.forEach((view) => view.classList.toggle("is-active", view.id === `${tabName}View`));
  }

  function clientInSchedule(client, scheduleId) {
    const membership = membershipForProgram(client, PROGRAM_ID);
    return Array.isArray(membership?.schedules) && membership.schedules.includes(scheduleId);
  }

  function normalizeMemberships(client) {
    const rows = Array.isArray(client?.memberships) && client.memberships.length
      ? client.memberships
      : [
          {
            id: uid("membership"),
            programId: client?.programId || PROGRAM_ID,
            planId: client?.planId || "",
            paymentDate: client?.paymentDate || "",
            schedules: Array.isArray(client?.schedules) ? client.schedules : [],
          },
        ];
    return rows.map((membership) => ({
      id: membership.id || uid("membership"),
      programId: membership.programId || client?.programId || PROGRAM_ID,
      planId: membership.planId || "",
      paymentDate: membership.paymentDate || "",
      schedules: Array.isArray(membership.schedules) ? membership.schedules : [],
    }));
  }

  function membershipForProgram(client, programId) {
    return normalizeMemberships(client).find((membership) => membership.programId === programId);
  }

  function scheduleLabels(scheduleIds = []) {
    return scheduleIds.map((id) => {
      const schedule = state.schedules.find((item) => item.id === id);
      return schedule ? `${DAYS[schedule.day]} ${schedule.start}-${schedule.end}` : "";
    }).filter(Boolean);
  }

  function displayName(client) {
    return client.fullName || `Cliente ${client.rut}`;
  }

  function shortName(client) {
    const parts = String(client.fullName || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 3) return `${parts[0]} ${parts[2]}`;
    if (parts.length === 2) return `${parts[0]} ${parts[1]}`;
    return displayName(client);
  }

  function formatAge(age) {
    return age ? `${age} años` : "Edad no registrada";
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2200);
  }

  function bindEvents() {
    els.tabs.forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
    els.dayInput.addEventListener("change", render);
    els.scheduleForm.addEventListener("submit", saveSchedule);
    els.clientForm.addEventListener("submit", saveClient);
    els.cancelEditButton.addEventListener("click", resetClientForm);
    els.searchInput.addEventListener("input", renderClients);
    els.closeAttendanceButton.addEventListener("click", () => els.attendanceDialog.close());
    els.closeClientButton.addEventListener("click", () => els.clientDialog.close());
    els.editClientButton?.addEventListener("click", editClient);
    els.deleteClientButton?.addEventListener("click", deleteClient);
  }

  async function init() {
    await window.HidalgoCloud?.requireLogin?.({ title: "Pesas" });
    els.dayInput.value = todayInputValue();
    bindEvents();
    db = await openDatabase();
    await refreshState();
    window.setInterval(refreshState, 5000);
    window.addEventListener("focus", refreshState);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshState();
    });
  }

  init().catch((error) => {
    console.error(error);
    showToast("No se pudo iniciar Pesas.");
  });
})();
