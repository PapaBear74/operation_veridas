(() => {
  const API_BASE = "";

  const opinionForm = document.getElementById("opinionForm");
  const topicSelect = document.getElementById("topicSelect");
  const topicSelectDisplay = document.getElementById("topicSelectDisplay");
  const adminTopicActions = document.getElementById("adminTopicActions");
  const deleteTopicBtn = document.getElementById("deleteTopicBtn");
  const accessTopicBtn = document.getElementById("accessTopicBtn");
  const createTopicBtn = document.getElementById("createTopicBtn");
  const createTopicModal = document.getElementById("createTopicModal");
  const createTopicModalForm = document.getElementById("createTopicModalForm");
  const createTopicTitleInput = document.getElementById("createTopicTitleInput");
  const createTopicPasswordInput = document.getElementById("createTopicPasswordInput");
  const createTopicModalCancelBtn = document.getElementById("createTopicModalCancelBtn");
  const createTopicModalSubmitBtn = document.getElementById("createTopicModalSubmitBtn");
  const argumentInput = document.getElementById("argumentInput");
  const proList = document.getElementById("proList");
  const contraList = document.getElementById("contraList");
  const emptyState = document.getElementById("emptyState");
  const toast = document.getElementById("toast");
  const boardLoading = document.getElementById("boardLoading");

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

  async function loadSessionForPassword(password) {
    sessionPassword = password;
    await loadTopics();
    await loadAdminStatus();
    if (selectedTopicId) {
      await loadArguments(selectedTopicId);
      await loadSummaries(selectedTopicId);
    } else {
      arguments_ = [];
      summaries = [];
    }
    render();
  }

  async function loadTopics() {
    if (!sessionPassword) {
      topics = [];
      selectedTopicId = null;
      return;
    }
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
      opt.textContent = t.title;
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
    if (deleteTopicBtn) {
      deleteTopicBtn.disabled = !isAdmin || !hasTopic;
    }

    renderBoard(selectedTopic);

    if (!topics.length) {
      emptyState.textContent = sessionPassword
        ? "No topics for this password yet. Create one below."
        : "No topic selected. Enter a password below and open or create a topic.";
      setEmptyStateVisible(true);
    } else if (selectedTopic && arguments_.length === 0 && summaries.length === 0) {
      emptyState.textContent = "No arguments yet. Write the first one.";
      setEmptyStateVisible(true);
    } else {
      setEmptyStateVisible(false);
    }
  }

  function promptForPassword(message = "Bitte Passwort eingeben") {
    const value = window.prompt(message, sessionPassword || "");
    return String(value ?? "").trim();
  }

  async function createTopic(title, topicPassword) {
    const trimmed = String(title ?? "").trim();
    if (!trimmed) {
      showToast("Topic title can't be empty");
      return;
    }
    const safePassword = String(topicPassword ?? "").trim();
    if (!safePassword) {
      showToast("Enter a password first");
      return;
    }

    try {
      if (!sessionPassword || sessionPassword !== safePassword) {
        sessionPassword = safePassword;
      }
      await api("/api/topics", {
        method: "POST",
        body: JSON.stringify({ title: trimmed, password: safePassword }),
      });
      await loadTopics();
      selectedTopicId = topics[0]?.id ?? null;
      await loadArguments(selectedTopicId);
      await loadSummaries(selectedTopicId);
      render();
      showToast("Topic created");
      return true;
    } catch (err) {
      showToast(err.message || "Failed to create topic");
      console.error(err);
      return false;
    }
  }

  function closeCreateTopicModal() {
    if (!createTopicModal) return;
    createTopicModal.classList.remove("show");
    createTopicModal.setAttribute("aria-hidden", "true");
  }

  function openCreateTopicModal() {
    if (!createTopicModal) return;
    if (createTopicTitleInput) createTopicTitleInput.value = "";
    if (createTopicPasswordInput) createTopicPasswordInput.value = sessionPassword || "";
    createTopicModal.classList.add("show");
    createTopicModal.setAttribute("aria-hidden", "false");
    createTopicTitleInput?.focus();
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

  createTopicBtn?.addEventListener("click", async () => {
    openCreateTopicModal();
  });

  topicSelect.addEventListener("change", onTopicChange);

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

  async function accessTopicsWithPassword(password) {
    if (!password) {
      showToast("Enter a password first");
      return;
    }

    if (accessTopicBtn) accessTopicBtn.disabled = true;

    try {
      await loadSessionForPassword(password);
      showToast(topics.length ? "Topics loaded" : "No topics found for this password");
    } catch (err) {
      sessionPassword = "";
      isAdmin = false;
      topics = [];
      selectedTopicId = null;
      arguments_ = [];
      summaries = [];
      render();
      showToast(err.message || "Failed to load topics");
      console.error(err);
    } finally {
      if (accessTopicBtn) accessTopicBtn.disabled = false;
    }
  }

  accessTopicBtn?.addEventListener("click", () => {
    const password = promptForPassword("Passwort fuer Zugriff eingeben");
    if (!password) {
      showToast("Enter a password first");
      return;
    }
    accessTopicsWithPassword(password);
  });

  createTopicModalCancelBtn?.addEventListener("click", () => {
    closeCreateTopicModal();
  });

  createTopicModal?.addEventListener("click", (e) => {
    if (e.target === createTopicModal) {
      closeCreateTopicModal();
    }
  });

  createTopicModalForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = String(createTopicTitleInput?.value ?? "").trim();
    const password = String(createTopicPasswordInput?.value ?? "").trim();

    if (!title) {
      showToast("Topic title can't be empty");
      createTopicTitleInput?.focus();
      return;
    }

    if (!password) {
      showToast("Enter a password first");
      createTopicPasswordInput?.focus();
      return;
    }

    if (createTopicModalSubmitBtn) createTopicModalSubmitBtn.disabled = true;
    const created = await createTopic(title, password);
    if (createTopicModalSubmitBtn) createTopicModalSubmitBtn.disabled = false;

    if (!created) return;
    closeCreateTopicModal();
    argumentInput.focus();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!createTopicModal?.classList.contains("show")) return;
    closeCreateTopicModal();
  });

  function init() {
    render();
    accessTopicBtn?.focus();
  }

  init();
})();
