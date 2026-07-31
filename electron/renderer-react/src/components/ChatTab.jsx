import { useCallback, useEffect, useRef, useState } from "react";
import {
  addText,
  addUrl,
  clearChat,
  exportNotebookLm,
  generateEpisode,
  getChatHistory,
  getItem,
  searchItems,
  sendChatMessage,
} from "../lib/audiofyClient.js";
import { useStatus } from "../state/statusContext.js";

// Porte do chat do renderer vanilla: mesmos prefixos de modo, mesmos textos de
// sistema e a mesma decisão de executar as ações propostas automaticamente
// (os botões continuam para reexecutar à mão).

const ACTION_LABELS = {
  adicionar_texto: "Adicionar conteúdo",
  adicionar_url: "Adicionar URL",
  buscar: "Buscar conteúdo",
  gerar: "Gerar episódio",
  exportar_notebooklm: "Exportar NotebookLM",
};

const MODE_PREFIXES = {
  pesquisa:
    "[MODO PESQUISA] Pesquise o tema abaixo na web, escreva um texto completo e " +
    "substancial com suas palavras e adicione-o aos conteúdos via ação " +
    "adicionar_texto. Não pergunte nada, entregue direto.\n\n",
  podcast:
    "[MODO PODCAST] Pesquise o tema abaixo, escreva um texto completo e adicione " +
    "via adicionar_texto. Depois, gere o episódio em modo adaptation via ação " +
    "gerar. Não peça confirmação, execute tudo.\n\n",
  narracao:
    "[MODO NARRAÇÃO] Pesquise o tema abaixo, escreva um texto completo e adicione " +
    "via adicionar_texto. Depois, gere o episódio em modo verbatim via ação " +
    "gerar. Não peça confirmação, execute tudo.\n\n",
  reflexiva:
    "[MODO LEITURA REFLEXIVA] Pesquise o tema abaixo, escreva um texto completo e adicione " +
    "via adicionar_texto. Depois, gere o episódio em modo reflexive via ação " +
    "gerar. Não peça confirmação, execute tudo.\n\n",
  url:
    "[MODO URL] O texto abaixo contém uma ou mais URLs. Adicione cada uma como " +
    "conteúdo via ação adicionar_url. Não pergunte nada.\n\n",
};

const MODE_PLACEHOLDERS = {
  "": "Ex.: pesquise bons artigos sobre computação quântica para virar episódio…",
  pesquisa: "Digite o tema para pesquisar e adicionar como conteúdo…",
  podcast: "Digite o tema — será pesquisado e gerado como podcast adaptado…",
  narracao: "Digite o tema — será pesquisado e gerado como leitura fiel…",
  reflexiva: "Digite o tema — será pesquisado e gerado como leitura reflexiva com comentários…",
  url: "Cole a URL para adicionar como conteúdo…",
};

const MODES = [
  { id: "", label: "💬 Livre", title: "Conversa livre" },
  { id: "pesquisa", label: "🔍 Pesquisar", title: "Pesquisa um tema e adiciona como conteúdo" },
  { id: "podcast", label: "🎙️ Podcast", title: "Pesquisa e já gera um episódio adaptado" },
  { id: "narracao", label: "📖 Narração", title: "Pesquisa e já gera uma leitura fiel" },
  {
    id: "reflexiva",
    label: "🧠 Reflexiva",
    title: "Pesquisa e já gera uma leitura reflexiva com comentários",
  },
  { id: "url", label: "🔗 URL", title: "Adiciona uma URL como conteúdo" },
];

let messageSeq = 0;
function nextId() {
  messageSeq += 1;
  return `msg-${messageSeq}`;
}

export default function ChatTab({ onContentChanged, currentSource = "custom", draft: prepared }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("");
  const [sending, setSending] = useState(false);
  const boxRef = useRef(null);
  const textRef = useRef(null);
  const { refresh: refreshStatus } = useStatus();

  const append = useCallback((role, text, actions = []) => {
    setMessages((previous) => [...previous, { id: nextId(), role, text, actions }]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getChatHistory().then((result) => {
      if (cancelled || !result.ok) return;
      setMessages(result.messages.map((message) => ({
        id: nextId(),
        role: message.role === "user" ? "user" : "assistant",
        text: message.content,
        actions: [],
      })));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Instrução preparada por outra aba (ex.: extração de arquivo delegada à IA):
  // entra no campo, sem enviar — a decisão de gastar créditos é do usuário.
  useEffect(() => {
    if (!prepared) return;
    setDraft(prepared.text);
    append("system", prepared.notice);
    textRef.current?.focus();
  }, [prepared, append]);

  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages, sending]);

  const runAction = useCallback(async (action) => {
    let result;
    if (action.tipo === "adicionar_texto") {
      result = await addText(action.titulo, action.texto);
      if (result.ok) {
        append("system", `✔ Conteúdo criado: ${result.item_id}`);
        onContentChanged();
      }
    } else if (action.tipo === "adicionar_url") {
      result = await addUrl(action.url);
      if (result.ok) {
        append("system", `✔ Conteúdo adicionado: ${result.item_id}`);
        onContentChanged();
      }
    } else if (action.tipo === "buscar") {
      result = await searchItems(action.fonte || "akita", action.termos || "");
      if (result.ok) {
        const lines = result.items.slice(0, 10)
          .map((item) => `• ${item.item_id} — ${item.title}`).join("\n");
        append("system", lines || "Nada encontrado.");
      }
    } else if (action.tipo === "gerar") {
      const source = action.fonte || currentSource;
      const detail = await getItem(source, action.item_id);
      const estimate = detail.ok
        ? ` (~US$ ${detail.estimated_cost_usd.toFixed(2)}; faixa ` +
          `US$ ${detail.estimate.cost_min_usd.toFixed(2)}–` +
          `${detail.estimate.cost_max_usd.toFixed(2)})`
        : "";
      // Sem confirmação por decisão do usuário: o custo fica visível no chat e o
      // banner global de gasto ativo continua alertando enquanto a geração roda.
      append("system", `Gerando "${action.item_id}"${estimate} — consome créditos.`);
      result = await generateEpisode(["generate", source, action.item_id]);
      if (result.ok && result.started) {
        append("system", "✔ Geração iniciada — acompanhe na aba Episódios.");
        refreshStatus();
      } else if (result.ok) {
        append("system", `✖ ${result.reason || "a geração não foi iniciada"}`);
      }
    } else if (action.tipo === "exportar_notebooklm") {
      result = await exportNotebookLm(action.fonte || currentSource, action.item_id);
      if (result.ok) append("system", `✔ Pacote NotebookLM: ${result.pack}`);
    } else {
      result = { ok: false, error: `ação desconhecida: ${action.tipo}` };
    }
    if (result && !result.ok) append("system", `✖ ${result.reason || result.error}`);
  }, [append, currentSource, onContentChanged, refreshStatus]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    append("user", text);
    setSending(true);
    const result = await sendChatMessage((MODE_PREFIXES[mode] || "") + text);
    setSending(false);
    if (!result.ok) {
      append("system", `✖ ${result.error}`);
      return;
    }
    append("assistant", result.reply, result.actions || []);
    // O chat executa tudo sozinho: cada ação proposta roda em ordem, sem
    // esperar clique.
    for (const action of result.actions || []) {
      await runAction(action);
    }
    // O Chat pode criar/atualizar conteúdo enquanto outra aba está aberta.
    onContentChanged();
  }, [append, draft, mode, onContentChanged, runAction, sending]);

  const handleClear = useCallback(async () => {
    await clearChat();
    setMessages([]);
  }, []);

  return (
    <section className="panel chat-panel">
      <div className="chat-toolbar">
        <span className="muted">
          Pesquise qualquer tema, avalie conteúdos e comande o Audiofy.
          O assistente propõe ações executáveis com um clique.
        </span>
        <button type="button" title="Limpa a conversa" onClick={handleClear}>🗑️ Limpar</button>
      </div>

      <div
        ref={boxRef}
        id="chat-messages"
        role="log"
        aria-live="polite"
        aria-label="Histórico da conversa"
      >
        {messages.map((message) => (
          <div key={message.id}>
            {message.text && <div className={`msg ${message.role}`}>{message.text}</div>}
            {message.actions.map((action, index) => (
              <button
                key={`${message.id}-action-${index}`}
                type="button"
                className="action-chip"
                onClick={() => runAction(action)}
              >
                {`⚡ ${action.descricao || ACTION_LABELS[action.tipo] || action.tipo}`}
              </button>
            ))}
          </div>
        ))}
        {sending && <div className="msg assistant muted">… pesquisando</div>}
      </div>

      <div className="chat-mode-bar" role="radiogroup" aria-label="Modo do chat">
        {MODES.map((item) => (
          <button
            key={item.id || "livre"}
            type="button"
            className={`chat-mode${mode === item.id ? " active" : ""}`}
            title={item.title}
            onClick={() => {
              setMode(item.id);
              textRef.current?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="chat-input">
        <textarea
          ref={textRef}
          rows="2"
          aria-label="Mensagem para o assistente"
          placeholder={MODE_PLACEHOLDERS[mode] || MODE_PLACEHOLDERS[""]}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <button type="button" className="primary" disabled={sending} onClick={send}>Enviar</button>
      </div>
    </section>
  );
}
