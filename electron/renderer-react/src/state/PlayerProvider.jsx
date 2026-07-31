import { useCallback, useMemo, useRef, useState } from "react";
import { PlayerContext } from "./playerContext.js";
import { getPlaybackPosition, savePlaybackPosition } from "../lib/audiofyClient.js";
import { projectPathToFileUrl } from "../lib/formatters.js";

// Único <audio> real do app: ele é renderizado pelo PlayerDock no header e
// NUNCA sai de lá. Os modais (chunks, teleprompter) só o comandam por este
// contexto — mover um <audio> em reprodução pelo DOM faz o Chromium reiniciar
// a mídia, que foi exatamente o bug corrigido no renderer vanilla.

// Chamar a bridge (que spawna um processo Python) a cada tick de timeupdate
// seria custoso: persiste no máximo a cada poucos segundos.
const PLAYBACK_POSITION_SAVE_INTERVAL_MS = 3000;

// play() devolve uma Promise nos navegadores modernos, mas nem todo ambiente
// (jsdom nos testes, engines antigas) implementa isso — checar antes evita
// quebrar a reprodução por causa de um .catch em undefined.
function safePlay(player) {
  const played = player.play();
  if (played && typeof played.catch === "function") played.catch(() => player.focus());
}

export default function PlayerProvider({ children }) {
  const audioRef = useRef(null);
  const lastSaveAtRef = useRef(0);
  const [title, setTitle] = useState("Nenhum episódio selecionado");
  const [visible, setVisible] = useState(false);

  const getPlayer = useCallback(() => audioRef.current, []);

  // currentTime definido logo após src/load() é ignorado silenciosamente,
  // porque o elemento ainda não resolveu metadata/seekability nesse instante.
  const seekWhenReady = useCallback((player, seconds) => {
    const applyPosition = () => {
      player.currentTime = seconds;
    };
    if (player.readyState >= HTMLMediaElement.HAVE_METADATA) applyPosition();
    else player.addEventListener("loadedmetadata", applyPosition, { once: true });
  }, []);

  // Troca a fonte só quando ela muda de fato; devolve se houve troca, porque
  // quem chama precisa saber se vale ler a posição salva.
  const setSource = useCallback((path) => {
    const player = audioRef.current;
    const url = projectPathToFileUrl(path);
    if (!player || player.dataset.source === url) return { player, url, changed: false };
    player.pause();
    player.src = url;
    player.dataset.source = url;
    player.load();
    return { player, url, changed: true };
  }, []);

  const show = useCallback((episodeTitle) => {
    if (episodeTitle) setTitle(`🎧 ${episodeTitle}`);
    setVisible(true);
  }, []);

  // Toca um episódio retomando de onde o usuário parou. A posição precisa ser
  // lida ANTES de trocar dataset.source: assim que ele aponta para a nova URL,
  // o listener de timeupdate já trata o player como válido para salvar — e
  // load() dispara timeupdate com currentTime=0 durante o await, sobrescrevendo
  // a posição salva com zero antes dela ser aplicada.
  const playEpisode = useCallback(async (path, episodeTitle) => {
    const player = audioRef.current;
    if (!player) return;
    const url = projectPathToFileUrl(path);
    const isNewSource = player.dataset.source !== url;
    const savedPosition = isNewSource ? await getPlaybackPosition(url) : null;
    setSource(path);
    show(episodeTitle);
    if (savedPosition !== null) seekWhenReady(player, savedPosition);
    safePlay(player);
  }, [seekWhenReady, setSource, show]);

  // Trecho avulso da revisão de chunks: sem retomada, e o dock anuncia o que
  // está tocando de verdade — um chunk, não o episódio inteiro.
  const playChunk = useCallback((path, chunkTitle) => {
    const player = audioRef.current;
    if (!player) return;
    setSource(path);
    show(chunkTitle);
    safePlay(player);
  }, [setSource, show]);

  // Carrega o episódio sem tocar (o teleprompter abre sobre o que já está
  // tocando; se for outro episódio, prepara a fonte e a posição salva).
  const prepareEpisode = useCallback(async (path, episodeTitle) => {
    const player = audioRef.current;
    if (!player) return;
    const url = projectPathToFileUrl(path);
    if (player.dataset.source !== url) {
      const savedPosition = await getPlaybackPosition(url);
      setSource(path);
      if (savedPosition !== null) seekWhenReady(player, savedPosition);
    }
    show(episodeTitle);
  }, [seekWhenReady, setSource, show]);

  const seekTo = useCallback((seconds, { playIfPaused = true } = {}) => {
    const player = audioRef.current;
    if (!player) return;
    player.currentTime = seconds;
    if (playIfPaused && player.paused) safePlay(player);
  }, []);

  const togglePlay = useCallback(() => {
    const player = audioRef.current;
    if (!player) return;
    if (player.paused) safePlay(player);
    else player.pause();
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  // Listener permanente: salva a posição para retomar na próxima escuta, mesmo
  // depois de fechar o app. Um timeupdate pode disparar com currentTime=0 logo
  // após load(), antes da posição salva ser aplicada — gravar nesse instante
  // sobrescreveria um resume válido com zero; um player pausado nunca teve
  // progresso real desta sessão para registrar.
  const handleTimeUpdate = useCallback(() => {
    const player = audioRef.current;
    if (!player || !player.dataset.source || player.paused) return;
    const now = Date.now();
    if (now - lastSaveAtRef.current < PLAYBACK_POSITION_SAVE_INTERVAL_MS) return;
    lastSaveAtRef.current = now;
    savePlaybackPosition(player.dataset.source, player.currentTime);
  }, []);

  const value = useMemo(() => ({
    audioRef, title, visible, show, getPlayer, playEpisode, playChunk,
    prepareEpisode, seekTo, togglePlay, pause, handleTimeUpdate, setTitle,
  }), [title, visible, show, getPlayer, playEpisode, playChunk, prepareEpisode,
    seekTo, togglePlay, pause, handleTimeUpdate]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
