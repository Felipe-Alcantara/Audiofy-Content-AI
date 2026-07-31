import { useCallback, useEffect, useRef, useState } from "react";
import { abortEpisode, getStatus, openProjectPath } from "./audiofyClient.js";
import {
  formatEpisodeDate,
  formatEpisodeDuration,
  formatFileSize,
  generationModeLabel,
} from "./formatters.js";

// Espelha renderEpisodes()/refreshStatus() de electron/renderer/renderer.js:
// mesmos textos, formatos e classes CSS. Ações que dependem de superfícies ainda
// não migradas (player do header, modal de chunks, teleprompter) ficam de fora
// desta etapa — ver IA.md.
const POLL_INTERVAL_MS = 2000;

// friendlyGenerationError vive em renderer/status-view.js, carregado como script
// clássico antes do bundle (index-react.html). Ler de window evita duplicar a regra.
function friendlyGenerationError(error, keySource) {
  const statusView = typeof window !== "undefined" ? window.audiofyStatusView : null;
  if (statusView && typeof statusView.friendlyGenerationError === "function") {
    return statusView.friendlyGenerationError(error, keySource);
  }
  return String(error || "");
}

function EpisodeFact({ label, value }) {
  return (
    <div className="episode-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function productionLine(episode) {
  const accuracy = episode.cost_exact ? "" : " aprox.";
  const cost = episode.cost_usd
    ? `US$ ${episode.cost_usd.toFixed(4)}${accuracy}`
    : "custo não registrado";
  const words = Number.isFinite(episode.source_words)
    ? ` · ${episode.source_words.toLocaleString("pt-BR")} palavras de origem`
    : "";
  const audit = episode.audio_audit
    ? ` · auditoria: ${episode.audio_audit.critical} crítico(s), ` +
      `${episode.audio_audit.warnings} aviso(s)`
    : " · sem auditoria";
  const profile = episode.profile_name ? ` · perfil ${episode.profile_name}` : "";
  const music = episode.background_music ? ` · música ${episode.background_music}` : "";
  const source = episode.source_key ? `fonte ${episode.source_key} · ` : "";
  const presenters = (episode.presenters || [])
    .map((p) => `${p.speaker}: ${p.voice}${p.style ? ` (${p.style})` : ""}`)
    .join(", ");
  const voices = presenters
    ? ` · vozes: ${presenters}`
    : episode.narration_voice
      ? ` · voz: ${episode.narration_voice}`
      : "";
  return (
    `${source}${generationModeLabel(episode.generation_mode)} · ` +
    `${cost}${profile}${words}${audit}${music}${voices}`
  );
}

function productionTitle(episode) {
  const parts = [];
  if (episode.source_file) parts.push(`Fonte preservada: ${episode.source_file}`);
  if (episode.tts_model) parts.push(`TTS: ${episode.tts_model}`);
  return parts.join(" · ") || undefined;
}

function EpisodeCard({ episode, onAbort, onOpenFolder }) {
  const progress = episode.state === "rodando" && episode.progress && episode.progress.total
    ? ` · ${episode.progress.current}/${episode.progress.total}`
    : "";
  const retry = episode.retry
    ? ` · retry ${episode.retry.attempt}/${episode.retry.max_attempts}`
    : "";
  const rowTitle = episode.state === "falhou" && episode.last_error
    ? friendlyGenerationError(episode.last_error, episode.key_source)
    : undefined;

  return (
    <li className="episode-card" title={rowTitle}>
      <span className={`episode-state-dot state-${episode.state}`}>●</span>
      <div className="episode-card-body">
        <div className="episode-heading">
          <div className="episode-identity">
            <h3 className="episode-title">{episode.title || episode.episode_id}</h3>
            <code className="episode-id">{episode.episode_id}</code>
          </div>
          <span className={`badge episode-state state-${episode.state}`}>
            {`${episode.state}${progress}${retry}`}
          </span>
        </div>
        <dl className="episode-facts">
          <EpisodeFact
            label="Criação do conteúdo"
            value={formatEpisodeDate(episode.source_created_at)}
          />
          <EpisodeFact
            label="Geração do áudio"
            value={formatEpisodeDate(episode.generated_at, true)}
          />
          <EpisodeFact label="Duração" value={formatEpisodeDuration(episode.duration_seconds)} />
          <EpisodeFact
            label="Arquivo"
            value={episode.file_name
              ? `${episode.file_name} · ${formatFileSize(episode.file_size_bytes)}`
              : "ainda não gerado"}
          />
        </dl>
        <p className="episode-production muted small" title={productionTitle(episode)}>
          {productionLine(episode)}
        </p>
      </div>
      <div className="episode-actions">
        {episode.state === "rodando" && !episode.abort_requested_at && (
          <button
            type="button"
            title="Abortar"
            aria-label={`Abortar ${episode.episode_id}`}
            onClick={() => onAbort(episode)}
          >
            🛑
          </button>
        )}
        <button
          type="button"
          title="Abrir pasta"
          aria-label={`Abrir pasta de ${episode.episode_id}`}
          onClick={() => onOpenFolder(episode)}
        >
          📂
        </button>
      </div>
    </li>
  );
}

export default function EpisodesTab() {
  const [state, setState] = useState({ status: "loading", episodes: [], error: null });
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    const overview = await getStatus();
    if (!mountedRef.current) return;
    if (!overview || !overview.ok) {
      setState({
        status: "error",
        episodes: [],
        error: overview ? overview.error : "Erro desconhecido.",
      });
      return;
    }
    setState({ status: "loaded", episodes: overview.episodes || [], error: null });
    clearTimeout(timerRef.current);
    // Mesmo polling do vanilla: só enquanto alguma geração está rodando.
    if (overview.anything_running) timerRef.current = setTimeout(load, POLL_INTERVAL_MS);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
    };
  }, [load]);

  const handleAbort = useCallback(async (episode) => {
    await abortEpisode(episode.episode_id, episode.language);
    load();
  }, [load]);

  const handleOpenFolder = useCallback(async (episode) => {
    const error = await openProjectPath(episode.dir);
    if (error) alert(error);
  }, []);

  const episodes = state.episodes;
  const completed = episodes.filter((episode) => episode.mp3).length;
  const summary = episodes.length
    ? `${completed} áudio(s) pronto(s) em ${episodes.length} registro(s), ` +
      "do mais recente ao mais antigo."
    : "Nenhum episódio gerado ainda.";

  return (
    <section className="panel">
      <h2>Todos os episódios</h2>
      <div className="row-actions">
        <button type="button" onClick={load}>🔄 Atualizar</button>
      </div>
      {state.status === "error" && (
        <p className="muted" role="alert">
          Erro ao carregar episódios: {state.error}
        </p>
      )}
      {state.status !== "error" && (
        <p className="muted small" role="status">{summary}</p>
      )}
      <ul>
        {episodes.length === 0 && state.status !== "error" && (
          <li className="muted">Nenhum episódio ainda.</li>
        )}
        {episodes.map((episode) => (
          <EpisodeCard
            key={`${episode.episode_id}:${episode.language || "pt-BR"}`}
            episode={episode}
            onAbort={handleAbort}
            onOpenFolder={handleOpenFolder}
          />
        ))}
      </ul>
    </section>
  );
}
