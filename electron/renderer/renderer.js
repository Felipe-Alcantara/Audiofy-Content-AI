// Renderer do Audiofy Desktop — paridade completa com a CLI:
// chat de pesquisa com ações, fontes plugáveis (conteúdo próprio + Akita),
// geração com progresso/custo ao vivo, abort, NotebookLM, chaves, saldo e perfis.

const $ = (id) => document.getElementById(id);
const bridge = (args, stdin) => window.audiofy.bridge(args, stdin);

let currentSource = "custom";
let selectedItem = null;
let pollTimer = null;

// ── Abas ──────────────────────────────────────────────────────────────────

document.querySelectorAll("#tabs .tab").forEach((button) => {
  button.onclick = () => {
    document.querySelectorAll("#tabs .tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-page").forEach((p) => p.classList.add("hidden"));
    button.classList.add("active");
    $(`tab-${button.dataset.tab}`).classList.remove("hidden");
    if (button.dataset.tab === "settings") loadSettings();
    if (button.dataset.tab === "episodes") refreshStatus();
  };
});

// ── Chat ──────────────────────────────────────────────────────────────────

function addChatMessage(role, text, actions = []) {
  const box = $("chat-messages");
  const message = document.createElement("div");
  message.className = `msg ${role}`;
  message.textContent = text;
  box.appendChild(message);
  for (const action of actions) {
    const button = document.createElement("button");
    button.className = "action-chip";
    button.textContent = `⚡ ${action.descricao || action.tipo}`;
    button.onclick = () => runAction(action, button);
    box.appendChild(button);
  }
  box.scrollTop = box.scrollHeight;
}

async function runAction(action, button) {
  button.disabled = true;
  let result;
  if (action.tipo === "adicionar_url") {
    result = await bridge(["add-url", action.url]);
    if (result.ok) {
      addChatMessage("system", `✔ Conteúdo adicionado: ${result.item_id}`);
      if (currentSource === "custom") loadItems();
    }
  } else if (action.tipo === "buscar") {
    result = await bridge(["search", action.fonte || "akita", action.termos || ""]);
    if (result.ok) {
      const lines = result.items.slice(0, 10)
        .map((i) => `• ${i.item_id} — ${i.title}`).join("\n");
      addChatMessage("system", lines || "Nada encontrado.");
    }
  } else if (action.tipo === "gerar") {
    const detail = await bridge(["item", action.fonte, action.item_id]);
    const estimate = detail.ok ? ` (~US$ ${detail.estimated_cost_usd.toFixed(2)})` : "";
    if (!confirm(`Gerar episódio de "${action.item_id}"${estimate}? Consome créditos.`)) {
      button.disabled = false;
      return;
    }
    result = await bridge(["generate", action.fonte, action.item_id]);
    if (result.ok && result.started) {
      addChatMessage("system", "✔ Geração iniciada — acompanhe na aba Episódios.");
      refreshStatus();
    }
  } else if (action.tipo === "exportar_notebooklm") {
    result = await bridge(["notebooklm", action.fonte, action.item_id]);
    if (result.ok) addChatMessage("system", `✔ Pacote NotebookLM: ${result.pack}`);
  } else {
    result = { ok: false, error: `ação desconhecida: ${action.tipo}` };
  }
  if (result && !result.ok) {
    addChatMessage("system", `✖ ${result.reason || result.error}`);
  }
}

async function sendChat() {
  const text = $("chat-text").value.trim();
  if (!text) return;
  $("chat-text").value = "";
  addChatMessage("user", text);
  const thinking = document.createElement("div");
  thinking.className = "msg assistant muted";
  thinking.textContent = "… pesquisando";
  $("chat-messages").appendChild(thinking);
  $("chat-send").disabled = true;
  const result = await bridge(["chat", "principal"], text);
  thinking.remove();
  $("chat-send").disabled = false;
  if (result.ok) addChatMessage("assistant", result.reply, result.actions);
  else addChatMessage("system", `✖ ${result.error}`);
}

$("chat-send").onclick = sendChat;
$("chat-text").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendChat();
  }
});
$("chat-clear").onclick = async () => {
  await bridge(["chat-clear", "principal"]);
  $("chat-messages").innerHTML = "";
};

async function loadChatHistory() {
  const result = await bridge(["chat-history", "principal"]);
  if (!result.ok) return;
  for (const message of result.messages) {
    addChatMessage(message.role === "user" ? "user" : "assistant", message.content);
  }
}

// ── Fontes e itens ────────────────────────────────────────────────────────

async function loadSources() {
  const result = await bridge(["sources"]);
  if (!result.ok) return;
  const select = $("source-select");
  select.innerHTML = "";
  for (const source of result.sources) {
    const option = document.createElement("option");
    option.value = source.key;
    option.textContent = source.name;
    select.appendChild(option);
  }
  select.value = currentSource;
}

$("source-select").onchange = () => {
  currentSource = $("source-select").value;
  $("add-content").classList.toggle("hidden", currentSource !== "custom");
  selectedItem = null;
  $("detail").classList.add("hidden");
  $("detail-empty").classList.remove("hidden");
  loadItems();
};

async function loadItems(query = "") {
  const command = query ? ["search", currentSource, query] : ["items", currentSource];
  const result = await bridge(command);
  const list = $("items");
  list.innerHTML = "";
  if (!result.ok) {
    list.innerHTML = `<li class="muted">Erro: ${result.error}</li>`;
    return;
  }
  if (!result.items.length) {
    list.innerHTML = `<li class="muted">Nenhum item — adicione conteúdo acima
      ou peça sugestões no Chat.</li>`;
  }
  for (const item of result.items) {
    const row = document.createElement("li");
    row.innerHTML =
      `<span class="date">${item.published_at}</span><span>${item.title}</span>`;
    row.onclick = () => selectItem(item, row);
    list.appendChild(row);
  }
}

async function selectItem(item, row) {
  document.querySelectorAll("#items li").forEach((li) => li.classList.remove("selected"));
  row.classList.add("selected");
  const detail = await bridge(["item", currentSource, item.item_id]);
  if (!detail.ok) return;
  selectedItem = { ...detail, source: currentSource };
  $("detail-empty").classList.add("hidden");
  $("detail").classList.remove("hidden");
  $("detail-title").textContent = detail.title;
  $("detail-meta").textContent =
    `${detail.published_at} · ~${detail.words} palavras · ${detail.url || "texto local"}`;
  $("detail-estimate").textContent =
    `Custo estimado: ~US$ ${detail.estimated_cost_usd.toFixed(2)} ` +
    `(razão real medida: US$ 0,60 ≈ 13 min)`;
  refreshStatus();
}

$("btn-sync").onclick = async () => {
  $("btn-sync").disabled = true;
  await bridge(["sync", currentSource]);
  $("btn-sync").disabled = false;
  loadItems($("search").value.trim());
};

let searchDebounce = null;
$("search").oninput = () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => loadItems($("search").value.trim()), 350);
};

$("btn-add-url").onclick = async () => {
  const url = $("add-url").value.trim();
  if (!url) return;
  $("btn-add-url").disabled = true;
  const result = await bridge(["add-url", url]);
  $("btn-add-url").disabled = false;
  if (result.ok) {
    $("add-url").value = "";
    loadItems();
  } else {
    alert(result.error);
  }
};

$("btn-add-text").onclick = async () => {
  const title = $("add-title").value.trim();
  const text = $("add-text").value.trim();
  if (!title || !text) return;
  const result = await bridge(["add-text"], JSON.stringify({ title, text }));
  if (result.ok) {
    $("add-title").value = "";
    $("add-text").value = "";
    loadItems();
  } else {
    alert(result.error);
  }
};

// ── Geração, episódios e status ───────────────────────────────────────────

$("btn-generate").onclick = async () => {
  if (!selectedItem) return;
  const confirmed = confirm(
    `Gerar episódio de "${selectedItem.title}"?\n\n` +
    `Custo estimado: ~US$ ${selectedItem.estimated_cost_usd.toFixed(2)} ` +
    `(consome créditos do OpenRouter).`
  );
  if (!confirmed) return;
  const result = await bridge(["generate", selectedItem.source, selectedItem.item_id]);
  if (!result.ok || !result.started) alert(`Não iniciou: ${result.reason || result.error}`);
  refreshStatus();
};

$("btn-notebooklm").onclick = async () => {
  if (!selectedItem) return;
  const result = await bridge(["notebooklm", selectedItem.source, selectedItem.item_id]);
  if (result.ok) {
    window.audiofy.openPath(result.pack);
  } else {
    alert(result.error);
  }
};

$("btn-abort").onclick = async () => {
  if (!selectedItem) return;
  const result = await bridge(["abort", selectedItem.item_id]);
  if (result.ok && result.aborted) {
    alert("Abort solicitado — a geração para no próximo segmento.");
  }
  refreshStatus();
};

async function refreshStatus() {
  const overview = await bridge(["status"]);
  if (!overview.ok) return;

  const banner = $("running-banner");
  if (overview.anything_running) {
    $("running-detail").textContent = overview.running
      .map((e) => `${e.episode_id} (US$ ${e.cost_usd.toFixed(3)})`).join(", ");
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }

  renderEpisodes(overview.episodes);
  if (selectedItem) renderSelectedStatus(overview.episodes);

  clearTimeout(pollTimer);
  if (overview.anything_running) pollTimer = setTimeout(refreshStatus, 2000);
}

function renderSelectedStatus(episodes) {
  const status = episodes.find((e) => e.episode_id === selectedItem.item_id);
  const running = status && status.state === "rodando";
  const done = status && status.mp3;

  $("btn-abort").classList.toggle("hidden", !running);
  $("btn-generate").disabled = running;
  $("btn-play").classList.toggle("hidden", !done);
  $("btn-folder").classList.toggle("hidden", !status);
  $("progress-box").classList.toggle("hidden", !running);

  if (running) {
    const progress = status.progress || {};
    const percent = progress.total
      ? Math.round((100 * progress.current) / progress.total) : 0;
    $("progress-fill").style.width = `${percent}%`;
    $("progress-label").textContent =
      `Etapa: ${status.stage} — ${progress.current || 0}/${progress.total || "?"} (${percent}%)`;
    $("cost-label").textContent = `💰 US$ ${status.cost_usd.toFixed(4)} até agora`;
  }
  $("btn-play").onclick = () => window.audiofy.openPath(status.mp3);
  $("btn-folder").onclick = () => status && window.audiofy.openPath(status.dir);
}

function renderEpisodes(episodes) {
  const list = $("episodes");
  list.innerHTML = episodes.length ? "" : `<li class="muted">Nenhum episódio ainda.</li>`;
  for (const episode of episodes) {
    const row = document.createElement("li");
    const cost = episode.cost_usd ? ` · US$ ${episode.cost_usd.toFixed(4)}` : "";
    const progress = episode.state === "rodando" && episode.progress.total
      ? ` · ${episode.progress.current}/${episode.progress.total}` : "";
    row.innerHTML =
      `<span class="state-${episode.state}">●</span> ${episode.episode_id}` +
      `<span class="muted">${episode.state}${progress}${cost}</span>`;
    if (episode.state === "rodando") {
      const abortButton = document.createElement("button");
      abortButton.textContent = "🛑";
      abortButton.title = "Abortar";
      abortButton.onclick = () => bridge(["abort", episode.episode_id]).then(refreshStatus);
      row.appendChild(abortButton);
    }
    if (episode.mp3) {
      const play = document.createElement("button");
      play.textContent = "▶️";
      play.title = "Ouvir";
      play.onclick = () => window.audiofy.openPath(episode.mp3);
      row.appendChild(play);
    }
    const folder = document.createElement("button");
    folder.textContent = "📂";
    folder.title = "Abrir pasta";
    folder.onclick = () => window.audiofy.openPath(episode.dir);
    row.appendChild(folder);
    list.appendChild(row);
  }
}

// ── Configurações ─────────────────────────────────────────────────────────

async function loadSettings() {
  const keys = await bridge(["keys-list"]);
  if (keys.ok) {
    const list = $("keys-list");
    list.innerHTML = keys.keys.length ? "" : `<li class="muted">Nenhuma chave no cofre.</li>`;
    for (const key of keys.keys) {
      const row = document.createElement("li");
      const active = key.name === keys.active;
      row.innerHTML = `<span>${key.name}</span><span class="muted">${key.masked}</span>` +
        (active ? `<span class="state-concluido">● ativa</span>` : "");
      if (!active) {
        const activate = document.createElement("button");
        activate.textContent = "ativar";
        activate.onclick = () =>
          bridge(["keys-activate", key.name]).then(loadSettings);
        row.appendChild(activate);
      }
      const remove = document.createElement("button");
      remove.textContent = "🗑️";
      remove.onclick = () => {
        if (confirm(`Remover a chave "${key.name}"?`)) {
          bridge(["keys-remove", key.name]).then(loadSettings);
        }
      };
      row.appendChild(remove);
      list.appendChild(row);
    }
  }

  const profiles = await bridge(["profiles-list"]);
  if (profiles.ok) {
    const list = $("profiles-list");
    list.innerHTML = "";
    for (const profile of profiles.profiles) {
      const row = document.createElement("li");
      const active = profile.name === profiles.active;
      row.innerHTML =
        `<span>${profile.name}</span><span class="muted">${profile.description}</span>` +
        (active ? `<span class="state-concluido">● ativo</span>` : "");
      if (!active) {
        const activate = document.createElement("button");
        activate.textContent = "ativar";
        activate.onclick = () =>
          bridge(["profiles-activate", profile.name]).then(loadSettings);
        row.appendChild(activate);
      }
      list.appendChild(row);
    }
  }

  const info = await bridge(["settings-info"]);
  if (info.ok) {
    const clis = info.subscription_clis
      .map((c) => `${c.key}${c.available ? "" : " (não instalada)"}`).join(", ");
    $("settings-info").textContent =
      `perfil ativo:  ${info.profile}\n` +
      `texto via:     ${info.text_provider}\n` +
      `modelos:       roteiro=${info.text_model} | auditoria=${info.audit_model}\n` +
      `tts:           ${info.tts_model}\n` +
      `apresentadores: ${info.presenters.map((p) => `${p.speaker}:${p.voice}`).join(", ")}\n` +
      `CLIs de assinatura: ${clis}`;
  }
}

$("btn-key-add").onclick = async () => {
  const name = $("key-name").value.trim();
  const value = $("key-value").value.trim();
  if (!name || !value) return;
  const result = await bridge(["keys-add", name], value);
  if (result.ok) {
    $("key-name").value = "";
    $("key-value").value = "";
    loadSettings();
  } else {
    alert(result.error);
  }
};

$("btn-balance").onclick = async () => {
  $("balance-line").textContent = "consultando…";
  const result = await bridge(["balance"]);
  $("balance-line").textContent = result.ok ? result.detail : `✖ ${result.error}`;
};

$("btn-load-catalog").onclick = async () => {
  $("catalog-box").textContent = "carregando…";
  const result = await bridge(["tts-catalog"]);
  if (!result.ok) {
    $("catalog-box").textContent = `✖ ${result.error}`;
    return;
  }
  const models = result.models.map((m) => `${m.id}`).join("\n");
  const voices = Object.entries(result.gemini_voices)
    .map(([voice, style]) => `${voice} (${style})`).join(", ");
  $("catalog-box").textContent =
    `Modelos TTS:\n${models}\n\nVozes Gemini:\n${voices}`;
};

// ── Boot ──────────────────────────────────────────────────────────────────

$("add-content").classList.toggle("hidden", currentSource !== "custom");
loadSources().then(loadItems);
loadChatHistory();
refreshStatus();
