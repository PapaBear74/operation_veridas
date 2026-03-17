(() => {
  const API_BASE = "";

  const opinionForm = document.getElementById("opinionForm");
  const topicSelect = document.getElementById("topicSelect");
  const topicSelectDisplay = document.getElementById("topicSelectDisplay");
  const adminTopicActions = document.getElementById("adminTopicActions");
  const approveTopicBtn = document.getElementById("approveTopicBtn");
  const deleteTopicBtn = document.getElementById("deleteTopicBtn");
  const newTopicInput = document.getElementById("newTopicInput");
  const createTopicBtn = document.getElementById("createTopicBtn");
  const argumentInput = document.getElementById("argumentInput");
  const proList = document.getElementById("proList");
  const contraList = document.getElementById("contraList");
  const emptyState = document.getElementById("emptyState");
  const toast = document.getElementById("toast");
  const boardLoading = document.getElementById("boardLoading");
  const loginOverlay = document.getElementById("loginOverlay");
  const loginForm = document.getElementById("loginForm");
  const loginPasswordInput = document.getElementById("loginPasswordInput");
  const loginError = document.getElementById("loginError");
  const loginSubmitBtn = document.getElementById("loginSubmitBtn");

  /** @typedef {"pro" | "contra"} Side */
  /** @typedef {{id:string, side:Side, text:string, createdAt:number}} Argument */
  /** @typedef {{id:string, title:string, createdAt:number}} Topic */
  /** @typedef {{id:string, summaryDate:string, summaryText:string}} Summary */

  /** @type {Topic[]} */
  let topics = [];
  /** @type {string|null} */
  let selectedTopicId = null;
  /** @type {Argument[]} */
  let arguments_ = [];
  /** @type {Summary[]} */
  let summaries = [];
  /** @type {string} */
  let sessionPassword = "";
  /** @type {boolean} */
  let isAdmin = false;

  async function api(path, options = {}) {
    const res = await fetch(API_BASE + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(sessionPassword ? { "x-board-password": sessionPassword } : {}),
        ...options.headers,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const error = new Error(err.error || res.statusText);
      error.status = res.status;
      throw error;
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function setLoginVisible(visible) {
    if (!loginOverlay) return;
    loginOverlay.style.display = visible ? "flex" : "none";
  }

  function setLoginError(message) {
    if (!loginError) return;
    loginError.textContent = message ?? "";
  }

  async function loginWithPassword(password) {
    sessionPassword = password;
    await loadTopics();
    if (selectedTopicId) {
      await loadArguments(selectedTopicId);
      await loadSummaries(selectedTopicId);
    } else {
      arguments_ = [];
      summaries = [];
    }
    render();
  }

  function askForTopicPassword(defaultValue = "") {
    const entered = window.prompt(
      "Enter a password for this requested topic.\nThis password can be used for multiple topics.",
      defaultValue
    );
    if (entered === null) return null;
    return String(entered).trim();
  }

  async function loadTopics() {
    topics = await api("/api/topics");
    if (topics.length && !selectedTopicId) selectedTopicId = topics[0].id;
    if (selectedTopicId && !topics.find((t) => t.id === selectedTopicId)) {
      selectedTopicId = topics[0]?.id ?? null;
    }
  }

  async function loadAdminStatus() {
    const data = await api("/api/topics/me");
    isAdmin = Boolean(data?.isAdmin);
  }

  async function loadArguments(topicId) {
    if (!topicId) return [];
    arguments_ = await api(`/api/topics/${topicId}/arguments`);
    return arguments_;
  }

  async function loadSummaries(topicId) {
    if (!topicId) return [];
    summaries = await api(`/api/topics/${topicId}/summaries`);
    return summaries;
  }

  function formatDateShort(dateStr) {
    try {
      return new Date(dateStr + "T12:00:00").toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    } catch {
      return dateStr;
    }
  }

  let toastTimer = null;
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 1600);
  }

  function setEmptyStateVisible(isVisible) {
    emptyState.style.display = isVisible ? "block" : "none";
  }

  function getSelectedTopic() {
    if (!topics.length) return null;
    const found = selectedTopicId ? topics.find((t) => t.id === selectedTopicId) : null;
    return found ?? topics[0];
  }

  function renderTopicSelectDisplay() {
    if (!topicSelectDisplay || !topicSelect) return;
    const selectedOption = topicSelect.selectedOptions?.[0];
    topicSelectDisplay.textContent = selectedOption?.textContent ?? "";
  }

  function renderTopics(selectedTopic) {
    topicSelect.innerHTML = "";

    if (topics.length === 0) {
      topicSelect.disabled = true;
      renderTopicSelectDisplay();
      return;
    }

    topicSelect.disabled = false;

    const frag = document.createDocumentFragment();
    for (const t of topics) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = isAdmin && !t.approved ? `${t.title} (pending)` : t.title;
      frag.appendChild(opt);
    }
    topicSelect.appendChild(frag);

    const idToSelect = selectedTopic?.id ?? topics[0].id;
    topicSelect.value = idToSelect;
    renderTopicSelectDisplay();
  }

  function renderArgumentCard(topicId, arg, options = {}) {
    const { showDelete = false } = options;
    const li = document.createElement("li");
    li.className = "noteCard argumentCard";
    li.classList.add(arg.side === "contra" ? "argumentContra" : "argumentPro");
    li.dataset.topicId = topicId;
    li.dataset.argumentId = arg.id;

    const body = document.createElement("p");
    body.className = "noteBody";
    body.textContent = arg.text;
    li.appendChild(body);

    if (showDelete) {
      const actions = document.createElement("div");
      actions.className = "argumentActions";

      const spacer = document.createElement("span");
      spacer.className = "muted";
      spacer.textContent = "";
      actions.appendChild(spacer);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "iconBtn iconBtnDanger";
      deleteBtn.dataset.action = "delete-argument";
      deleteBtn.dataset.topicId = topicId;
      deleteBtn.dataset.argumentId = arg.id;
      deleteBtn.textContent = "Delete";
      actions.appendChild(deleteBtn);

      li.appendChild(actions);
    }

    return li;
  }

  function renderBoard(selectedTopic) {
    proList.innerHTML = "";
    contraList.innerHTML = "";

    if (!selectedTopic) return;

    const proFrag = document.createDocumentFragment();
    const contraFrag = document.createDocumentFragment();

    // Versuche zuerst, komprimierte Argumente aus der neuesten Summary zu verwenden
    let usedCompressed = false;
    if (!isAdmin && summaries.length > 0) {
      const latest = summaries[0];
      try {
        const parsed = JSON.parse(latest.summaryText);
        const proCompressed = Array.isArray(parsed.pro) ? parsed.pro : [];
        const contraCompressed = Array.isArray(parsed.contra) ? parsed.contra : [];

        for (let i = 0; i < proCompressed.length; i++) {
            const text = String(proCompressed[i]).trim();
            if (!text) continue;
            const arg = {
              id: `summary-pro-${i}`,
              side: "pro",
              text,
              createdAt: Date.now(),
            };
            const card = renderArgumentCard(selectedTopic.id, arg);
            proFrag.appendChild(card);
          }

          for (let i = 0; i < contraCompressed.length; i++) {
            const text = String(contraCompressed[i]).trim();
            if (!text) continue;
            const arg = {
              id: `summary-contra-${i}`,
              side: "contra",
              text,
              createdAt: Date.now(),
            };
            const card = renderArgumentCard(selectedTopic.id, arg);
            contraFrag.appendChild(card);
          }

          usedCompressed = true;
      } catch {
        // summaryText war kein JSON – dann fallen wir unten auf die Original-Argumente zurück
      }
    }

    // Fallback: normale, nicht komprimierte Argumente anzeigen
    if (!usedCompressed) {
      for (const arg of arguments_) {
        const card = renderArgumentCard(selectedTopic.id, arg, { showDelete: isAdmin });
        if (arg.side === "contra") contraFrag.appendChild(card);
        else proFrag.appendChild(card);
      }
    }

    proList.appendChild(proFrag);
    contraList.appendChild(contraFrag);
  }

  function showBoardLoading(visible) {
    if (boardLoading) {
      boardLoading.style.display = visible ? "flex" : "none";
    }
  }

  function render() {
    const selectedTopic = getSelectedTopic();

    renderTopics(selectedTopic);

    const hasTopic = Boolean(selectedTopic);
    argumentInput.disabled = !hasTopic;
    opinionForm.querySelector('button[type="submit"]').disabled = !hasTopic;

    if (adminTopicActions) {
      adminTopicActions.style.display = isAdmin ? "flex" : "none";
    }
    if (approveTopicBtn) {
      approveTopicBtn.disabled = !isAdmin || !hasTopic || Boolean(selectedTopic?.approved);
      approveTopicBtn.textContent = selectedTopic?.approved ? "Approved" : "Approve";
    }
    if (deleteTopicBtn) {
      deleteTopicBtn.disabled = !isAdmin || !hasTopic;
    }

    renderBoard(selectedTopic);

    if (!topics.length) {
      emptyState.textContent = "No topics yet. Request one below.";
      setEmptyStateVisible(true);
    } else if (selectedTopic && arguments_.length === 0 && summaries.length === 0) {
      emptyState.textContent = "No arguments yet. Write the first one.";
      setEmptyStateVisible(true);
    } else {
      setEmptyStateVisible(false);
    }
  }

  async function createTopic(title) {
    const trimmed = String(title ?? "").trim();
    if (!trimmed) {
      showToast("Topic title can't be empty");
      return;
    }
    const topicPassword = askForTopicPassword(sessionPassword);
    if (topicPassword === null) {
      showToast("Topic request cancelled");
      return;
    }
    if (!topicPassword) {
      showToast("Topic password can't be empty");
      return;
    }

    try {
      await api("/api/topics", {
        method: "POST",
        body: JSON.stringify({ title: trimmed, password: topicPassword }),
      });
      await loadTopics();
      selectedTopicId = topics[0]?.id ?? null;
      await loadArguments(selectedTopicId);
      await loadSummaries(selectedTopicId);
      render();
      showToast("Topic submitted. It will appear after approval.");
    } catch (err) {
      showToast(err.message || "Failed to create topic");
      console.error(err);
    }
  }

  async function addArgument(topicId, side, text) {
    const topic = topics.find((t) => t.id === topicId);
    if (!topic) {
      showToast("Create or select a topic first");
      return;
    }

    const trimmed = String(text ?? "").trim();
    if (!trimmed) {
      showToast("Argument can't be empty");
      return;
    }

    const safeSide = side === "contra" ? "contra" : "pro";

    showBoardLoading(true);

    try {
      await api(`/api/topics/${topicId}/arguments`, {
        method: "POST",
        body: JSON.stringify({ side: safeSide, text: trimmed }),
      });
      await loadArguments(topicId);
      await loadSummaries(topicId);
      render();
      showToast("Argument posted");
    } catch (err) {
      showToast("Failed to post argument");
      console.error(err);
    } finally {
      showBoardLoading(false);
    }
  }

  async function approveTopic(topicId) {
    if (!isAdmin) return;
    try {
      await api(`/api/topics/${topicId}/approval`, {
        method: "PATCH",
        body: JSON.stringify({ approved: true }),
      });
      await loadTopics();
      selectedTopicId = topicId;
      await loadArguments(topicId);
      await loadSummaries(topicId);
      render();
      showToast("Topic freigegeben");
    } catch (err) {
      showToast(err.message || "Freigabe fehlgeschlagen");
      console.error(err);
    }
  }

  async function deleteTopic(topicId) {
    if (!isAdmin) return;
    try {
      await api(`/api/topics/${topicId}`, { method: "DELETE" });
      await loadTopics();
      selectedTopicId = topics[0]?.id ?? null;
      if (selectedTopicId) {
        await loadArguments(selectedTopicId);
        await loadSummaries(selectedTopicId);
      } else {
        arguments_ = [];
        summaries = [];
      }
      render();
      showToast("Topic geloescht");
    } catch (err) {
      showToast(err.message || "Loeschen fehlgeschlagen");
      console.error(err);
    }
  }

  async function deleteArgument(topicId, argumentId) {
    if (!isAdmin) return;
    try {
      await api(`/api/topics/${topicId}/arguments/${argumentId}`, { method: "DELETE" });
      await loadArguments(topicId);
      await loadSummaries(topicId);
      render();
      showToast("Argument geloescht");
    } catch (err) {
      showToast(err.message || "Argument konnte nicht geloescht werden");
      console.error(err);
    }
  }

  async function onTopicChange() {
    selectedTopicId = topicSelect.value || null;
    if (selectedTopicId) {
      await loadArguments(selectedTopicId);
      await loadSummaries(selectedTopicId);
    } else {
      arguments_ = [];
      summaries = [];
    }
    render();
  }

  createTopicBtn.addEventListener("click", () => {
    createTopic(newTopicInput.value);
    newTopicInput.value = "";
    argumentInput.focus();
  });

  newTopicInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      createTopicBtn.click();
    }
  });

  topicSelect.addEventListener("change", onTopicChange);

  approveTopicBtn?.addEventListener("click", async () => {
    const selected = getSelectedTopic();
    if (!selected) return;
    await approveTopic(selected.id);
  });

  deleteTopicBtn?.addEventListener("click", async () => {
    const selected = getSelectedTopic();
    if (!selected) return;
    const confirmed = window.confirm(`Topic "${selected.title}" wirklich loeschen?`);
    if (!confirmed) return;
    await deleteTopic(selected.id);
  });

  opinionForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const selected = getSelectedTopic();
    if (!selected) {
      showToast("Create a topic first");
      return;
    }

    const side = opinionForm.querySelector('input[name="side"]:checked')?.value;
    addArgument(selected.id, side, argumentInput.value);
    argumentInput.value = "";
    argumentInput.focus();
  });

  argumentInput.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      opinionForm.requestSubmit();
    }
  });

  function onArgumentListClick(e) {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('button[data-action="delete-argument"]');
    if (!button) return;
    const topicId = button.dataset.topicId;
    const argumentId = button.dataset.argumentId;
    if (!topicId || !argumentId) return;
    const confirmed = window.confirm("Dieses Argument wirklich loeschen?");
    if (!confirmed) return;
    deleteArgument(topicId, argumentId);
  }

  proList.addEventListener("click", onArgumentListClick);
  contraList.addEventListener("click", onArgumentListClick);

  async function onLoginSubmit(e) {
    e.preventDefault();
    const password = String(loginPasswordInput?.value ?? "").trim();
    if (!password) {
      setLoginError("Password is required");
      return;
    }

    setLoginError("");
    if (loginSubmitBtn) loginSubmitBtn.disabled = true;

    try {
      await loginWithPassword(password);
      await loadAdminStatus();
      render();
      setLoginVisible(false);
      if (loginPasswordInput) loginPasswordInput.value = "";
    } catch (err) {
      sessionPassword = "";
      isAdmin = false;
      if (err?.status === 401 || err?.status === 403) {
        setLoginError(err.message || "Password invalid or not approved");
      } else {
        setLoginError("Failed to load data. Is the server running?");
      }
      console.error(err);
    } finally {
      if (loginSubmitBtn) loginSubmitBtn.disabled = false;
      loginPasswordInput?.focus();
      loginPasswordInput?.select();
    }
  }

  function init() {
    setLoginVisible(true);
    if (!loginForm) return;
    loginForm.addEventListener("submit", onLoginSubmit);
    loginPasswordInput?.focus();
  }

  init();
})();
