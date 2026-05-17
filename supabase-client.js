(function () {
  const config = window.HIDALGO_SUPABASE || {};
  const SESSION_KEY = "hidalgo-gym-supabase-session";
  let loginPromise = null;

  function isConfigured() {
    return Boolean(config.url && config.key);
  }

  function session() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function isReady() {
    return isConfigured() && Boolean(session()?.access_token);
  }

  function setSession(value) {
    if (!value) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  }

  function authHeaders(prefer = "return=representation") {
    const token = session()?.access_token || config.key;
    return {
      apikey: config.key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    };
  }

  async function request(path, options = {}) {
    if (!isConfigured()) throw new Error("Supabase no configurado");
    let response = await fetch(`${config.url}${path}`, {
      ...options,
      headers: {
        ...authHeaders(options.prefer),
        ...(options.headers || {}),
      },
    });
    if (response.status === 401 && session()?.refresh_token) {
      await refreshSession();
      response = await fetch(`${config.url}${path}`, {
        ...options,
        headers: {
          ...authHeaders(options.prefer),
          ...(options.headers || {}),
        },
      });
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Supabase ${response.status}`);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function signIn(email, password) {
    if (!isConfigured()) throw new Error("Supabase no configurado");
    const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: config.key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error_description || payload.msg || "No se pudo iniciar sesion");
    setSession(payload);
    return payload;
  }

  async function refreshSession() {
    const current = session();
    if (!current?.refresh_token) throw new Error("Sesion expirada");
    const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: config.key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: current.refresh_token }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setSession(null);
      throw new Error("Sesion expirada");
    }
    setSession(payload);
    return payload;
  }

  async function signOut() {
    setSession(null);
    window.location.reload();
  }

  function ensureLoginMarkup(title = "Hidalgo GYM") {
    let lock = document.querySelector("#cloudLoginLock");
    if (lock) return lock;
    lock = document.createElement("section");
    lock.id = "cloudLoginLock";
    lock.className = "cloud-login-lock";
    lock.innerHTML = `
      <form class="cloud-login-card" id="cloudLoginForm">
        <p class="eyebrow">Base de datos online</p>
        <h1>${escapeHtml(title)}</h1>
        <p>Ingresa con el usuario creado en Supabase.</p>
        <label>
          Correo
          <input id="cloudLoginEmail" type="email" autocomplete="username" required />
        </label>
        <label>
          Clave
          <input id="cloudLoginPassword" type="password" autocomplete="current-password" required />
        </label>
        <p class="security-message" id="cloudLoginMessage" role="status"></p>
        <button class="primary-button" type="submit">Entrar</button>
      </form>
    `;
    document.body.prepend(lock);
    return lock;
  }

  async function requireLogin(options = {}) {
    if (!isConfigured()) return false;
    if (isReady()) return true;
    if (loginPromise) return loginPromise;

    loginPromise = new Promise((resolve) => {
      const lock = ensureLoginMarkup(options.title || "Hidalgo GYM");
      document.body.classList.add("cloud-locked");
      const form = lock.querySelector("#cloudLoginForm");
      const email = lock.querySelector("#cloudLoginEmail");
      const password = lock.querySelector("#cloudLoginPassword");
      const message = lock.querySelector("#cloudLoginMessage");
      window.setTimeout(() => email.focus(), 80);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        message.textContent = "";
        try {
          await signIn(email.value.trim(), password.value);
          password.value = "";
          document.body.classList.remove("cloud-locked");
          lock.remove();
          resolve(true);
        } catch {
          password.value = "";
          message.textContent = "Correo o clave incorrectos.";
        }
      });
    });
    return loginPromise;
  }

  async function select(table, query = "select=*") {
    return request(`/rest/v1/${table}?${query}`);
  }

  async function upsert(table, rows, onConflict = "id") {
    return request(`/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
    });
  }

  async function remove(table, id) {
    return request(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      prefer: "return=minimal",
    });
  }

  async function all(storeName) {
    if (storeName === "clients") return loadClients();
    if (storeName === "plans") return (await select("plans")).map(fromPlan);
    if (storeName === "schedules") return (await select("schedules")).map(fromSchedule);
    if (storeName === "attendance") return (await select("attendance")).map(fromAttendance);
    if (storeName === "payments") return (await select("payments")).map(fromPayment);
    return [];
  }

  async function put(storeName, item) {
    if (storeName === "clients") return putClient(item);
    if (storeName === "plans") return upsert("plans", toPlan(item));
    if (storeName === "schedules") return upsert("schedules", toSchedule(item));
    if (storeName === "attendance") return upsert("attendance", toAttendance(item));
    if (storeName === "payments") return upsert("payments", toPayment(item));
    return null;
  }

  async function del(storeName, id) {
    const table = storeName === "attendance" ? "attendance" : storeName;
    return remove(table, id);
  }

  async function loadClients() {
    const [clients, memberships] = await Promise.all([select("clients"), select("memberships")]);
    return clients.map((client) => fromClient(client, memberships.filter((item) => item.client_id === client.id)));
  }

  async function putClient(item) {
    const memberships = normalizeMemberships(item);
    const primary = memberships[0] || {};
    await upsert("clients", toClient(item, primary));
    if (memberships.length) {
      await upsert("memberships", memberships.map((membership) => toMembership(membership, item.id)), "client_id,program_id");
    }
    return item;
  }

  function toClient(item, primary = {}) {
    return {
      id: item.id,
      full_name: item.fullName || "",
      rut: item.rut || "",
      phone: item.phone || "",
      sex: item.sex || "",
      age: item.age || null,
      complications: item.complications || "",
      updated_at: item.updatedAt || new Date().toISOString(),
    };
  }

  function fromClient(row, memberships) {
    const mappedMemberships = memberships.map(fromMembership);
    const primary = mappedMemberships[0] || {};
    return {
      id: row.id,
      programId: primary.programId || "yoga",
      fullName: row.full_name || "",
      rut: row.rut || "",
      phone: row.phone || "",
      sex: row.sex || "",
      age: row.age || "",
      complications: row.complications || "",
      schedules: primary.schedules || [],
      planId: primary.planId || "",
      paymentDate: primary.paymentDate || "",
      memberships: mappedMemberships,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function normalizeMemberships(client) {
    if (Array.isArray(client.memberships) && client.memberships.length) return client.memberships;
    return [
      {
        id: `${client.id || crypto.randomUUID()}-${client.programId || "yoga"}`,
        programId: client.programId || "yoga",
        planId: client.planId || "",
        paymentDate: client.paymentDate || "",
        schedules: Array.isArray(client.schedules) ? client.schedules : [],
      },
    ];
  }

  function toMembership(membership, clientId) {
    return {
      id: membership.id || `${clientId}-${membership.programId}`,
      client_id: clientId,
      program_id: membership.programId,
      plan_id: membership.planId || null,
      payment_date: membership.paymentDate || null,
      schedule_ids: Array.isArray(membership.schedules) ? membership.schedules : [],
      updated_at: new Date().toISOString(),
    };
  }

  function fromMembership(row) {
    return {
      id: row.id,
      programId: row.program_id,
      planId: row.plan_id || "",
      paymentDate: row.payment_date || "",
      schedules: Array.isArray(row.schedule_ids) ? row.schedule_ids : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function toPlan(item) {
    return {
      id: item.id,
      program_id: item.programId,
      name: item.name || "",
      price: Number(item.price || 0),
      description: item.description || "",
      payment_day: Number(item.paymentDay || 1),
      updated_at: item.updatedAt || new Date().toISOString(),
    };
  }

  function fromPlan(row) {
    return {
      id: row.id,
      programId: row.program_id,
      name: row.name || "",
      price: row.price || 0,
      description: row.description || "",
      paymentDay: row.payment_day || 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function toSchedule(item) {
    return {
      id: item.id,
      program_id: item.programId,
      name: item.name || "",
      day: Number(item.day || 0),
      start_time: item.start || item.startTime || "00:00",
      end_time: item.end || item.endTime || "00:00",
      updated_at: item.updatedAt || new Date().toISOString(),
    };
  }

  function fromSchedule(row) {
    return {
      id: row.id,
      programId: row.program_id,
      name: row.name || "",
      day: row.day,
      start: String(row.start_time || "").slice(0, 5),
      end: String(row.end_time || "").slice(0, 5),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function toAttendance(item) {
    const slotId = item.slotId || item.scheduleId || item.localSlotId || "";
    return {
      id: item.id,
      program_id: item.programId,
      attendance_date: item.date,
      schedule_id: slotId || null,
      local_slot_id: slotId,
      client_id: item.clientId,
      created_at: item.createdAt || new Date().toISOString(),
    };
  }

  function fromAttendance(row) {
    return {
      id: row.id,
      programId: row.program_id,
      date: row.attendance_date,
      slotId: row.local_slot_id || row.schedule_id || "",
      scheduleId: row.schedule_id || row.local_slot_id || "",
      clientId: row.client_id,
      createdAt: row.created_at,
    };
  }

  function toPayment(item) {
    return {
      id: item.id,
      program_id: item.programId,
      client_id: item.clientId,
      payment_date: item.date,
      amount: Number(item.amount || 0),
      method: item.method || "Efectivo",
      note: item.note || "",
      created_at: item.createdAt || new Date().toISOString(),
    };
  }

  function fromPayment(row) {
    return {
      id: row.id,
      programId: row.program_id,
      clientId: row.client_id,
      date: row.payment_date,
      amount: row.amount || 0,
      method: row.method || "Efectivo",
      note: row.note || "",
      createdAt: row.created_at,
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  window.HidalgoCloud = {
    isConfigured,
    isReady,
    session,
    requireLogin,
    signIn,
    signOut,
    select,
    upsert,
    remove,
    all,
    put,
    delete: del,
  };
})();
