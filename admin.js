(function () {
  const DB_NAME = "gimnasio-suite-db";
  const DB_VERSION = 4;
  const PROGRAMS = {
    yoga: "Yoga",
    pilates: "Pilates",
    boxeo: "Boxeo",
    pesas: "Pesas",
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const els = {
    securityLock: $("#securityLock"),
    securityForm: $("#securityForm"),
    securityPin: $("#securityPin"),
    securityMessage: $("#securityMessage"),
    tabs: $$("[data-admin-tab]"),
    views: $$(".admin-view"),
    upcomingButton: $("#upcomingButton"),
    expiredButton: $("#expiredButton"),
    upcomingCount: $("#upcomingCount"),
    expiredCount: $("#expiredCount"),
    monthPayments: $("#monthPayments"),
    globalSearch: $("#globalSearch"),
    globalSearchResults: $("#globalSearchResults"),
    exportBackupButton: $("#exportBackupButton"),
    importBackupButton: $("#importBackupButton"),
    importBackupInput: $("#importBackupInput"),
    actionList: $("#actionList"),
    planForm: $("#planForm"),
    planFormTitle: $("#planFormTitle"),
    planName: $("#planName"),
    planPrice: $("#planPrice"),
    planRoutePicker: $("#planRoutePicker"),
    planDescription: $("#planDescription"),
    savePlanButton: $("#savePlanButton"),
    cancelPlanEditButton: $("#cancelPlanEditButton"),
    planCount: $("#planCount"),
    planList: $("#planList"),
    dashboardGrid: $("#dashboardGrid"),
    routeHealthGrid: $("#routeHealthGrid"),
    areaRevenueChart: $("#areaRevenueChart"),
    plannerMonth: $("#plannerMonth"),
    plannerSearch: $("#plannerSearch"),
    plannerRouteFilter: $("#plannerRouteFilter"),
    plannerStatusFilter: $("#plannerStatusFilter"),
    plannerList: $("#plannerList"),
    statusDialog: $("#statusDialog"),
    statusDialogKicker: $("#statusDialogKicker"),
    statusDialogTitle: $("#statusDialogTitle"),
    statusList: $("#statusList"),
    closeStatusDialog: $("#closeStatusDialog"),
    clientDialog: $("#clientDialog"),
    clientDialogName: $("#clientDialogName"),
    clientDialogDetails: $("#clientDialogDetails"),
    clientWhatsappButton: $("#clientWhatsappButton"),
    adminClientForm: $("#adminClientForm"),
    adminClientName: $("#adminClientName"),
    adminClientRut: $("#adminClientRut"),
    adminClientPhone: $("#adminClientPhone"),
    adminClientAge: $("#adminClientAge"),
    adminClientProgram: $("#adminClientProgram"),
    adminClientPlan: $("#adminClientPlan"),
    adminClientPaymentDate: $("#adminClientPaymentDate"),
    adminClientScheduleOptions: $("#adminClientScheduleOptions"),
    upsertMembershipButton: $("#upsertMembershipButton"),
    adminMembershipList: $("#adminMembershipList"),
    adminClientComplications: $("#adminClientComplications"),
    adminPaymentForm: $("#adminPaymentForm"),
    adminPaymentDate: $("#adminPaymentDate"),
    adminPaymentAmount: $("#adminPaymentAmount"),
    adminPaymentMethod: $("#adminPaymentMethod"),
    adminPaymentNote: $("#adminPaymentNote"),
    clientHistory: $("#clientHistory"),
    deleteAdminClientButton: $("#deleteAdminClientButton"),
    closeClientDialog: $("#closeClientDialog"),
    backupDialog: $("#backupDialog"),
    backupFilename: $("#backupFilename"),
    backupText: $("#backupText"),
    copyBackupButton: $("#copyBackupButton"),
    closeBackupDialog: $("#closeBackupDialog"),
    closeBackupButton: $("#closeBackupButton"),
    toast: $("#toast"),
  };

  const state = {
    clients: [],
    attendance: [],
    payments: [],
    schedules: [],
    plans: [],
    editingPlanId: null,
    selectedClientId: null,
    editingMemberships: [],
    eventsBound: false,
  };

  let db;
  const ADMIN_PIN_HASH = "347213dd2b6e78d0efaa5933376dbbac13b0327664211d50b72956759aa0f1ce";
  const ADMIN_SESSION_KEY = "hidalgo-gym-admin-unlocked";
  const YOGA_SLOTS = [
    { id: "martes-1000", programId: "yoga", day: "Martes", label: "Martes 10:00-11:00", start: "10:00", end: "11:00" },
    { id: "martes-1115", programId: "yoga", day: "Martes", label: "Martes 11:15-12:15", start: "11:15", end: "12:15" },
    { id: "martes-1230", programId: "yoga", day: "Martes", label: "Martes 12:30-13:30", start: "12:30", end: "13:30" },
    { id: "jueves-1000", programId: "yoga", day: "Jueves", label: "Jueves 10:00-11:00", start: "10:00", end: "11:00" },
    { id: "jueves-1115", programId: "yoga", day: "Jueves", label: "Jueves 11:15-12:15", start: "11:15", end: "12:15" },
    { id: "jueves-1230", programId: "yoga", day: "Jueves", label: "Jueves 12:30-13:30", start: "12:30", end: "13:30" },
  ];
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
    return new Promise((resolve, reject) => {
      const request = store(name).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  function putItem(name, item) {
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

  async function sha256Hex(value) {
    if (!crypto.subtle) return "";
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function isAdminUnlocked() {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
  }

  function showAdminLock() {
    document.body.classList.add("is-locked");
    window.setTimeout(() => els.securityPin?.focus(), 80);
  }

  function hideAdminLock() {
    document.body.classList.remove("is-locked");
  }

  async function unlockAdmin(event) {
    event.preventDefault();
    const pin = els.securityPin.value.trim();
    const hash = await sha256Hex(pin);
    const fallbackPinOk = !hash && pin === ["48", "18"].join("");
    if (hash !== ADMIN_PIN_HASH && !fallbackPinOk) {
      els.securityPin.value = "";
      els.securityMessage.textContent = "Clave incorrecta.";
      return;
    }
    sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    els.securityPin.value = "";
    els.securityMessage.textContent = "";
    hideAdminLock();
    await startAdmin();
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

  async function refreshState() {
    const [clients, attendance, payments, schedules, plans] = await Promise.all([
      getAll("clients"),
      getAll("attendance"),
      getAll("payments"),
      getAll("schedules"),
      getAll("plans"),
    ]);
    state.clients = clients.filter((client) => normalizeMemberships(client).some((membership) => PROGRAMS[membership.programId]));
    state.attendance = attendance.filter((item) => PROGRAMS[item.programId]);
    state.payments = payments.filter((item) => PROGRAMS[item.programId]);
    state.schedules = schedules.filter((item) => PROGRAMS[item.programId]);
    state.plans = plans;
    render();
  }

  function render() {
    const status = getPaymentStatus();
    const monthTotal = monthPayments();
    els.upcomingCount.textContent = status.upcoming.length;
    els.expiredCount.textContent = status.expired.length;
    els.monthPayments.textContent = formatMoney(monthTotal);
    renderPrincipal(status);
    renderPlans();
    renderDashboard(status, monthTotal);
    renderPlanner();
    renderGlobalSearch();
  }

  function getPaymentStatus() {
    const today = startOfDay(new Date());
    const rows = state.clients.flatMap((client) => normalizeMemberships(client).map((membership) => {
      const plan = planForMembership(membership);
      const lastPayment = latestPayment(client.id, membership.programId);
      const dueDate = dueDateFor(membership, plan, lastPayment);
      if (!dueDate) return null;
      const days = Math.ceil((dueDate - today) / 86400000);
      return { client, membership, plan, lastPayment, dueDate, days };
    })).filter(Boolean);

    return {
      upcoming: rows.filter((row) => row.days >= 0 && row.days <= 7).sort((a, b) => a.days - b.days),
      expired: rows.filter((row) => row.days < 0).sort((a, b) => a.days - b.days),
      dueToday: rows.filter((row) => row.days === 0).sort((a, b) => displayName(a.client).localeCompare(displayName(b.client), "es")),
      lateWeek: rows.filter((row) => row.days < 0 && row.days >= -7).sort((a, b) => a.days - b.days),
      lateCritical: rows.filter((row) => row.days < -7).sort((a, b) => a.days - b.days),
      all: rows,
    };
  }

  function planForClient(client) {
    return planForMembership(primaryMembership(client));
  }

  function planForMembership(membership) {
    if (!membership) return null;
    if (membership.planId) {
      const direct = state.plans.find((plan) => plan.id === membership.planId);
      if (direct) return direct;
    }
    return state.plans.find((plan) => plan.programId === membership.programId) || state.plans.find((plan) => plan.programId === "general");
  }

  function latestPayment(clientId, programId = "") {
    return state.payments
      .filter((payment) => payment.clientId === clientId && (!programId || payment.programId === programId))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  }

  function dueDateFor(membership, plan, payment) {
    if (!membership) return null;
    if (!plan && !payment && !membership.paymentDate) return null;
    const today = startOfDay(new Date());
    const base = membership.paymentDate ? parseDate(membership.paymentDate) : payment?.date ? parseDate(payment.date) : null;
    if (base) {
      let due = startOfDay(new Date(today.getFullYear(), today.getMonth(), base.getDate()));
      if (due < today) {
        const lateDays = Math.floor((today - due) / 86400000);
        if (lateDays > 7) {
          due = startOfDay(new Date(today.getFullYear(), today.getMonth() + 1, base.getDate()));
        }
      }
      return due;
    }
    const day = Number(plan?.paymentDay || 1);
    return startOfDay(new Date(today.getFullYear(), today.getMonth(), Math.min(day, 28)));
  }

  function normalizeMemberships(client) {
    const hasMemberships = Array.isArray(client?.memberships) && client.memberships.length;
    const rows = hasMemberships
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
      programId: hasMemberships ? membership.programId || client?.programId || "yoga" : legacyProgramId(membership.programId || client?.programId),
      planId: membership.planId || "",
      paymentDate: membership.paymentDate || "",
      schedules: Array.isArray(membership.schedules) ? membership.schedules : [],
    })).filter((membership) => PROGRAMS[membership.programId]);
  }

  function primaryMembership(client) {
    return normalizeMemberships(client)[0] || null;
  }

  function legacyProgramId(programId) {
    return programId === "pilates" ? "yoga" : programId || "yoga";
  }

  function renderPrincipal(status) {
    renderActionList(status);
  }

  function renderActionList(status) {
    const clients = state.clients
      .slice()
      .sort((a, b) => displayName(a).localeCompare(displayName(b), "es"));

    if (!clients.length) {
      els.actionList.innerHTML = `<div class="empty-state">No hay clientes registrados.</div>`;
      return;
    }

    els.actionList.innerHTML = clients
      .map((client) => {
        const memberships = normalizeMemberships(client);
        return `
        <article class="attendance-row row-with-actions">
          <button class="row-main planner-list-row" type="button" data-client-id="${client.id}">
            <strong>${escapeHtml(displayName(client))}</strong>
            <span>${formatAge(client.age)} · ${memberships.map((membership) => programLabel(membership.programId)).join(" / ") || "Sin área"}</span>
          </button>
          <span class="row-tools">
            ${whatsappQuickLink(client)}
            ${memberships.map((membership) => `<small class="route-icon ${membership.programId}" aria-label="${programLabel(membership.programId)}">${routeInitial(membership.programId)}</small>`).join("")}
          </span>
        </article>
      `;
      }).join("");
    $$("#actionList .planner-list-row").forEach((button) => button.addEventListener("click", () => openClient(button.dataset.clientId)));
    bindQuickWhatsappLinks();
  }

  function renderPlans() {
    els.planCount.textContent = state.plans.length;
    if (!state.plans.length) {
      els.planList.innerHTML = `<div class="empty-state">Aún no hay planes creados.</div>`;
      return;
    }
    els.planList.innerHTML = Object.entries(PROGRAMS).map(([programId, name]) => {
      const plans = state.plans.filter((plan) => plan.programId === programId);
      if (!plans.length) return "";

      return `
        <details class="plan-route-group" ${programId === "yoga" ? "open" : ""}>
          <summary>
            <span>${name}</span>
            <strong>${plans.length}</strong>
          </summary>
          <div class="plan-route-list">
            ${plans.map((plan) => `
              <button class="attendance-row plan-row" type="button" data-plan-id="${plan.id}">
                <div>
                  <strong>${escapeHtml(plan.name)}</strong>
                  <span>${formatMoney(plan.price)}${plan.description ? ` · ${escapeHtml(plan.description)}` : ""}</span>
                </div>
              </button>
            `).join("")}
          </div>
        </details>
      `;
    }).join("");
    $$(".plan-row").forEach((button) => button.addEventListener("click", () => editPlan(button.dataset.planId)));
  }

  function renderDashboard(status, monthTotal) {
    const monthKeyValue = monthKey(todayInputValue());
    const monthAttendance = state.attendance.filter((item) => monthKey(item.date) === monthKeyValue).length;
    const monthPaymentRows = state.payments.filter((p) => monthKey(p.date) === monthKeyValue);
    const averagePayment = monthPaymentRows.length ? monthTotal / monthPaymentRows.length : 0;
    const paidClients = new Set(monthPaymentRows.map((p) => p.clientId)).size;
    const missingPlans = state.clients.filter((client) => !planForClient(client)).length;
    const inactiveCount = inactiveClients(14).length;
    const todayAttendance = state.attendance.filter((item) => item.date === todayInputValue()).length;
    const conversionRisk = status.upcoming.length + status.expired.length;
    const areas = Object.entries(PROGRAMS).map(([programId, name]) => {
      const total = state.clients.filter((client) => normalizeMemberships(client).some((membership) => membership.programId === programId)).length;
      return `${name}: ${total}`;
    }).join(" · ");

    els.dashboardGrid.innerHTML = [
      metricCard("Clientes activos", state.clients.length, areas),
      metricCard("Asistencias hoy", todayAttendance, "Registros tomados durante el día"),
      metricCard("Vencen hoy", status.dueToday.length, "Contactar durante el día"),
      metricCard("Atraso +7 días", status.lateCritical.length, "Prioridad alta de cobranza"),
      metricCard("Riesgo de cobranza", conversionRisk, "Por vencer + vencidos"),
      metricCard("Planes creados", state.plans.length, "Disponibles para las rutas"),
      metricCard("Ingresos mes", formatMoney(monthTotal), "Pagos registrados este mes"),
      metricCard("Clientas que pagaron", paidClients, "Clientes únicos con pago mensual"),
      metricCard("Ticket promedio", formatMoney(averagePayment), "Promedio de pagos del mes"),
      metricCard("Asistencias mes", monthAttendance, "Registros de asistencia"),
      metricCard("Por vencer", status.upcoming.length, "Próximos 7 días"),
      metricCard("Vencidos", status.expired.length, "Cobranza atrasada"),
      metricCard("Sin plan", missingPlans, "Clientes sin plan asignado"),
      metricCard("Sin asistencia 14d", inactiveCount, "Riesgo de abandono"),
    ].join("");

    const byArea = Object.entries(PROGRAMS).map(([programId, name]) => {
      const total = state.payments
        .filter((payment) => payment.programId === programId && monthKey(payment.date) === monthKeyValue)
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      return { name, total };
    });
    const max = Math.max(1, ...byArea.map((item) => item.total));
    els.areaRevenueChart.innerHTML = byArea.map((item) => `
      <div class="bar-row">
        <span>${item.name}</span>
        <div><i data-width="${Math.max(4, (item.total / max) * 100)}"></i></div>
        <strong>${formatMoney(item.total)}</strong>
      </div>
    `).join("");
    $$("#areaRevenueChart i[data-width]").forEach((bar) => {
      bar.style.width = `${Number(bar.dataset.width || 4)}%`;
    });

    els.routeHealthGrid.innerHTML = Object.entries(PROGRAMS).map(([programId, name]) => {
      const routeClients = state.clients.filter((client) => normalizeMemberships(client).some((membership) => membership.programId === programId));
      const routeAttendance = state.attendance.filter((item) => item.programId === programId && monthKey(item.date) === monthKeyValue).length;
      const routeRevenue = state.payments
        .filter((payment) => payment.programId === programId && monthKey(payment.date) === monthKeyValue)
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const routeExpired = status.expired.filter((row) => row.membership.programId === programId).length;
      return `
        <article class="admin-card route-health-card">
          <div class="route-health-title">
            <small class="route-icon ${programId}" aria-label="${name}">${routeInitial(programId)}</small>
            <strong>${name}</strong>
          </div>
          <span>${routeClients.length} clientes · ${routeAttendance} asistencias</span>
          <b>${formatMoney(routeRevenue)}</b>
          <small>${routeExpired} vencidos</small>
        </article>
      `;
    }).join("");
  }

  function renderPlanner() {
    const month = els.plannerMonth.value || monthKey(todayInputValue());
    const [year, monthNumber] = month.split("-").map(Number);
    const daysInMonth = new Date(year, monthNumber, 0).getDate();
    const status = getPaymentStatus();
    const upcomingIds = new Set(status.upcoming.map((row) => row.client.id));
    const expiredIds = new Set(status.expired.map((row) => row.client.id));
    const query = normalizeText(els.plannerSearch.value);
    const route = els.plannerRouteFilter.value;
    const plannerStatus = els.plannerStatusFilter.value;
    const paymentRows = state.clients.flatMap((client) => normalizeMemberships(client).map((membership) => {
      const base = membership.paymentDate ? parseDate(membership.paymentDate) : null;
      const day = base ? Math.min(base.getDate(), daysInMonth) : null;
      return {
        client,
        membership,
        day,
        date: day ? new Date(year, monthNumber - 1, day) : null,
        programId: membership.programId,
        plan: planForMembership(membership),
      };
    })).filter((row) => {
      const text = normalizeText(`${displayName(row.client)} ${row.client.phone || ""} ${row.client.rut || ""}`);
      if (query && !text.includes(query)) return false;
      if (route !== "all" && row.programId !== route) return false;
      if (plannerStatus === "upcoming" && !upcomingIds.has(row.client.id)) return false;
      if (plannerStatus === "expired" && !expiredIds.has(row.client.id)) return false;
      if (plannerStatus === "missingPlan" && row.plan) return false;
      if (plannerStatus === "missingDate" && row.membership.paymentDate) return false;
      return true;
    }).sort((a, b) => (a.day || 99) - (b.day || 99) || programLabel(a.programId).localeCompare(programLabel(b.programId), "es"));

    if (!paymentRows.length) {
      els.plannerList.innerHTML = `<div class="empty-state">No hay clientes registrados.</div>`;
      return;
    }

    els.plannerList.innerHTML = paymentRows.map((row) => `
        <article class="attendance-row row-with-actions">
          <button class="row-main planner-list-row" type="button" data-client-id="${row.client.id}">
            <strong>${escapeHtml(displayName(row.client))}</strong>
            <span>${row.date ? formatDate(row.date) : "Sin fecha de pago"} · ${programLabel(row.programId)}${row.plan ? ` · ${escapeHtml(row.plan.name)}` : " · Sin plan"}</span>
          </button>
          <span class="row-tools">
            ${whatsappQuickLink(row.client)}
            <small class="route-icon ${row.programId}" aria-label="${programLabel(row.programId)}">${routeInitial(row.programId)}</small>
          </span>
        </article>
      `).join("");
    $$(".planner-list-row").forEach((button) => button.addEventListener("click", () => openClient(button.dataset.clientId)));
    bindQuickWhatsappLinks();
  }

  async function savePlan(event) {
    event.preventDefault();
    const now = new Date().toISOString();
    const existing = state.plans.find((plan) => plan.id === state.editingPlanId);
    await putItem("plans", {
      id: existing ? existing.id : uid("plan"),
      name: els.planName.value.trim(),
      price: Number(els.planPrice.value),
      description: els.planDescription.value.trim(),
      paymentDay: 1,
      scheduleIds: existing?.scheduleIds || [],
      programId: selectedPlanRoute(),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    });
    resetPlanForm();
    await refreshState();
    showToast(existing ? "Plan actualizado." : "Plan guardado.");
  }

  function editPlan(planId) {
    const plan = state.plans.find((item) => item.id === planId);
    if (!plan) return;

    state.editingPlanId = plan.id;
    els.planFormTitle.textContent = "Modificar plan";
    els.savePlanButton.textContent = "Guardar cambios";
    els.cancelPlanEditButton.hidden = false;
    els.planName.value = plan.name || "";
    els.planPrice.value = plan.price || "";
    els.planDescription.value = plan.description || "";
    const routeInput = document.querySelector(`input[name='planRoute'][value='${plan.programId}']`);
    if (routeInput) routeInput.checked = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetPlanForm() {
    state.editingPlanId = null;
    els.planForm.reset();
    els.planFormTitle.textContent = "Finanzas";
    els.savePlanButton.textContent = "Guardar plan";
    els.cancelPlanEditButton.hidden = true;
    document.querySelector("input[name='planRoute'][value='yoga']").checked = true;
  }

  function openStatusDialog(type) {
    const status = getPaymentStatus();
    const rows = type === "upcoming" ? status.upcoming : status.expired;
    els.statusDialogKicker.textContent = type === "upcoming" ? "Próximos 7 días" : "Atrasados";
    els.statusDialogTitle.textContent = type === "upcoming" ? "Por vencer" : "Vencidos";
    if (!rows.length) {
      els.statusList.innerHTML = `<div class="empty-state">No hay clientes en esta categoría.</div>`;
    } else {
      els.statusList.innerHTML = rows.map((row) => `
        <button class="client-card status-client" type="button" data-client-id="${row.client.id}">
          <strong>${escapeHtml(displayName(row.client))}</strong>
          <span>${formatAge(row.client.age)} · ${programLabel(row.membership.programId)} · ${row.days >= 0 ? `${row.days} día${row.days === 1 ? "" : "s"} por vencer` : `${Math.abs(row.days)} día${Math.abs(row.days) === 1 ? "" : "s"} atrasado${Math.abs(row.days) === 1 ? "" : "s"}`}</span>
          <small>${escapeHtml(row.plan?.name || "Sin plan asignado")}</small>
        </button>
      `).join("");
      $$(".status-client").forEach((button) => button.addEventListener("click", () => openClient(button.dataset.clientId)));
    }
    els.statusDialog.showModal();
  }

  function openClient(clientId) {
    const client = state.clients.find((item) => item.id === clientId);
    if (!client) return;
    const membership = primaryMembership(client);
    const plan = planForMembership(membership);
    const payment = latestPayment(client.id, membership?.programId);
    const due = dueDateFor(membership, plan, payment);
    state.selectedClientId = client.id;
    els.clientDialogName.textContent = displayName(client);
    els.clientDialogDetails.innerHTML = `
      <div class="detail-item"><span>Áreas</span><strong>${normalizeMemberships(client).map((item) => programLabel(item.programId)).join("<br>") || "Sin área"}</strong></div>
      <div class="detail-item"><span>Edad</span><strong>${formatAge(client.age)}</strong></div>
      <div class="detail-item"><span>RUT</span><strong>${escapeHtml(client.rut || "Sin RUT")}</strong></div>
      <div class="detail-item"><span>Teléfono</span><strong>${escapeHtml(client.phone || "Sin teléfono")}</strong></div>
      <div class="detail-item"><span>Plan principal</span><strong>${escapeHtml(plan?.name || "Sin plan asignado")}</strong></div>
      <div class="detail-item"><span>Vencimiento</span><strong>${due ? formatDate(due) : "Sin fecha"}</strong></div>
      <div class="detail-item is-wide"><span>Complicaciones / notas</span><strong>${escapeHtml(client.complications || "Sin registros")}</strong></div>
    `;
    renderWhatsappButton(client);
    fillClientForm(client);
    fillPaymentForm(client, plan);
    renderClientHistory(client);
    if (els.statusDialog.open) els.statusDialog.close();
    if (!els.clientDialog.open) {
      els.clientDialog.showModal();
    }
  }

  function closeClientEditor() {
    if (typeof els.clientDialog.close === "function") {
      els.clientDialog.close();
    } else {
      els.clientDialog.removeAttribute("open");
    }
    state.selectedClientId = null;
    state.editingMemberships = [];
  }

  function renderWhatsappButton(client) {
    const phone = normalizePhone(client.phone);
    if (!phone) {
      els.clientWhatsappButton.hidden = true;
      els.clientWhatsappButton.removeAttribute("href");
      return;
    }
    els.clientWhatsappButton.hidden = false;
    els.clientWhatsappButton.href = `https://wa.me/${phone}`;
  }

  function inactiveClients(days) {
    const cutoff = startOfDay(new Date());
    cutoff.setDate(cutoff.getDate() - days);
    return state.clients.filter((client) => {
      const last = latestAttendance(client.id);
      return !last || parseDate(last.date) < cutoff;
    });
  }

  function latestAttendance(clientId) {
    return state.attendance
      .filter((item) => item.clientId === clientId)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  }

  function fillClientForm(client) {
    state.editingMemberships = normalizeMemberships(client);
    const firstMembership = state.editingMemberships[0] || { programId: "yoga", planId: "", paymentDate: "", schedules: [] };
    els.adminClientName.value = client.fullName || "";
    els.adminClientRut.value = client.rut || "";
    els.adminClientPhone.value = client.phone || "";
    els.adminClientAge.value = client.age || "";
    els.adminClientProgram.value = PROGRAMS[firstMembership.programId] ? firstMembership.programId : "yoga";
    renderMembershipEditor(firstMembership.programId);
    els.adminClientComplications.value = client.complications || "";
  }

  function fillPaymentForm(client, plan) {
    els.adminPaymentDate.value = todayInputValue();
    els.adminPaymentAmount.value = plan?.price || "";
    els.adminPaymentMethod.value = "Efectivo";
    els.adminPaymentNote.value = "";
  }

  function renderClientHistory(client) {
    const history = [
      ...state.payments
        .filter((payment) => payment.clientId === client.id)
        .map((payment) => ({
          date: payment.date,
          title: `Pago ${formatMoney(payment.amount)}`,
          detail: `${payment.method || "Sin método"}${payment.note ? ` · ${payment.note}` : ""}`,
        })),
      ...state.attendance
        .filter((attendance) => attendance.clientId === client.id)
        .map((attendance) => ({
          date: attendance.date,
          title: "Asistencia",
          detail: scheduleLabel(attendance.slotId || attendance.scheduleId) || "Clase registrada",
        })),
    ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12);

    els.clientHistory.innerHTML = history.length
      ? history.map((item) => `
          <article class="attendance-row history-row">
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <span>${formatDate(item.date)} · ${escapeHtml(item.detail)}</span>
            </div>
          </article>
        `).join("")
      : `<div class="empty-state">Sin historial todavía.</div>`;
  }

  function renderClientPlanOptions(client) {
    const programId = typeof client === "string" ? client : client.programId;
    const selectedPlanId = typeof client === "string" ? membershipDraftFor(programId)?.planId : client.planId;
    const plans = state.plans.filter((plan) => plan.programId === programId);
    if (!plans.length) {
      els.adminClientPlan.innerHTML = `<option value="">Sin planes para esta ruta</option>`;
      return;
    }
    els.adminClientPlan.innerHTML = `<option value="">Sin plan</option>${plans.map((plan) => `
      <option value="${plan.id}" ${selectedPlanId === plan.id ? "selected" : ""}>${escapeHtml(plan.name)} · ${formatMoney(plan.price)}</option>
    `).join("")}`;
  }

  function renderMembershipEditor(programId = els.adminClientProgram.value || "yoga") {
    const membership = membershipDraftFor(programId) || { programId, planId: "", paymentDate: "", schedules: [] };
    renderClientPlanOptions(programId);
    els.adminClientPlan.value = membership.planId || "";
    els.adminClientPaymentDate.value = membership.paymentDate || "";
    renderAdminScheduleOptions(programId, membership.schedules || []);
    renderMembershipList();
  }

  function membershipDraftFor(programId) {
    return state.editingMemberships.find((membership) => membership.programId === programId);
  }

  function renderAdminScheduleOptions(programId, selected = []) {
    const schedules = schedulesForProgram(programId);
    if (!schedules.length) {
      els.adminClientScheduleOptions.innerHTML = `<div class="empty-state">No hay horarios creados para esta área.</div>`;
      return;
    }
    els.adminClientScheduleOptions.innerHTML = schedules.map((schedule) => `
      <label class="schedule-option">
        <input type="checkbox" name="adminClientSchedule" value="${schedule.id}" ${selected.includes(schedule.id) ? "checked" : ""} />
        ${escapeHtml(scheduleLabel(schedule.id) || schedule.label || "Horario")}
      </label>
    `).join("");
  }

  function schedulesForProgram(programId) {
    if (programId === "yoga") return YOGA_SLOTS;
    return state.schedules.filter((schedule) => schedule.programId === programId);
  }

  function upsertMembershipDraft() {
    const programId = els.adminClientProgram.value;
    const schedules = $$("input[name='adminClientSchedule']:checked").map((input) => input.value);
    const existing = membershipDraftFor(programId);
    const membership = {
      id: existing?.id || uid("membership"),
      programId,
      planId: els.adminClientPlan.value,
      paymentDate: els.adminClientPaymentDate.value,
      schedules,
    };
    state.editingMemberships = [
      ...state.editingMemberships.filter((item) => item.programId !== programId),
      membership,
    ];
    renderMembershipEditor(programId);
    showToast("Área actualizada en la ficha.");
  }

  function removeMembershipDraft(programId) {
    if (state.editingMemberships.length <= 1) {
      showToast("El cliente debe tener al menos un área.");
      return;
    }
    state.editingMemberships = state.editingMemberships.filter((membership) => membership.programId !== programId);
    els.adminClientProgram.value = state.editingMemberships[0]?.programId || "yoga";
    renderMembershipEditor(els.adminClientProgram.value);
  }

  function renderMembershipList() {
    if (!state.editingMemberships.length) {
      els.adminMembershipList.innerHTML = `<div class="empty-state">Agrega al menos un área.</div>`;
      return;
    }
    els.adminMembershipList.innerHTML = state.editingMemberships.map((membership) => {
      const plan = planForMembership(membership);
      return `
        <article class="membership-row">
          <button type="button" data-edit-membership="${membership.programId}">
            <strong>${programLabel(membership.programId)}</strong>
            <span>${escapeHtml(plan?.name || "Sin plan")} · ${membership.paymentDate ? formatDate(parseDate(membership.paymentDate)) : "Sin fecha"} · ${membership.schedules.length} horario${membership.schedules.length === 1 ? "" : "s"}</span>
          </button>
          <button class="danger-button mini-danger" type="button" data-remove-membership="${membership.programId}">Quitar</button>
        </article>
      `;
    }).join("");
    $$("[data-edit-membership]").forEach((button) => {
      button.addEventListener("click", () => {
        els.adminClientProgram.value = button.dataset.editMembership;
        renderMembershipEditor(button.dataset.editMembership);
      });
    });
    $$("[data-remove-membership]").forEach((button) => {
      button.addEventListener("click", () => removeMembershipDraft(button.dataset.removeMembership));
    });
  }

  async function saveAdminClient(event) {
    event.preventDefault();
    const client = state.clients.find((item) => item.id === state.selectedClientId);
    if (!client) return;
    if (!state.editingMemberships.length) {
      showToast("Agrega al menos un área al cliente.");
      return;
    }
    const memberships = state.editingMemberships.map((membership) => ({
      id: membership.id || uid("membership"),
      programId: membership.programId,
      planId: membership.planId || "",
      paymentDate: membership.paymentDate || "",
      schedules: Array.isArray(membership.schedules) ? membership.schedules : [],
    }));
    const primary = memberships[0];

    await putItem("clients", {
      ...client,
      fullName: els.adminClientName.value.trim(),
      rut: els.adminClientRut.value.trim(),
      phone: els.adminClientPhone.value.trim(),
      age: els.adminClientAge.value ? Number(els.adminClientAge.value) : "",
      programId: primary.programId,
      planId: primary.planId,
      paymentDate: primary.paymentDate,
      schedules: primary.schedules,
      memberships,
      complications: els.adminClientComplications.value.trim(),
      updatedAt: new Date().toISOString(),
    });
    closeClientEditor();
    await refreshState();
    showToast("Cliente actualizado.");
  }

  async function saveAdminPayment(event) {
    event.preventDefault();
    const client = state.clients.find((item) => item.id === state.selectedClientId);
    if (!client) return;
    const programId = els.adminClientProgram.value || primaryMembership(client)?.programId || client.programId;
    await putItem("payments", {
      id: uid("payment"),
      programId,
      clientId: client.id,
      date: els.adminPaymentDate.value,
      amount: Number(els.adminPaymentAmount.value),
      method: els.adminPaymentMethod.value,
      note: els.adminPaymentNote.value.trim(),
      createdAt: new Date().toISOString(),
    });
    await refreshState();
    openClient(client.id);
    showToast("Pago registrado.");
  }

  async function deleteAdminClient() {
    const client = state.clients.find((item) => item.id === state.selectedClientId);
    if (!client) return;
    const ok = window.confirm(`¿Eliminar a ${displayName(client)}? También se borrarán sus pagos y asistencias.`);
    if (!ok) return;

    const relatedAttendance = state.attendance.filter((item) => item.clientId === client.id);
    const relatedPayments = state.payments.filter((item) => item.clientId === client.id);
    await Promise.all([
      deleteItem("clients", client.id),
      ...relatedAttendance.map((item) => deleteItem("attendance", item.id)),
      ...relatedPayments.map((item) => deleteItem("payments", item.id)),
    ]);
    closeClientEditor();
    await refreshState();
    showToast("Cliente eliminado.");
  }

  function switchTab(tabName) {
    els.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.adminTab === tabName));
    els.views.forEach((view) => view.classList.toggle("is-active", view.id === `${tabName}View`));
  }

  function metricCard(title, value, detail) {
    return `
      <article class="admin-card metric-card">
        <span>${title}</span>
        <strong>${value}</strong>
        <small>${detail}</small>
      </article>
    `;
  }

  function monthPayments() {
    const currentMonth = monthKey(todayInputValue());
    return state.payments
      .filter((payment) => monthKey(payment.date) === currentMonth)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  }

  function programLabel(programId) {
    return PROGRAMS[programId] || "Sin área";
  }

  function routeInitial(programId) {
    if (programId === "yoga" || programId === "pilates") return "🧘";
    if (programId === "boxeo") return "🥊";
    if (programId === "pesas") {
      return `
        <svg class="route-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2.75 9.25h2.5v5.5h-2.5a1 1 0 0 1-1-1v-3.5a1 1 0 0 1 1-1Z"></path>
          <path d="M6.25 7.5h2.5v9h-2.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z"></path>
          <path d="M8.75 11h6.5v2h-6.5z"></path>
          <path d="M15.25 7.5h2.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-2.5z"></path>
          <path d="M18.75 9.25h2.5a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-2.5z"></path>
        </svg>
      `;
    }
    return "?";
  }

  function selectedPlanRoute() {
    return document.querySelector("input[name='planRoute']:checked")?.value || "yoga";
  }

  function scheduleLabel(scheduleId) {
    const yogaSlot = YOGA_SLOTS.find((item) => item.id === scheduleId);
    if (yogaSlot) return yogaSlot.label;
    const schedule = state.schedules.find((item) => item.id === scheduleId);
    if (!schedule) return "";
    if (schedule.label) return schedule.label;
    return `${dayLabel(schedule.day)} ${schedule.start || ""}${schedule.end ? `-${schedule.end}` : ""}`.trim();
  }

  function dayLabel(day) {
    return ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][Number(day)] || "";
  }

  function displayName(client) {
    return client.fullName || `Cliente ${client.rut || ""}`.trim();
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

  function todayInputValue() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  }

  function parseDate(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return startOfDay(new Date(year, month - 1, day));
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function monthKey(dateValue) {
    return String(dateValue || "").slice(0, 7);
  }

  function formatDate(date) {
    return date.toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function normalizePhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("56")) return digits;
    if (digits.length === 9) return `56${digits}`;
    return digits;
  }

  function whatsappQuickLink(client) {
    const phone = normalizePhone(client.phone);
    const icon = whatsappIconSvg();
    if (!phone) {
      return `<span class="whatsapp-quick is-disabled" aria-label="Sin teléfono">${icon}</span>`;
    }
    return `
      <a
        class="whatsapp-quick"
        href="https://wa.me/${phone}"
        target="_blank"
        rel="noopener"
        aria-label="Abrir WhatsApp de ${escapeHtml(displayName(client))}"
        title="WhatsApp"
      >${icon}</a>
    `;
  }

  function whatsappIconSvg() {
    return `
      <svg class="whatsapp-svg" viewBox="0 0 64 64" aria-hidden="true">
        <path class="whatsapp-border" d="M31.65 7.1c-13.56 0-24.58 10.74-24.58 23.95 0 4.25 1.15 8.37 3.34 11.99L6.05 58.2l15.77-4.04a25.3 25.3 0 0 0 9.83 1.96c13.56 0 24.59-10.74 24.59-23.95S45.21 7.1 31.65 7.1Z"></path>
        <path class="whatsapp-bubble" d="M31.67 11.75c-11.08 0-20.1 8.73-20.1 19.46 0 3.85 1.17 7.53 3.36 10.69l-2.7 9.3 9.78-2.5a20.9 20.9 0 0 0 9.66 2.35c11.09 0 20.1-8.73 20.1-19.47s-9.01-19.83-20.1-19.83Z"></path>
        <path class="whatsapp-mark" d="M23.38 20.13c-.5-1.1-1.03-1.12-1.5-1.14h-1.28c-.44 0-1.15.16-1.76.8-.6.64-2.3 2.2-2.3 5.37s2.36 6.24 2.7 6.67c.33.43 4.62 7.13 11.39 9.68 5.64 2.13 6.8 1.7 8.03 1.6 1.22-.1 3.95-1.58 4.5-3.12.55-1.52.55-2.82.38-3.1-.16-.27-.6-.43-1.26-.75-.66-.32-3.94-1.9-4.55-2.12-.6-.21-1.04-.32-1.48.32-.44.65-1.7 2.12-2.1 2.55-.38.43-.77.48-1.43.16-.66-.32-2.8-1-5.34-3.2-1.97-1.71-3.3-3.82-3.69-4.47-.38-.64-.04-.99.3-1.3.3-.3.65-.76.98-1.13.33-.38.44-.65.66-1.08.22-.43.11-.8-.05-1.13-.17-.32-1.46-3.58-2.2-4.57Z"></path>
      </svg>
    `;
  }

  function bindQuickWhatsappLinks() {
    $$(".whatsapp-quick[href]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.stopPropagation();
      });
    });
  }

  function renderGlobalSearch() {
    const query = normalizeText(els.globalSearch.value);
    if (!query) {
      els.globalSearchResults.hidden = true;
      els.globalSearchResults.innerHTML = "";
      return;
    }
    const results = state.clients
      .filter((client) => normalizeText(`${displayName(client)} ${client.phone || ""} ${client.rut || ""}`).includes(query))
      .slice(0, 8);

    els.globalSearchResults.hidden = false;
    els.globalSearchResults.innerHTML = results.length
      ? results.map((client) => {
          const memberships = normalizeMemberships(client);
          return `
          <article class="attendance-row row-with-actions">
            <button class="row-main search-result-row" type="button" data-client-id="${client.id}">
              <strong>${escapeHtml(displayName(client))}</strong>
              <span>${memberships.map((membership) => programLabel(membership.programId)).join(" / ")} · ${client.phone ? escapeHtml(client.phone) : "Sin teléfono"}</span>
            </button>
            <span class="row-tools">
              ${whatsappQuickLink(client)}
              ${memberships.map((membership) => `<small class="route-icon ${membership.programId}" aria-label="${programLabel(membership.programId)}">${routeInitial(membership.programId)}</small>`).join("")}
            </span>
          </article>
        `;
        }).join("")
      : `<div class="empty-state">Sin resultados.</div>`;
    $$("#globalSearchResults .search-result-row").forEach((button) => {
      button.addEventListener("click", () => {
        els.globalSearch.value = "";
        els.globalSearchResults.hidden = true;
        openClient(button.dataset.clientId);
      });
    });
    bindQuickWhatsappLinks();
  }

  async function exportBackup() {
    const payload = {
      exportedAt: new Date().toISOString(),
      clients: state.clients,
      attendance: state.attendance,
      payments: state.payments,
      schedules: state.schedules,
      plans: state.plans,
    };
    const filename = `hidalgo-gym-respaldo-${todayInputValue()}.json`;
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });

    els.backupFilename.textContent = filename;
    els.backupText.value = json;

    try {
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: "Respaldo JSON", accept: { "application/json": [".json"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        showToast("Respaldo guardado.");
        return;
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        showToast("Guardado cancelado.");
        return;
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      link.remove();
    }, 1500);

    if (!els.backupDialog.open) els.backupDialog.showModal();
    showToast("Respaldo listo. Si no aparece en Descargas, usa Copiar respaldo.");
  }

  async function copyBackupText() {
    try {
      await navigator.clipboard.writeText(els.backupText.value);
      showToast("Respaldo copiado.");
    } catch {
      els.backupText.focus();
      els.backupText.select();
      showToast("Seleccioné el respaldo para copiarlo.");
    }
  }

  async function importBackupFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast("Respaldo demasiado grande.");
      els.importBackupInput.value = "";
      return;
    }
    try {
      const payload = JSON.parse(await file.text());
      const stores = ["clients", "attendance", "payments", "schedules", "plans"];
      for (const storeName of stores) {
        const rows = Array.isArray(payload[storeName]) ? payload[storeName] : [];
        if (rows.length > 5000) throw new Error("Too many rows");
        for (const row of rows) {
          if (row && typeof row === "object" && !Array.isArray(row) && typeof row.id === "string" && row.id.length <= 120) {
            await putItem(storeName, { ...row });
          }
        }
      }
      await refreshState();
      showToast("Respaldo importado y combinado.");
    } catch (error) {
      console.error(error);
      showToast("No se pudo importar ese respaldo.");
    } finally {
      els.importBackupInput.value = "";
    }
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2200);
  }

  function bindEvents() {
    if (state.eventsBound) return;
    state.eventsBound = true;
    els.tabs.forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.adminTab)));
    els.planForm.addEventListener("submit", savePlan);
    els.globalSearch.addEventListener("input", renderGlobalSearch);
    els.exportBackupButton.addEventListener("click", exportBackup);
    els.importBackupButton.addEventListener("click", () => els.importBackupInput.click());
    els.importBackupInput.addEventListener("change", importBackupFile);
    els.plannerMonth.addEventListener("change", renderPlanner);
    els.plannerSearch.addEventListener("input", renderPlanner);
    els.plannerRouteFilter.addEventListener("change", renderPlanner);
    els.plannerStatusFilter.addEventListener("change", renderPlanner);
    els.cancelPlanEditButton.addEventListener("click", resetPlanForm);
    els.upcomingButton.addEventListener("click", () => openStatusDialog("upcoming"));
    els.expiredButton.addEventListener("click", () => openStatusDialog("expired"));
    els.closeStatusDialog.addEventListener("click", () => els.statusDialog.close());
    els.closeClientDialog.addEventListener("click", closeClientEditor);
    els.closeBackupDialog.addEventListener("click", () => els.backupDialog.close());
    els.closeBackupButton.addEventListener("click", () => els.backupDialog.close());
    els.copyBackupButton.addEventListener("click", copyBackupText);
    els.adminClientProgram.addEventListener("change", () => {
      renderMembershipEditor(els.adminClientProgram.value);
    });
    els.upsertMembershipButton.addEventListener("click", upsertMembershipDraft);
    els.adminClientForm.addEventListener("submit", saveAdminClient);
    els.adminPaymentForm.addEventListener("submit", saveAdminPayment);
    els.deleteAdminClientButton.addEventListener("click", deleteAdminClient);
  }

  async function startAdmin() {
    bindEvents();
    els.plannerMonth.value = monthKey(todayInputValue());
    db = await openDatabase();
    await migrateLegacyYogaData();
    await refreshState();
    window.setInterval(refreshState, 5000);
    window.addEventListener("focus", refreshState);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshState();
    });
  }

  async function init() {
    els.securityForm.addEventListener("submit", unlockAdmin);
    if (!isAdminUnlocked()) {
      showAdminLock();
      return;
    }
    hideAdminLock();
    await startAdmin();
  }

  init().catch((error) => {
    console.error(error);
    els.actionList.innerHTML = `<div class="empty-state">No se pudo cargar el panel administrador.</div>`;
  });
})();
