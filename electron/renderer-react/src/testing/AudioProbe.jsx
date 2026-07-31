import { usePlayer } from "../state/playerContext.js";

// Em produção o <audio> é montado pelo PlayerDock (Header). Nos testes de
// componentes isolados ele precisa existir do mesmo jeito, senão o contexto do
// player fica sem elemento e ações como "pular para o parágrafo" viram no-op.
export default function AudioProbe() {
  const { audioRef, handleTimeUpdate } = usePlayer();
  return <audio ref={audioRef} onTimeUpdate={handleTimeUpdate} />;
}
