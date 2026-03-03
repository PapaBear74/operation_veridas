(() => {
  const API_BASE = "";

  const opinionForm = document.getElementById("opinionForm");
  const topicSelect = document.getElementById("topicSelect");
  const newTopicInput = document.getElementById("newTopicInput");
  const createTopicBtn = document.getElementById("createTopicBtn");
  const argumentInput = document.getElementById("argumentInput");
  const proList = document.getElementById("proList");
  const contraList = document.getElementById("contraList");
  const emptyState = document.getElementById("emptyState");
  const toast = document.getElementById("toast");
  const summariesSection = document.getElementById("summariesSection");
  const summariesList = document.getElementById("summariesList");
  const summariesLoading = document.getElementById("summariesLoading");

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

  async function api(path, options = {}) {
    const res = await fetch(API_BASE + path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || res.statusText);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function loadTopics() {
    topics = await api("/api/topics");
    if (topics.length && !selectedTopicId) selectedTopicId = topics[0].id;
    if (selectedTopicId && !topics.find((t) => t.id === selectedTopicId)) {
      selectedTopicId = topics[0]?.id ?? null;
    }
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

  function renderTopics(selectedTopic) {
    topicSelect.innerHTML = "";

    if (topics.length === 0) {
      topicSelect.disabled = true;
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
  }

  function renderArgumentCard(topicId, arg) {
    const li = document.createElement("li");
    li.className = "noteCard argumentCard";
    li.classList.add(arg.side === "contra" ? "argumentContra" : "argumentPro");
    li.dataset.topicId = topicId;
    li.dataset.argumentId = arg.id;

    const body = document.createElement("p");
    body.className = "noteBody";
    body.textContent = arg.text;
    li.appendChild(body);

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
    if (summaries.length > 0) {
      const latest = summaries[0];
      try {
        const parsed = JSON.parse(latest.summaryText);
        const proCompressed = Array.isArray(parsed.pro) ? parsed.pro : [];
        const contraCompressed = Array.isArray(parsed.contra) ? parsed.contra : [];

        if (proCompressed.length || contraCompressed.length) {
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
        }
      } catch {
        // summaryText war kein JSON – dann fallen wir unten auf die Original-Argumente zurück
      }
    }

    // Fallback: normale, nicht komprimierte Argumente anzeigen
    if (!usedCompressed) {
      for (const arg of arguments_) {
        const card = renderArgumentCard(selectedTopic.id, arg);
        if (arg.side === "contra") contraFrag.appendChild(card);
        else proFrag.appendChild(card);
      }
    }

    proList.appendChild(proFrag);
    contraList.appendChild(contraFrag);
  }

  function renderSummaries() {
    if (!summariesList || !summariesSection) return;

    if (summaries.length === 0) {
      summariesSection.style.display = "none";
      return;
    }

    summariesSection.style.display = "block";
    summariesList.innerHTML = "";

    const frag = document.createDocumentFragment();
    for (const s of summaries) {
      const card = document.createElement("div");
      card.className = "summaryCard noteCard";
      const dateEl = document.createElement("div");
      dateEl.className = "summaryDate muted";
      dateEl.textContent = formatDateShort(s.summaryDate);
      const textEl = document.createElement("p");
      textEl.className = "noteBody summaryText";

      // Wenn summaryText JSON ist (komprimierte Argumente), hübsch formatieren
      let displayText = s.summaryText;
      try {
        const parsed = JSON.parse(s.summaryText);
        const lines = [];
        const pro = Array.isArray(parsed.pro) ? parsed.pro : [];
        const contra = Array.isArray(parsed.contra) ? parsed.contra : [];

        if (pro.length) {
          lines.push("Pro:");
          for (const p of pro) {
            const t = String(p).trim();
            if (t) lines.push(`- ${t}`);
          }
        }

        if (contra.length) {
          if (lines.length) lines.push(""); // Leerzeile
          lines.push("Contra:");
          for (const c of contra) {
            const t = String(c).trim();
            if (t) lines.push(`- ${t}`);
          }
        }

        if (lines.length) {
          displayText = lines.join("\n");
        }
      } catch {
        // kein JSON, dann nutzen wir den Rohtext
      }

      textEl.textContent = displayText;
      card.appendChild(dateEl);
      card.appendChild(textEl);
      frag.appendChild(card);
    }
    summariesList.appendChild(frag);
  }

  function render() {
    const selectedTopic = getSelectedTopic();

    renderTopics(selectedTopic);

    const hasTopic = Boolean(selectedTopic);
    argumentInput.disabled = !hasTopic;
    opinionForm.querySelector('button[type="submit"]').disabled = !hasTopic;

    renderBoard(selectedTopic);
    renderSummaries();

    if (!topics.length) {
      emptyState.textContent = "No topics yet. Create one below.";
      setEmptyStateVisible(true);
    } else if (selectedTopic && arguments_.length === 0 && summaries.length === 0) {
      emptyState.textContent = "No arguments yet. Write the first one on the right. Daily AI summaries appear here.";
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
    await api("/api/topics", { method: "POST", body: JSON.stringify({ title: trimmed }) });
    await loadTopics();
    selectedTopicId = topics[0]?.id ?? null;
    await loadArguments(selectedTopicId);
    await loadSummaries(selectedTopicId);
    render();
    showToast("Topic submitted. It will appear after approval.");
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

    if (summariesLoading) {
      summariesLoading.style.display = "inline-block";
    }

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
      if (summariesLoading) {
        summariesLoading.style.display = "none";
      }
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

  async function init() {
    try {
      await loadTopics();
      if (selectedTopicId) {
        await loadArguments(selectedTopicId);
        await loadSummaries(selectedTopicId);
      }
      render();
    } catch (err) {
      showToast("Failed to load data. Is the server running?");
      console.error(err);
    }
  }

  init();
})();
