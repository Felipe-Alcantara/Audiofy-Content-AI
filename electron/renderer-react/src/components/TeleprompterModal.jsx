import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAudioChunks } from "../lib/audiofyClient.js";
import { speakerLabel } from "../lib/formatters.js";
import { usePlayer } from "../state/playerContext.js";
import ModalTransport from "./ModalTransport.jsx";
import useDragScroll from "./useDragScroll.js";

// Acompanhar a leitura: o áudio segue tocando no dock (de onde nunca sai) e o
// texto destaca o parágrafo atual. Abrir ou fechar aqui nunca pausa nada.
export default function TeleprompterModal({ episode, onClose }) {
  const dialogRef = useRef(null);
  const textRef = useRef(null);
  const turnRefs = useRef(new Map());
  const [data, setData] = useState(null);
  const [activeNumber, setActiveNumber] = useState(null);
  const [followHidden, setFollowHidden] = useState(true);
  const [gotoValue, setGotoValue] = useState("");
  const { getPlayer, prepareEpisode, seekTo, show } = usePlayer();

  useEffect(() => {
    if (!episode) return undefined;
    let cancelled = false;
    setData(null);
    setActiveNumber(null);
    setGotoValue("");
    getAudioChunks(episode.episode_id, episode.language).then(async (result) => {
      if (cancelled) return;
      if (!result.ok) {
        alert(result.error);
        onClose();
        return;
      }
      const title = episode.title || episode.episode_id;
      // O player fica à vista com o modal aberto; sem nomear o episódio, o dock
      // anunciaria "Nenhum episódio selecionado" enquanto toca justamente ele.
      if (episode.mp3) await prepareEpisode(episode.mp3, title);
      else show(title);
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [episode, onClose, prepareEpisode, show]);

  const turns = useMemo(() => {
    if (!data) return [];
    const ordered = [...data.chunks].sort(
      (a, b) => (a.chunk_index || 0) - (b.chunk_index || 0)
    );
    let paragraphNumber = 0;
    return ordered.filter((chunk) => chunk.text).map((chunk) => {
      paragraphNumber += 1;
      return { chunk, paragraphNumber };
    });
  }, [data]);

  const hasTiming = useMemo(() => Boolean(data) && data.chunks.every(
    (chunk) => chunk.start_seconds !== null && chunk.end_seconds !== null
  ), [data]);

  // Mostra "voltar ao parágrafo atual" só quando o destaque sai da área visível
  // (rolar para ler à frente não deve disparar o botão com ele ainda à vista).
  const updateFollowButton = useCallback(() => {
    const container = textRef.current;
    const element = activeNumber !== null ? turnRefs.current.get(activeNumber) : null;
    if (!container || !element) {
      setFollowHidden(true);
      return;
    }
    const containerBox = container.getBoundingClientRect();
    const activeBox = element.getBoundingClientRect();
    setFollowHidden(activeBox.bottom > containerBox.top && activeBox.top < containerBox.bottom);
  }, [activeNumber]);

  useEffect(() => {
    if (!data || !hasTiming) return undefined;
    const player = getPlayer();
    if (!player) return undefined;
    const handler = () => {
      const current = player.currentTime;
      const entry = turns.find(
        ({ chunk }) => current >= chunk.start_seconds && current < chunk.end_seconds
      );
      // timeupdate dispara várias vezes por segundo; só reagir quando o
      // parágrafo ativo muda de fato, senão a tela "sobe sozinha" cancelando
      // qualquer rolagem manual do usuário.
      setActiveNumber((previous) => {
        const next = entry ? entry.paragraphNumber : null;
        return previous === next ? previous : next;
      });
    };
    player.addEventListener("timeupdate", handler);
    return () => player.removeEventListener("timeupdate", handler);
  }, [data, getPlayer, hasTiming, turns]);

  useEffect(() => {
    if (activeNumber === null) return;
    turnRefs.current.get(activeNumber)?.scrollIntoView({ block: "center", behavior: "smooth" });
    updateFollowButton();
  }, [activeNumber, updateFollowButton]);

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

  useDragScroll(textRef, Boolean(data));

  if (!episode || !data) return null;

  const title = episode.title || episode.episode_id;
  const chunksWithText = turns.length;

  const jumpTo = (entry) => {
    seekTo(entry.chunk.start_seconds);
    setActiveNumber(entry.paragraphNumber);
  };

  return (
    <dialog ref={dialogRef} aria-labelledby="teleprompter-modal-title">
      <div className="modal-header">
        <div>
          <h2 id="teleprompter-modal-title">{`Acompanhar a leitura · ${title}`}</h2>
          <p className="muted small">
            {chunksWithText
              ? `${chunksWithText} trecho(s) de texto disponível para acompanhamento.`
              : "Este episódio não tem texto por trecho registrado (gerado antes desse recurso)."}
          </p>
        </div>
        <button type="button" className="ghost" aria-label="Fechar acompanhamento" onClick={onClose}>
          ✕
        </button>
      </div>

      <ModalTransport>
        <span className="muted small">O player do topo continua controlando a reprodução.</span>
      </ModalTransport>

      <p className="muted small">
        {hasTiming
          ? "Toque o episódio para acompanhar o texto."
          : "Sem auditoria de áudio completa: o destaque automático e o pulo por parágrafo não estão disponíveis, só o texto."}
      </p>

      <form
        className="teleprompter-goto"
        onSubmit={(event) => {
          event.preventDefault();
          if (!hasTiming) return;
          const target = Number.parseInt(gotoValue, 10);
          const entry = turns.find((item) => item.paragraphNumber === target);
          if (!entry) return;
          jumpTo(entry);
        }}
      >
        <label htmlFor="teleprompter-goto-input">Ir para o parágrafo</label>
        <input
          id="teleprompter-goto-input"
          type="number"
          min="1"
          max={turns.length || undefined}
          inputMode="numeric"
          value={gotoValue}
          onChange={(event) => setGotoValue(event.target.value)}
        />
        <button type="submit" className="ghost">Pular</button>
      </form>

      <div className="teleprompter-scroll-area">
        <div
          ref={textRef}
          className="teleprompter-text"
          aria-live="polite"
          onScroll={updateFollowButton}
        >
          {turns.map(({ chunk, paragraphNumber }) => {
            const isCommentary = chunk.kind === "commentary";
            const label = isCommentary
              ? "comentário do narrador"
              : speakerLabel(chunk).replace(/^ · /, "");
            const classNames = ["teleprompter-turn"];
            if (isCommentary) classNames.push("commentary");
            if (hasTiming) classNames.push("clickable");
            if (activeNumber === paragraphNumber) classNames.push("active");
            const timingProps = hasTiming
              ? {
                role: "button",
                tabIndex: 0,
                title: "Clique para pular o áudio para este parágrafo",
                onClick: () => jumpTo({ chunk, paragraphNumber }),
                onKeyDown: (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    jumpTo({ chunk, paragraphNumber });
                  }
                },
              }
              : {};
            return (
              <div
                key={paragraphNumber}
                ref={(element) => {
                  if (element) turnRefs.current.set(paragraphNumber, element);
                  else turnRefs.current.delete(paragraphNumber);
                }}
                className={classNames.join(" ")}
                {...timingProps}
              >
                <span className="turn-number">{paragraphNumber}</span>
                <div className="turn-body">
                  {label && <span className="turn-speaker">{label}</span>}
                  {chunk.text}
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className={`teleprompter-follow${followHidden ? " hidden" : ""}`}
          onClick={() => {
            turnRefs.current.get(activeNumber)
              ?.scrollIntoView({ block: "center", behavior: "smooth" });
            updateFollowButton();
          }}
        >
          ↓ Voltar ao parágrafo atual
        </button>
      </div>
    </dialog>
  );
}
