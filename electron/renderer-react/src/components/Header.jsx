import { useRef } from "react";
import { usePlayer } from "../state/playerContext.js";
import { useSettings } from "../state/settingsContext.js";
import { useStatus } from "../state/statusContext.js";

const TABS = [
  { id: "chat", label: "💬 Chat" },
  { id: "content", label: "📚 Conteúdo" },
  { id: "episodes", label: "🎧 Episódios" },
  { id: "costs", label: "📊 Custos" },
  { id: "settings", label: "⚙️ Configurações" },
];

function ConfigChip({ label, value, className = "", title }) {
  return (
    <span className={`config-chip ${className}`.trim()} title={title}>
      <strong>{label}:</strong>
      <span className="model-id">{value}</span>
    </span>
  );
}

// Espelha renderActiveConfig() do renderer vanilla: a tira resume o que a
// próxima geração vai custar e com o quê — perfil, provedor de texto, TTS,
// chave efetiva e idioma.
function ActiveConfigStrip() {
  const { info, error } = useSettings();

  if (error) {
    return (
      <div className="config-strip" aria-live="polite">
        {`✖ Não foi possível carregar os modelos: ${error}`}
      </div>
    );
  }
  if (!info) {
    return (
      <div className="config-strip" aria-live="polite">
        <span className="muted small">… carregando perfil e modelos</span>
      </div>
    );
  }

  const cli = info.text_provider === "openrouter"
    ? null
    : (info.subscription_clis || []).find((item) => item.key === info.text_provider);
  const textValue = info.text_provider === "openrouter"
    ? `OpenRouter · ${info.text_model}`
    : `${cli ? cli.name : info.text_provider} · ` +
      `${info.subscription_model || (cli && cli.configured_model) || "modelo padrão da CLI"}` +
      `${info.profile_subscription_model ? " (perfil)" : ""}` +
      `${cli && !cli.available ? " · CLI não encontrada" : ""}`;

  return (
    <div className="config-strip" aria-live="polite">
      <span className="config-strip-label">Configuração ativa</span>
      <ConfigChip label="Perfil" value={info.profile} />
      {info.overrides.length > 0 && (
        <ConfigChip
          label="Override"
          value={info.overrides.join(", ")}
          className="warn"
          title="Variáveis de ambiente têm prioridade sobre o perfil ativo"
        />
      )}
      <ConfigChip
        label="Texto"
        value={textValue}
        className={cli && !cli.available ? "warn" : ""}
      />
      <ConfigChip
        label="TTS"
        value={`${info.tts_model}${info.has_key ? "" : " · sem chave"}`}
        className={info.has_key ? "" : "warn"}
      />
      <ConfigChip
        label="Chave efetiva"
        value={info.key_source || "nenhuma"}
        className={info.has_key ? "" : "warn"}
      />
      <ConfigChip label="Idioma" value={info.language === "en" ? "English" : "Português"} />
    </div>
  );
}

function RunningBanner() {
  const { anythingRunning, running } = useStatus();
  if (!anythingRunning) return null;
  const detail = running.map((episode) => {
    const retry = episode.retry
      ? ` · retomando fala ${episode.retry.segment} ` +
        `(${episode.retry.attempt}/${episode.retry.max_attempts})`
      : "";
    const accuracy = episode.cost_exact ? "" : " aprox.";
    const key = episode.key_source ? ` · chave ${episode.key_source}` : "";
    return `${episode.episode_id} (US$ ${episode.cost_usd.toFixed(3)}${accuracy}${key}${retry})`;
  }).join(", ");

  return (
    <div className="banner" role="alert">
      ⚡ Geração em andamento — consumindo créditos! <span>{detail}</span>
    </div>
  );
}

function PlayerDock() {
  const { audioRef, title, visible, handleTimeUpdate } = usePlayer();
  return (
    <section
      className={`player-dock${visible ? "" : " hidden"}`}
      aria-label="Player do episódio"
    >
      <div className="player-title">{title}</div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- áudio gerado por TTS,
          sem faixa de legenda; o texto correspondente vive no teleprompter. */}
      <audio ref={audioRef} controls preload="metadata" onTimeUpdate={handleTimeUpdate}>
        Seu navegador não suporta reprodução de áudio.
      </audio>
    </section>
  );
}

export default function Header({ activeTab, onSelectTab }) {
  const buttonRefs = useRef(new Map());

  const nextTabId = (index, key) => {
    const direction = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
    if (!direction && key !== "Home" && key !== "End") return null;
    if (key === "Home") return TABS[0].id;
    if (key === "End") return TABS[TABS.length - 1].id;
    return TABS[(index + direction + TABS.length) % TABS.length].id;
  };

  return (
    <header>
      <div className="header-row">
        <h1>🎙️ Audiofy Content AI</h1>
        <nav id="tabs" role="tablist" aria-label="Áreas do Audiofy">
          {TABS.map((tab, index) => (
            <button
              key={tab.id}
              ref={(element) => {
                if (element) buttonRefs.current.set(tab.id, element);
                else buttonRefs.current.delete(tab.id);
              }}
              type="button"
              className={`tab${activeTab === tab.id ? " active" : ""}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => onSelectTab(tab.id)}
              onKeyDown={(event) => {
                const next = nextTabId(index, event.key);
                if (!next) return;
                event.preventDefault();
                onSelectTab(next);
                buttonRefs.current.get(next)?.focus();
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <ActiveConfigStrip />
      <RunningBanner />
      <PlayerDock />
    </header>
  );
}

export { TABS };
