import { useEffect, useRef, useState } from "react";
import { getAudioChunks, regenerateChunks } from "../lib/audiofyClient.js";
import { chunkSeverityLabel, qualityIssuesLabel, speakerLabel } from "../lib/formatters.js";
import { usePlayer } from "../state/playerContext.js";
import ModalTransport from "./ModalTransport.jsx";

// Revisão dos chunks: toca trechos avulsos, não o episódio. Por isso o player
// é pausado ao abrir — a fonte vai ser trocada assim que um chunk for escolhido.
export default function ChunkModal({ target, onClose }) {
  const dialogRef = useRef(null);
  const [data, setData] = useState(null);
  const [nowPlaying, setNowPlaying] = useState("Escolha um chunk para ouvir.");
  const [selected, setSelected] = useState([]);
  const [redoing, setRedoing] = useState(false);
  const { pause, playChunk } = usePlayer();

  useEffect(() => {
    if (!target) return undefined;
    let cancelled = false;
    pause();
    setNowPlaying("Escolha um chunk para ouvir.");
    getAudioChunks(target.episodeId, target.language).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        alert(result.error);
        onClose();
        return;
      }
      setData(result);
      // Já vem marcado o que a auditoria reprovou: é o que o usuário veio
      // refazer. Ele ainda pode desmarcar ou incluir outros.
      setSelected(
        (result.chunks || [])
          .filter((chunk) => (chunk.quality_issues || []).length > 0)
          .map((chunk, index) => chunk.chunk_index || index + 1)
      );
    });
    return () => {
      cancelled = true;
    };
  }, [target, onClose, pause]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !data) return undefined;
    if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
    const handleCancel = (event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [data, onClose]);

  if (!target || !data) return null;

  const audit = data.audit;
  const quality = data.quality;

  const alternar = (indice) =>
    setSelected((atual) =>
      atual.includes(indice) ? atual.filter((i) => i !== indice) : [...atual, indice].sort((a, b) => a - b)
    );

  const refazer = async () => {
    if (!selected.length) return;
    const confirmado = confirm(
      `Refazer ${selected.length} trecho(s): ${selected.join(", ")}?\n\n` +
      "Só esses trechos são sintetizados de novo; o resto do episódio é reaproveitado. " +
      "Consome créditos do OpenRouter, na proporção do que for refeito.\n\n" +
      "A degradação varia entre chamadas, então refazer costuma melhorar — mas não é garantido."
    );
    if (!confirmado) return;
    setRedoing(true);
    try {
      const resultado = await regenerateChunks(
        data.source_key || "custom", target.episodeId, selected, target.language
      );
      if (!resultado.ok || !resultado.started) {
        alert(`Não foi possível refazer: ${resultado.reason || resultado.error}`);
        return;
      }
      alert(
        `Refazendo ${resultado.chunks.length} trecho(s). ` +
        `Custo estimado: US$ ${(resultado.estimated_cost_usd || 0).toFixed(3)}. ` +
        "Acompanhe pelo progresso da geração."
      );
      onClose();
    } finally {
      setRedoing(false);
    }
  };

  return (
    <dialog ref={dialogRef} aria-labelledby="chunk-modal-title">
      <div className="modal-header">
        <div>
          <h2 id="chunk-modal-title">{`Revisão dos chunks · ${target.title}`}</h2>
          <p className="muted small">
            {audit
              ? `${audit.segments} chunks · ${audit.critical} crítico(s) · ${audit.warnings} aviso(s)`
              : "Ainda não há auditoria automática para este episódio."}
          </p>
          <p className="muted small">
            Critérios: ok (&lt; 2,5 s) · aviso (≥ 2,5 s) · crítico (≥ 5 s ou ≥ 35% do chunk em silêncio)
          </p>
          {quality && (
            <p className="muted small">
              {quality.com_problema
                ? `Qualidade sonora: ${quality.com_problema} de ${quality.total} trecho(s) destoam do episódio — marque e refaça abaixo.`
                : `Qualidade sonora: ${quality.total} trecho(s) medidos, nenhum destoa do episódio.`}
            </p>
          )}
        </div>
        <button type="button" className="ghost" aria-label="Fechar revisão" onClick={onClose}>
          ✕
        </button>
      </div>

      <ModalTransport />

      <p className="muted small">{nowPlaying}</p>

      <ul className="chunk-list">
        {data.chunks.map((chunk, index) => {
          const chunkIndex = chunk.chunk_index || index + 1;
          const chunkTotal = chunk.chunk_total || data.chunks.length;
          const duration = Number.isFinite(chunk.duration_seconds)
            ? `${chunk.duration_seconds.toFixed(1)}s`
            : "duração desconhecida";
          const silence = Number.isFinite(chunk.longest_silence_seconds)
            ? ` · maior silêncio ${chunk.longest_silence_seconds.toFixed(1)}s`
            : "";
          return (
            <li key={chunk.path || `${chunkIndex}`} className={`chunk-row severity-${chunk.severity}`}>
              <label className="chunk-pick">
                <input
                  type="checkbox"
                  checked={selected.includes(chunkIndex)}
                  onChange={() => alternar(chunkIndex)}
                  aria-label={`Selecionar trecho ${chunkIndex} para refazer`}
                />
              </label>
              <div className="row-main">
                <span className="row-title">
                  {`Chunk ${chunkIndex} de ${chunkTotal}${speakerLabel(chunk)}`}
                </span>
                <span className="muted small">
                  {`${chunk.file} · ${duration} · ${chunkSeverityLabel(chunk)}${silence}`}
                </span>
                {qualityIssuesLabel(chunk) && (
                  <span className="muted small">{`⚠ ${qualityIssuesLabel(chunk)}`}</span>
                )}
              </div>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  playChunk(chunk.path, `Chunk ${chunkIndex} de ${chunkTotal} · ${target.title}`);
                  setNowPlaying(`Tocando chunk ${chunkIndex} de ${chunkTotal} · ${chunk.file}`);
                }}
              >
                ▶️ ouvir
              </button>
            </li>
          );
        })}
      </ul>

      <div className="chunk-actions">
        <button type="button" disabled={!selected.length || redoing} onClick={refazer}>
          {redoing
            ? "⏳ Iniciando…"
            : `🔁 Refazer ${selected.length} trecho(s) selecionado(s)`}
        </button>
        <span className="muted small">
          Refazer sintetiza de novo só o que estiver marcado; o resto do episódio é reaproveitado.
        </span>
      </div>
    </dialog>
  );
}
