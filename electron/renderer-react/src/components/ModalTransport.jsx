import { useEffect, useState } from "react";
import { formatSeconds } from "../lib/formatters.js";
import { usePlayer } from "../state/playerContext.js";

// Botão tocar/pausar de um modal, espelhando o estado real do player do dock.
// Os listeners são removidos ao desmontar: o <audio> é persistente, então cada
// abertura empilharia mais um conjunto se ficassem soltos.
export default function ModalTransport({ children }) {
  const { getPlayer, togglePlay } = usePlayer();
  const [paused, setPaused] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const player = getPlayer();
    if (!player) return undefined;
    const render = () => {
      setPaused(player.paused);
      setElapsed(player.currentTime);
    };
    const events = ["play", "pause", "timeupdate", "loadedmetadata"];
    for (const event of events) player.addEventListener(event, render);
    render();
    return () => {
      for (const event of events) player.removeEventListener(event, render);
    };
  }, [getPlayer]);

  return (
    <div className="modal-transport">
      <button
        type="button"
        className="ghost"
        aria-label="Reproduzir ou pausar"
        onClick={togglePlay}
      >
        {paused ? "▶️ Tocar" : "⏸️ Pausar"}
      </button>
      <span className="muted small" role="timer">{formatSeconds(elapsed)}</span>
      {children}
    </div>
  );
}
