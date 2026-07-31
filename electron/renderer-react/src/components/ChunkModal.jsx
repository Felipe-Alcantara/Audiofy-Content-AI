import { useEffect, useRef, useState } from "react";
import { getAudioChunks } from "../lib/audiofyClient.js";
import { chunkSeverityLabel, speakerLabel } from "../lib/formatters.js";
import { usePlayer } from "../state/playerContext.js";
import ModalTransport from "./ModalTransport.jsx";

// Revisão dos chunks: toca trechos avulsos, não o episódio. Por isso o player
// é pausado ao abrir — a fonte vai ser trocada assim que um chunk for escolhido.
export default function ChunkModal({ target, onClose }) {
  const dialogRef = useRef(null);
  const [data, setData] = useState(null);
  const [nowPlaying, setNowPlaying] = useState("Escolha um chunk para ouvir.");
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
              <div className="row-main">
                <span className="row-title">
                  {`Chunk ${chunkIndex} de ${chunkTotal}${speakerLabel(chunk)}`}
                </span>
                <span className="muted small">
                  {`${chunk.file} · ${duration} · ${chunkSeverityLabel(chunk)}${silence}`}
                </span>
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
    </dialog>
  );
}
