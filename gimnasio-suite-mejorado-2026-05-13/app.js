(function () {
  const DB_NAME = "gimnasio-suite-db";
  const DB_VERSION = 4;
  const PROGRAMS = {
    yoga: "Yoga",
    pilates: "Pilates",
    boxeo: "Boxeo",
    pesas: "Pesas",
  };
  const routeArea = new URLSearchParams(window.location.search).get("area") || "yoga";
  const PROGRAM_ID = PROGRAMS[routeArea] ? routeArea : "yoga";
  const PROGRAM_NAME = PROGRAMS[PROGRAM_ID];

  const SLOTS = [
    { id: "martes-1000", day: "Martes", dayOffset: 1, time: "10:00-11:00" },
    { id: "martes-1115", day: "Martes", dayOffset: 1, time: "11:15-12:15" },
    { id: "martes-1230", day: "Martes", dayOffset: 1, time: "12:30-13:30" },
    { id: "jueves-1000", day: "Jueves", dayOffset: 3, time: "10:00-11:00" },
    { id: "jueves-1115", day: "Jueves", dayOffset: 3, time: "11:15-12:15" },
    { id: "jueves-1230", day: "Jueves", dayOffset: 3, time: "12:30-13:30" },
  ];

  const state = {
    clients: [],
    attendance: [],
    payments: [],
    plans: [],
    selectedSlotId: SLOTS[0].id,
    editingClientId: null,
    selectedClientId: null,
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const els = {
    todayLabel: $("#todayLabel"),
    programTitle: $("#programTitle"),
    statClients: $("#statClients"),
    statAbsences: $("#statAbsences"),
    absencesButton: $("#absencesButton"),
    statAttendance: $("#statAttendance"),
    tabs: $$(".tab"),
    views: $$(".view"),
    classGrid: $("#classGrid"),
    selectedClassText: $("#selectedClassText"),
    attendanceDate: $("#attendanceDate"),
    scheduleOptions: $("#scheduleOptions"),
    clientForm: $("#clientForm"),
    fullName: $("#fullName"),
    rut: $("#rut"),
    phone: $("#phone"),
    sex: $("#sex"),
    age: $("#age"),
    complications: $("#complications"),
    formTitle: $("#formTitle"),
    saveClientButton: $("#saveClientButton"),
    cancelEditButton: $("#cancelEditButton"),
    paymentForm: $("#paymentForm"),
    paymentClient: $("#paymentClient"),
    paymentDate: $("#paymentDate"),
    paymentAmount: $("#paymentAmount"),
    paymentMethod: $("#paymentMethod"),
    paymentNote: $("#paymentNote"),
    paymentTotal: $("#paymentTotal"),
    paymentList: $("#paymentList"),
    clientSearch: $("#clientSearch"),
    clientGrid: $("#clientGrid"),
    clientDialog: $("#clientDialog"),
    dialogName: $("#dialogName"),
    clientDetails: $("#clientDetails"),
    clientPlanForm: $("#clientPlanForm"),
    clientPlanSelect: $("#clientPlanSelect"),
    clientPaymentDate: $("#clientPaymentDate"),
    closeDialogButton: $("#closeDialogButton"),
    editClientButton: $("#editClientButton"),
    deleteClientButton: $("#deleteClientButton"),
    attendanceDialog: $("#attendanceDialog"),
    attendanceDialogTitle: $("#attendanceDialogTitle"),
    attendanceDialogCount: $("#attendanceDialogCount"),
    attendanceDialogList: $("#attendanceDialogList"),
    closeAttendanceDialogButton: $("#closeAttendanceDialogButton"),
    absencesDialog: $("#absencesDialog"),
    absencesList: $("#absencesList"),
    closeAbsencesDialogButton: $("#closeAbsencesDialogButton"),
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
        if (!database.objectStoreNames.contains("clients")) {
          database.createObjectStore("clients", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("attendance")) {
          database.createObjectStore("attendance", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("payments")) {
          database.createObjectStore("payments", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("schedules")) {
          database.createObjectStore("schedules", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("plans")) {
          database.createObjectStore("plans", { keyPath: "id" });
        }
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

  async function importSeedClients() {
    const seed = Array.isArray(window.GYM_CLIENT_SEED) ? window.GYM_CLIENT_SEED : [];
    if (!seed.length || PROGRAM_ID !== "yoga") return;

    const existing = await getAll("clients");
    const sourceIds = new Set(existing.map((client) => client.sourceId).filter(Boolean));
    const personalKeys = new Set(existing.map((client) => personalKey(client)));
    const now = new Date().toISOString();

    for (const item of seed) {
      const key = personalKey(item);
      if (sourceIds.has(item.sourceId) || personalKeys.has(key)) continue;

      await putItem("clients", {
        id: uid("client"),
        sourceId: item.sourceId,
        programId: PROGRAM_ID,
        memberships: [
          {
            id: uid("membership"),
            programId: PROGRAM_ID,
            planId: "",
            paymentDate: "",
            schedules: Array.isArray(item.schedules) ? item.schedules : [],
          },
        ],
        fullName: item.fullName || "",
        rut: "",
        phone: item.phone || "",
        sex: item.sex || "",
        age: item.age || "",
        complications: item.complications || "",
        schedules: Array.isArray(item.schedules) ? item.schedules : [],
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async function migrateLegacyYogaData() {
    if (localStorage.getItem("gym-yoga-area-migrated-v1")) return;
    const [clients, attendance, payments, plans] = await Promise.all([getAll("clients"), getAll("attendance"), getAll("payments"), getAll("plans")]);

    for (const client of clients.filter((item) => item.programId === "pilates" && !Array.isArray(item.memberships))) {
      await putItem("clients", {
        ...client,
        programId: "yoga",
        memberships: [
          {
            id: uid("membership"),
            programId: "yoga",
            planId: client.planId || "",
            paymentDate: client.paymentDate || "",
            schedules: Array.isArray(client.schedules) ? client.schedules : [],
          },
        ],
        updatedAt: new Date().toISOString(),
      });
    }
    for (const payment of payments.filter((item) => item.programId === "pilates")) {
      await putItem("payments", { ...payment, programId: "yoga", updatedAt: new Date().toISOString() });
    }
    for (const plan of plans.filter((item) => item.programId === "pilates")) {
      await putItem("plans", { ...plan, programId: "yoga", updatedAt: new Date().toISOString() });
    }
    for (const item of attendance.filter((row) => row.programId === "pilates")) {
      const nextId = String(item.id).replace(/^pilates\|/, "yoga|");
      await putItem("attendance", { ...item, id: nextId, programId: "yoga", updatedAt: new Date().toISOString() });
      if (nextId !== item.id) await deleteItem("attendance", item.id);
    }
    localStorage.setItem("gym-yoga-area-migrated-v1", "1");
  }

  function uid(prefix) {
    if (window.crypto && crypto.randomUUID) {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function todayInputValue() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  }

  function currentWeekValue() {
    return todayInputValue();
  }

  function isoWeekValue() {
    const now = new Date();
    const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = local.getDay() || 7;
    local.setDate(local.getDate() + 4 - day);
    const yearStart = new Date(local.getFullYear(), 0, 1);
    const week = Math.ceil(((local - yearStart) / 86400000 + 1) / 7);
    return `${local.getFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  function weekStartDate(weekValue) {
    if (!String(weekValue).includes("-W")) {
      const monday = parseLocalDate(weekValue || todayInputValue());
      const day = monday.getDay() || 7;
      monday.setDate(monday.getDate() - day + 1);
      return monday;
    }
    const [yearText, weekText] = weekValue.split("-W");
    const year = Number(yearText);
    const week = Number(weekText);
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const day = simple.getDay() || 7;
    const monday = new Date(simple);
    if (day <= 4) {
      monday.setDate(simple.getDate() - day + 1);
    } else {
      monday.setDate(simple.getDate() + 8 - day);
    }
    return monday;
  }

  function dateInputValueFromDate(date) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function slotDateValue(slotId) {
    const slot = SLOTS.find((item) => item.id === slotId) || SLOTS[0];
    const date = weekStartDate(els.attendanceDate.value || currentWeekValue());
    date.setDate(date.getDate() + slot.dayOffset);
    return dateInputValueFromDate(date);
  }

  function formatDate(dateValue) {
    const [year, month, day] = dateValue.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("es-CL", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  function selectedSlot() {
    return SLOTS.find((slot) => slot.id === state.selectedSlotId) || SLOTS[0];
  }

  function slotLabel(slotId) {
    const slot = SLOTS.find((item) => item.id === slotId);
    return slot ? `${slot.day} ${slot.time}` : "Sin horario";
  }

  function attendanceId(date, slotId, clientId) {
    return `${PROGRAM_ID}|${date}|${slotId}|${clientId}`;
  }

  function clientIsInSlot(client, slotId) {
    const membership = membershipForProgram(client, PROGRAM_ID);
    return Array.isArray(membership?.schedules) && membership.schedules.includes(slotId);
  }

  function normalizeMemberships(client) {
    const rows = Array.isArray(client?.memberships) && client.memberships.length
      ? client.memberships
      : [
          {
            id: uid("membership"),
            programId: legacyProgramId(client?.programId),
            planId: client?.planId || "",
            paymentDate: client?.paymentDate || "",
            schedules: Array.isArray(client?.schedules) ? client.schedules : [],
          },
        ];
    return rows.map((membership) => ({
      id: membership.id || uid("membership"),
      programId: legacyProgramId(membership.programId || client?.programId),
      planId: membership.planId || "",
      paymentDate: membership.paymentDate || "",
      schedules: Array.isArray(membership.schedules) ? membership.schedules : [],
    }));
  }

  function legacyProgramId(programId) {
    return programId === "pilates" ? "yoga" : programId || "yoga";
  }

  function membershipForProgram(client, programId) {
    return normalizeMemberships(client).find((membership) => membership.programId === programId);
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      els.toast.classList.remove("is-visible");
    }, 2200);
  }

  async function refreshState() {
    const [clients, attendance, payments, plans] = await Promise.all([getAll("clients"), getAll("attendance"), getAll("payments"), getAll("plans")]);
    state.clients = clients
      .filter((client) => membershipForProgram(client, PROGRAM_ID))
      .sort((a, b) => displayName(a).localeCompare(displayName(b), "es"));
    state.attendance = attendance.filter((item) => item.programId === PROGRAM_ID);
    state.payments = payments
      .filter((item) => item.programId === PROGRAM_ID)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    state.plans = plans;
    render();
  }

  function render() {
    renderStats();
    renderClasses();
    renderAttendance();
    renderPayments();
    renderClients();
  }

  function renderStats() {
    const date = slotDateValue(state.selectedSlotId);
    const classClients = state.clients.filter((client) => clientIsInSlot(client, state.selectedSlotId));
    const present = classClients.filter((client) =>
      state.attendance.some((item) => item.id === attendanceId(date, state.selectedSlotId, client.id))
    );
    const weeklyAbsences = getWeeklyAbsences();

    els.statClients.textContent = state.clients.length;
    els.statAbsences.textContent = weeklyAbsences.length;
    els.statAttendance.textContent = present.length;
    els.attendanceDialogCount.textContent = `${present.length} marcados`;
  }

  function getWeeklyAbsences() {
    return SLOTS.flatMap((slot) => {
      const date = slotDateValue(slot.id);
      return state.clients
        .filter((client) => clientIsInSlot(client, slot.id))
        .filter((client) => !state.attendance.some((item) => item.id === attendanceId(date, slot.id, client.id)))
        .map((client) => ({
          client,
          slot,
          date,
        }));
    });
  }

  function renderClasses() {
    els.classGrid.innerHTML = SLOTS.map((slot) => {
      const date = slotDateValue(slot.id);
      const clients = state.clients.filter((client) => clientIsInSlot(client, slot.id));
      const present = clients.filter((client) =>
        state.attendance.some((item) => item.id === attendanceId(date, slot.id, client.id))
      );
      const active = slot.id === state.selectedSlotId ? " is-active" : "";
      return `
        <button class="class-button${active}" type="button" data-slot-id="${slot.id}">
          <span>${slot.day}</span>
          <strong>${slot.time}</strong>
          <span>${present.length}/${clients.length} asistieron</span>
        </button>
      `;
    }).join("");

    const slot = selectedSlot();
    els.selectedClassText.textContent = `Semana seleccionada · ${slot.day} ${slot.time}`;

    $$(".class-button").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedSlotId = button.dataset.slotId;
        render();
        openAttendanceDialog();
      });
    });
  }

  function renderAttendance() {
    const date = slotDateValue(state.selectedSlotId);
    const clients = state.clients.filter((client) => clientIsInSlot(client, state.selectedSlotId));

    if (!clients.length) {
      els.attendanceDialogList.innerHTML = `<div class="empty-state">No hay clientes inscritos en esta clase.</div>`;
      return;
    }

    const listMarkup = clients.map((client) => {
      const checked = state.attendance.some((item) => item.id === attendanceId(date, state.selectedSlotId, client.id));
      return `
        <article class="attendance-row">
          <div>
            <strong>${escapeHtml(displayName(client))}</strong>
            <span>${formatAge(client.age)}</span>
          </div>
          <label class="check-control">
            <input type="checkbox" data-client-id="${client.id}" ${checked ? "checked" : ""} />
            Asistió
          </label>
        </article>
      `;
    }).join("");

    els.attendanceDialogList.innerHTML = listMarkup;

    $$("#attendanceDialogList .attendance-row input[type='checkbox']").forEach((checkbox) => {
      checkbox.addEventListener("change", () => toggleAttendance(checkbox.dataset.clientId, checkbox.checked));
    });
  }

  function openAttendanceDialog() {
    const slot = selectedSlot();
    const date = slotDateValue(state.selectedSlotId);
    const classClients = state.clients.filter((client) => clientIsInSlot(client, state.selectedSlotId));
    const present = classClients.filter((client) =>
      state.attendance.some((item) => item.id === attendanceId(date, state.selectedSlotId, client.id))
    );

    els.attendanceDialogTitle.textContent = `${slot.day} ${slot.time} · ${formatDate(date)}`;
    els.attendanceDialogCount.textContent = `${present.length} marcados`;
    if (!els.attendanceDialog.open) {
      els.attendanceDialog.showModal();
    }
  }

  function openAbsencesDialog() {
    const absences = getWeeklyAbsences();

    if (!absences.length) {
      els.absencesList.innerHTML = `<div class="empty-state">No hay faltas registradas en esta semana.</div>`;
    } else {
      els.absencesList.innerHTML = absences.map(({ client, slot, date }) => `
        <article class="attendance-row">
          <div>
            <strong>${escapeHtml(displayName(client))}</strong>
            <span>${slot.day} ${slot.time} · ${formatDate(date)}</span>
          </div>
        </article>
      `).join("");
    }

    if (!els.absencesDialog.open) {
      els.absencesDialog.showModal();
    }
  }

  function renderScheduleOptions(selected = []) {
    els.scheduleOptions.innerHTML = SLOTS.map((slot) => `
      <label class="schedule-option">
        <input type="checkbox" name="schedule" value="${slot.id}" ${selected.includes(slot.id) ? "checked" : ""} />
        ${slot.day} ${slot.time}
      </label>
    `).join("");
  }

  function renderClients() {
    const query = els.clientSearch.value.trim().toLowerCase();
    const clients = state.clients.filter((client) => {
      const text = `${displayName(client)} ${client.rut} ${client.phone || ""}`.toLowerCase();
      return text.includes(query);
    });

    if (!clients.length) {
      els.clientGrid.innerHTML = `<div class="empty-state">No hay clientes para mostrar.</div>`;
      return;
    }

    els.clientGrid.innerHTML = clients.map((client) => `
      <button class="client-card" type="button" data-client-id="${client.id}">
        <strong>${escapeHtml(displayName(client))}</strong>
        <span>${formatAge(client.age)} · ${escapeHtml(client.sex || "Sin registrar")}</span>
        <span>${escapeHtml(client.phone || "Sin teléfono")}</span>
        ${clientPaymentBadge(client)}
        <small>${(membershipForProgram(client, PROGRAM_ID)?.schedules || []).length} horario${(membershipForProgram(client, PROGRAM_ID)?.schedules || []).length === 1 ? "" : "s"}</small>
      </button>
    `).join("");

    $$(".client-card").forEach((card) => {
      card.addEventListener("click", () => openClient(card.dataset.clientId));
    });
  }

  async function toggleAttendance(clientId, checked) {
    const date = slotDateValue(state.selectedSlotId);
    const id = attendanceId(date, state.selectedSlotId, clientId);

    if (checked) {
      await putItem("attendance", {
        id,
        programId: PROGRAM_ID,
        date,
        slotId: state.selectedSlotId,
        clientId,
        createdAt: new Date().toISOString(),
      });
    } else {
      await deleteItem("attendance", id);
    }

    await refreshState();
  }

  async function saveClient(event) {
    event.preventDefault();

    const schedules = $$("input[name='schedule']:checked").map((input) => input.value);

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
    const client = {
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
    };

    await putItem("clients", client);
    resetForm();
    await refreshState();
    showToast(existing ? "Cliente actualizado." : "Cliente creado.");
    switchTab("summary");
  }

  async function savePayment(event) {
    event.preventDefault();

    const now = new Date().toISOString();
    await putItem("payments", {
      id: uid("payment"),
      programId: PROGRAM_ID,
      clientId: els.paymentClient.value,
      date: els.paymentDate.value,
      amount: Number(els.paymentAmount.value),
      method: els.paymentMethod.value,
      note: els.paymentNote.value.trim(),
      createdAt: now,
      updatedAt: now,
    });

    els.paymentForm.reset();
    els.paymentDate.value = todayInputValue();
    await refreshState();
    showToast("Pago guardado.");
    switchTab("payments");
  }

  function renderPayments() {
    if (!els.paymentClient) return;

    els.paymentClient.innerHTML = state.clients.length
      ? state.clients.map((client) => `<option value="${client.id}">${escapeHtml(displayName(client))}</option>`).join("")
      : `<option value="">Sin clientas</option>`;

    const total = state.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    els.paymentTotal.textContent = formatMoney(total);

    if (!state.payments.length) {
      els.paymentList.innerHTML = `<div class="empty-state">No hay pagos registrados.</div>`;
      return;
    }

    els.paymentList.innerHTML = state.payments.map((payment) => {
      const client = state.clients.find((item) => item.id === payment.clientId);
      return `
        <article class="attendance-row">
          <div>
            <strong>${escapeHtml(client ? displayName(client) : "Clienta eliminada")}</strong>
            <span>${formatDate(payment.date)} · ${escapeHtml(payment.method)}${payment.note ? ` · ${escapeHtml(payment.note)}` : ""}</span>
          </div>
          <strong>${formatMoney(payment.amount)}</strong>
        </article>
      `;
    }).join("");
  }

  function openClient(clientId) {
    const client = state.clients.find((item) => item.id === clientId);
    if (!client) return;

    state.selectedClientId = clientId;
    const membership = membershipForProgram(client, PROGRAM_ID);
    els.dialogName.textContent = displayName(client);
    els.clientDetails.innerHTML = `
      <div class="detail-item"><span>Edad</span><strong>${formatAge(client.age)}</strong></div>
      <div class="detail-item"><span>Sexo</span><strong>${escapeHtml(client.sex || "Sin registrar")}</strong></div>
      <div class="detail-item"><span>RUT</span><strong>${escapeHtml(client.rut)}</strong></div>
      <div class="detail-item"><span>Teléfono</span><strong>${escapeHtml(client.phone || "Sin teléfono")}</strong></div>
      <div class="detail-item"><span>Horarios</span><strong>${membership?.schedules.length ? membership.schedules.map(slotLabel).join("<br>") : "Sin horario"}</strong></div>
      <div class="detail-item"><span>Plan</span><strong>${escapeHtml(planName(membership?.planId))}</strong></div>
      <div class="detail-item"><span>Estado de pago</span><strong>${escapeHtml(clientPaymentStatus(client).label)}</strong></div>
      <div class="detail-item"><span>Fecha mensual de pago</span><strong>${membership?.paymentDate ? formatDate(membership.paymentDate) : "Sin fecha"}</strong></div>
      <div class="detail-item is-wide"><span>Complicaciones</span><strong>${escapeHtml(client.complications || "Sin registros")}</strong></div>
    `;
    els.clientDialog.showModal();
  }

  function renderClientPlanForm(client) {
    if (!state.plans.length) {
      els.clientPlanSelect.innerHTML = `<option value="">Sin planes creados</option>`;
      els.clientPlanSelect.disabled = true;
    } else {
      els.clientPlanSelect.disabled = false;
      els.clientPlanSelect.innerHTML = `<option value="">Sin plan</option>${state.plans.map((plan) => `
      <option value="${plan.id}" ${membershipForProgram(client, PROGRAM_ID)?.planId === plan.id ? "selected" : ""}>${escapeHtml(plan.name)} · ${formatMoney(plan.price)}</option>
      `).join("")}`;
    }
    els.clientPaymentDate.value = membershipForProgram(client, PROGRAM_ID)?.paymentDate || "";
  }

  async function saveClientPlan(event) {
    event.preventDefault();
    const client = state.clients.find((item) => item.id === state.selectedClientId);
    if (!client) return;

    await putItem("clients", {
      ...client,
      planId: els.clientPlanSelect.value,
      paymentDate: els.clientPaymentDate.value,
      updatedAt: new Date().toISOString(),
    });
    await refreshState();
    openClient(client.id);
    showToast("Plan asignado.");
  }

  function editSelectedClient() {
    const client = state.clients.find((item) => item.id === state.selectedClientId);
    if (!client) return;

    state.editingClientId = client.id;
    els.fullName.value = client.fullName;
    els.rut.value = client.rut;
    els.phone.value = client.phone || "";
    els.sex.value = client.sex;
    els.age.value = client.age;
    els.complications.value = client.complications || "";
    renderScheduleOptions(membershipForProgram(client, PROGRAM_ID)?.schedules || []);
    els.formTitle.textContent = "Modificar cliente";
    els.saveClientButton.textContent = "Guardar cambios";
    els.cancelEditButton.hidden = false;
    els.clientDialog.close();
    switchTab("create");
  }

  async function deleteSelectedClient() {
    const client = state.clients.find((item) => item.id === state.selectedClientId);
    if (!client) return;

    const ok = window.confirm(`¿Eliminar a ${displayName(client)}? También se borrarán sus asistencias.`);
    if (!ok) return;

    const relatedAttendance = state.attendance.filter((item) => item.clientId === client.id);
    await Promise.all([deleteItem("clients", client.id), ...relatedAttendance.map((item) => deleteItem("attendance", item.id))]);
    els.clientDialog.close();
    await refreshState();
    showToast("Cliente eliminado.");
  }

  function resetForm() {
    state.editingClientId = null;
    els.clientForm.reset();
    renderScheduleOptions();
    els.formTitle.textContent = "Crear cliente";
    els.saveClientButton.textContent = "Guardar cliente";
    els.cancelEditButton.hidden = true;
  }

  function switchTab(tabName) {
    els.tabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.tab === tabName);
    });
    els.views.forEach((view) => {
      view.classList.toggle("is-active", view.id === `${tabName}View`);
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function displayName(client) {
    return client.fullName || `Cliente ${client.rut}`;
  }

  function formatAge(age) {
    return age ? `${age} años` : "Edad no registrada";
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  }

  function planName(planId) {
    if (!planId) return "Sin plan";
    const plan = state.plans.find((item) => item.id === planId);
    return plan ? `${plan.name} · ${formatMoney(plan.price)}` : "Plan no encontrado";
  }

  function clientPaymentBadge(client) {
    const status = clientPaymentStatus(client);
    return `<small class="payment-status ${status.kind}">${escapeHtml(status.label)}</small>`;
  }

  function clientPaymentStatus(client) {
    const membership = membershipForProgram(client, PROGRAM_ID);
    if (!membership?.planId) return { kind: "missing", label: "Sin plan" };
    if (!membership.paymentDate) return { kind: "missing", label: "Sin fecha de pago" };
    const today = startOfDay(new Date());
    const base = parseLocalDate(membership.paymentDate);
    const due = startOfDay(new Date(today.getFullYear(), today.getMonth(), base.getDate()));
    const days = Math.ceil((due - today) / 86400000);
    if (days < 0) return { kind: "expired", label: `${Math.abs(days)} días atrasado` };
    if (days <= 7) return { kind: "upcoming", label: days === 0 ? "Vence hoy" : `Vence en ${days} días` };
    return { kind: "ok", label: "Al día" };
  }

  function parseLocalDate(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function personalKey(client) {
    return `${normalizeText(client.fullName)}|${normalizeText(client.phone)}`;
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function bindEvents() {
    els.tabs.forEach((tab) => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });
    els.attendanceDate.closest(".date-control").addEventListener("click", () => {
      els.attendanceDate.focus();
      if (typeof els.attendanceDate.showPicker === "function") {
        els.attendanceDate.showPicker();
      }
    });
    els.absencesButton.addEventListener("click", openAbsencesDialog);
    els.attendanceDate.addEventListener("change", render);
    els.clientForm.addEventListener("submit", saveClient);
    els.paymentForm?.addEventListener("submit", savePayment);
    els.clientPlanForm?.addEventListener("submit", saveClientPlan);
    els.cancelEditButton.addEventListener("click", resetForm);
    els.clientSearch.addEventListener("input", renderClients);
    els.closeDialogButton.addEventListener("click", () => els.clientDialog.close());
    els.closeAttendanceDialogButton.addEventListener("click", () => els.attendanceDialog.close());
    els.closeAbsencesDialogButton.addEventListener("click", () => els.absencesDialog.close());
    els.editClientButton?.addEventListener("click", editSelectedClient);
    els.deleteClientButton?.addEventListener("click", deleteSelectedClient);
  }

  async function init() {
    await window.HidalgoCloud?.requireLogin?.({ title: PROGRAM_NAME });
    document.title = `${PROGRAM_NAME} | Hidalgo´s GYM`;
    els.programTitle.textContent = PROGRAM_NAME;
    els.attendanceDate.value = currentWeekValue();
    if (els.paymentDate) els.paymentDate.value = todayInputValue();
    els.todayLabel.textContent = formatDate(todayInputValue());
    renderScheduleOptions();
    bindEvents();
    db = await openDatabase();
    await migrateLegacyYogaData();
    await importSeedClients();
    await refreshState();
    window.setInterval(refreshState, 5000);
    window.addEventListener("focus", refreshState);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshState();
    });
  }

  init().catch((error) => {
    console.error(error);
    showToast("No se pudo iniciar la app.");
  });
})();
