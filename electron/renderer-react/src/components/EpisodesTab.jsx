import { useCallback } from "react";
import { abortEpisode, openProjectPath } from "../lib/audiofyClient.js";
import {
  formatEpisodeDate,
  formatEpisodeDuration,
  formatFileSize,
  generationModeLabel,
} from "../lib/formatters.js";
import { friendlyGenerationError } from "../lib/statusView.js";
import { usePlayer } from "../state/playerContext.js";
import { useStatus } from "../state/statusContext.js";

// Espelha renderEpisodes() de electron/renderer/renderer.js: mesmos textos,
// formatos e classes CSS. O status (e o polling de 2 s enquanto há geração
// rodando) vem do StatusProvider, compartilhado com o header e a aba Conteúdo.

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
    .map((presenter) => `${presenter.speaker}: ${presenter.voice}` +
      `${presenter.style ? ` (${presenter.style})` : ""}`)
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

function EpisodeCard({ episode, onAbort, onPlay, onChunks, onFollow, onOpenFolder }) {
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
        {episode.mp3 && (
          <button
            type="button"
            title="Ouvir"
            aria-label={`Ouvir ${episode.episode_id}`}
            onClick={() => onPlay(episode)}
          >
            ▶️
          </button>
        )}
        <button type="button" className="ghost" onClick={() => onChunks(episode)}>
          🧪 chunks
        </button>
        {episode.mp3 && (
          <button
            type="button"
            className="ghost"
            title="Acompanhar a leitura com o texto na tela"
            onClick={() => onFollow(episode)}
          >
            📖 acompanhar
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

export default function EpisodesTab({ onOpenChunks, onOpenTeleprompter }) {
  const { episodes, error, refresh } = useStatus();
  const { playEpisode } = usePlayer();

  const handleAbort = useCallback(async (episode) => {
    await abortEpisode(episode.episode_id, episode.language);
    refresh();
  }, [refresh]);

  const handleOpenFolder = useCallback(async (episode) => {
    const failure = await openProjectPath(episode.dir);
    if (failure) alert(failure);
  }, []);

  const completed = episodes.filter((episode) => episode.mp3).length;
  const summary = episodes.length
    ? `${completed} áudio(s) pronto(s) em ${episodes.length} registro(s), ` +
      "do mais recente ao mais antigo."
    : "Nenhum episódio gerado ainda.";

  return (
    <section className="panel">
      <h2>Todos os episódios</h2>
      <div className="form-row">
        <button type="button" onClick={refresh}>🔄 Atualizar</button>
      </div>
      {error && <p className="muted" role="alert">{`Erro ao carregar episódios: ${error}`}</p>}
      {!error && <p className="muted small" role="status">{summary}</p>}
      <ul id="episodes">
        {!error && episodes.length === 0 && <li className="muted">Nenhum episódio ainda.</li>}
        {episodes.map((episode) => (
          <EpisodeCard
            key={`${episode.episode_id}:${episode.language || "pt-BR"}`}
            episode={episode}
            onAbort={handleAbort}
            onPlay={() => playEpisode(episode.mp3, episode.title || episode.episode_id)}
            onChunks={() => onOpenChunks(
              episode.episode_id, episode.title || episode.episode_id, episode.language
            )}
            onFollow={() => onOpenTeleprompter(episode)}
            onOpenFolder={handleOpenFolder}
          />
        ))}
      </ul>
    </section>
  );
}
