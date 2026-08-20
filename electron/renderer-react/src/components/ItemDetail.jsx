import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  abortEpisode,
  chooseBackgroundMusic,
  exportMarkers,
  exportNotebookLm,
  generateEpisode,
  getBalance,
  openProjectPath,
  reextractFile,
  repairEpisode,
} from "../lib/audiofyClient.js";
import { generationModeLabel } from "../lib/formatters.js";
import { canAutoResumeKeyLimit, isKeyLimitFailure } from "../lib/statusView.js";
import { sortVoicesByLanguage, voiceOptionLabel } from "../lib/voices.js";
import { usePlayer } from "../state/playerContext.js";
import { useSettings } from "../state/settingsContext.js";
import { useStatus } from "../state/statusContext.js";
import GenerationLogPanel from "./GenerationLogPanel.jsx";
import GenerationProgress from "./GenerationProgress.jsx";

const AUTOMATIC_RESUME_RECHECK_MS = 60 * 1000;

const MODE_NOTES = {
  verbatim:
    "O texto falado é preservado integralmente. A IA planeja apenas ritmo, pausas, " +
    "emoção e tensão em lotes retomáveis.",
  reflexive:
    "O texto é lido integralmente, parágrafo a parágrafo. Após cada parágrafo, " +
    "o narrador acrescenta um breve comentário reflexivo, explicativo ou contextual.",
  adaptation: "Cria matriz de cobertura, adapta o texto como roteiro e audita o resultado.",
};

// Na voz estável não há planejamento de interpretação: repetir a nota padrão
// da leitura fiel aqui prometeria uma etapa que não vai acontecer.
const STABLE_MODE_NOTES = {
  verbatim: "O texto falado é preservado integralmente, em trechos maiores e retomáveis, "
    + "sem etapa de planejamento de interpretação.",
};

const STABILITY_NOTES = {
  natural: "A IA planeja emoção, ritmo e pausas trecho a trecho: mais expressivo, "
    + "porém o tom varia ao longo do áudio.",
  estavel: "Uma direção vocal única para a obra inteira, trechos maiores e volume "
    + "nivelado entre eles: menos variação de tom, sem etapa de planejamento.",
};

const FORCE_LABELS = {
  verbatim: "Replanejar interpretação e regenerar áudios",
  reflexive: "Replanejar leitura reflexiva e regenerar áudios",
  adaptation: "Regenerar cobertura, roteiro e auditoria",
};

function generationArgs(source, itemId, options) {
  const { mode, voice, language, force, backgroundMusic, volume, stability } = options;
  const args = ["generate", source, itemId, `--mode=${mode}`];
  if (mode === "verbatim" || mode === "reflexive") args.push(`--voice=${voice}`);
  // Só as leituras têm direção vocal por trecho; no podcast adaptado a opção
  // não existe e mandá-la seria ruído no contrato da bridge.
  if (stability && (mode === "verbatim" || mode === "reflexive")) {
    args.push(`--stability=${stability}`);
  }
  if (force) args.push("--force");
  if (backgroundMusic) {
    args.push(`--background-music=${backgroundMusic}`);
    args.push(`--background-volume=${volume || 0.08}`);
  }
  if (language !== "pt-BR") args.push(`--language=${language}`);
  return args;
}

export default function ItemDetail({ item, source, onItemsChanged, onOpenChunks }) {
  const { info } = useSettings();
  const { episodes, refresh: refreshStatus } = useStatus();
  const { playEpisode } = usePlayer();

  const [mode, setMode] = useState("adaptation");
  const [language, setLanguage] = useState("pt-BR");
  const [voice, setVoice] = useState("");
  const [voiceTouched, setVoiceTouched] = useState(false);
  const [stability, setStability] = useState("natural");
  const [targetMinutes, setTargetMinutes] = useState("");
  const [stabilityTouched, setStabilityTouched] = useState(false);
  const [force, setForce] = useState(false);
  const [music, setMusic] = useState({ path: null, name: null });
  const [volumePercent, setVolumePercent] = useState(8);
  const [requestPending, setRequestPending] = useState(false);
  const [request, setRequest] = useState(null);
  const [reextracting, setReextracting] = useState(false);
  const resumeAttempts = useRef(new Set());

  const profileVoice = info && info.presenters.length === 1 ? info.presenters[0].voice : "";
  const voiceEntries = useMemo(() => {
    const catalog = (info && info.voice_catalogs && info.voice_catalogs[info.tts_model]) || {};
    return sortVoicesByLanguage(Object.entries(catalog));
  }, [info]);
  // Modelos sem catálogo (ex.: Orpheus) aceitam qualquer nome de voz na API: a
  // voz do perfil precisa existir como opção, senão o campo cai vazio e dispara
  // "Escolha a voz do narrador." à toa.
  const catalogUnavailable = voiceEntries.length === 0 && !profileVoice;

  // O idioma do seletor acompanha o perfil ativo; a voz só é sobreposta por
  // escolha deliberada do usuário (a roda do mouse sobre um <select> troca a
  // opção no Chromium sem ele perceber, e isso decide a voz do episódio todo).
  useEffect(() => {
    if (info) setLanguage(info.language || "pt-BR");
  }, [info]);

  // O perfil define o padrão de estabilidade; a escolha por episódio só o
  // sobrepõe quando o usuário mexe no seletor.
  useEffect(() => {
    if (info && !stabilityTouched) setStability(info.voice_stability || "natural");
  }, [info, stabilityTouched]);

  useEffect(() => {
    if (voiceTouched) return;
    const preferred = profileVoice || "Sulafat";
    const available = voiceEntries.map(([name]) => name);
    if (profileVoice && !available.includes(profileVoice)) setVoice(profileVoice);
    else if (available.includes(preferred)) setVoice(preferred);
    else setVoice(available[0] || "");
  }, [profileVoice, voiceEntries, voiceTouched]);

  // Um item novo zera as escolhas específicas do anterior.
  useEffect(() => {
    setMusic({ path: null, name: null });
    setRequest(null);
    setForce(false);
    setStabilityTouched(false);
  }, [item.item_id]);

  const status = episodes.find(
    (episode) => episode.episode_id === item.item_id
      && (episode.language || "pt-BR") === language
  );
  const running = Boolean(status && status.state === "rodando");
  const done = Boolean(status && status.mp3);
  const auditProblems = Boolean(status && status.audio_audit
    && (status.audio_audit.critical > 0 || status.audio_audit.warnings > 0));
  const locked = running;

  const estimate = (item.estimates && item.estimates[mode]) || item.estimate;
  const actual = item.actual;

  // Quanto texto cabe na duração que o vídeo precisa ter. A taxa de leitura vem
  // do histórico real deste modelo e voz, não de uma média de mercado: medindo
  // o próprio áudio é que se descobriu a velocidade com que ele lê de fato.
  const alvo = Number.parseFloat(targetMinutes);
  const taxa = estimate.speaking_rate_wpm;
  const encaixe = Number.isFinite(alvo) && alvo > 0 && taxa > 0
    ? (() => {
      const cabem = Math.floor(alvo * taxa);
      const sobra = Math.max(0, (item.words || 0) - cabem);
      return {
        cabem,
        sobra,
        proporcao: item.words ? sobra / item.words : 0,
        atual: (item.words || 0) / taxa,
      };
    })()
    : null;

  const estimateLine = actual && (actual.generation_mode || "adaptation") === mode
    ? `Realizado: US$ ${actual.cost_usd.toFixed(4)} ` +
      `(${actual.cost_exact ? "confirmado pelo provedor" : "aproximado"}) · ` +
      `${(actual.duration_seconds / 60).toFixed(1)} min`
    : `Estimativa: ~US$ ${estimate.cost_usd.toFixed(2)} ` +
      `(faixa US$ ${estimate.cost_min_usd.toFixed(2)}–${estimate.cost_max_usd.toFixed(2)}) · ` +
      `~${estimate.duration_minutes.toFixed(1)} min · ` +
      (estimate.sample_count
        ? `${estimate.sample_count} episódio(s) de ${generationModeLabel(mode)}` +
          (estimate.sample_count < 2 ? " · faixa pela variância do histórico do TTS" : "")
        : "piloto medido");

  const generateLabel = requestPending ? "⏳ Iniciando…"
    : done
      ? (mode === "verbatim" ? "📖 Re-gerar leitura fiel"
        : mode === "reflexive" ? "📖 Re-gerar leitura reflexiva"
        : "🔄 Re-gerar episódio")
      : (mode === "verbatim" ? "📖 Gerar leitura fiel"
        : mode === "reflexive" ? "📖 Gerar leitura reflexiva"
        : "🎙️ Gerar episódio");

  // Retomada automática quando a falha foi do limite mensal de uma chave que já
  // não é a atual — o usuário trocou a chave e não deveria precisar reiniciar
  // a geração à mão.
  useEffect(() => {
    if (!status || status.state !== "falhou" || !isKeyLimitFailure(status.last_error)) return;
    const attemptKey = `${item.item_id}:${status.updated_at || 0}`;
    if (resumeAttempts.current.has(attemptKey)) return;
    resumeAttempts.current.add(attemptKey);

    let cancelled = false;
    const recheck = setTimeout(() => resumeAttempts.current.delete(attemptKey),
      AUTOMATIC_RESUME_RECHECK_MS);

    (async () => {
      const keyCheck = await getBalance();
      if (cancelled || !canAutoResumeKeyLimit(status, keyCheck)) return;
      setRequestPending(true);
      setRequest({
        tone: "active",
        message: "A falha era de uma chave anterior. Retomando automaticamente do checkpoint…",
      });
      try {
        const result = await generateEpisode(generationArgs(source, item.item_id, {
          mode: status.generation_mode || "adaptation",
          voice: status.narration_voice,
          language,
          backgroundMusic: status.background_music_cache,
          volume: status.background_volume,
          stability: status.voice_stability,
        }));
        if (!result.ok || (!result.started && result.reason !== "geração já em andamento")) {
          setRequest({
            tone: "error",
            message: `Não foi possível retomar automaticamente: ${result.reason || result.error}`,
          });
          return;
        }
        setRequest(null);
        await refreshStatus();
      } finally {
        setRequestPending(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(recheck);
    };
  }, [status, item.item_id, source, language, refreshStatus]);

  const handleGenerate = useCallback(async () => {
    const needsNarrator = mode === "verbatim" || mode === "reflexive";
    if (needsNarrator && !voice) {
      alert("Escolha a voz do narrador.");
      return;
    }
    const backgroundVolume = volumePercent / 100;
    const modeLabel = mode === "verbatim" ? "Gerar leitura fiel"
      : mode === "reflexive" ? "Gerar leitura reflexiva"
      : "Gerar episódio";
    const stabilityNote = needsNarrator && stability === "estavel"
      ? "\n\nVoz estável: uma direção vocal única para o áudio inteiro, sem planejamento "
        + "de interpretação por trecho (menos variação de tom e custo menor)."
      : "";
    const narratorNote = mode === "verbatim"
      ? `\n\nNarrador: ${voice}. O texto não será reescrito; somente a interpretação será planejada.`
      : mode === "reflexive"
        ? `\n\nNarrador: ${voice}. O texto será lido integralmente, com comentários reflexivos intercalados.`
        : "";
    const forceNote = force
      ? mode === "verbatim"
        ? "\n\nO plano de interpretação e os áudios serão regenerados."
        : mode === "reflexive"
          ? "\n\nO plano reflexivo e os áudios serão regenerados."
          : "\n\nA cobertura, o roteiro e a auditoria serão regenerados."
      : "";
    const confirmed = confirm(
      `${modeLabel} de "${item.title}"?\n\n` +
      `Custo estimado: ~US$ ${estimate.cost_usd.toFixed(2)} ` +
      `(faixa US$ ${estimate.cost_min_usd.toFixed(2)}–${estimate.cost_max_usd.toFixed(2)}) ` +
      "(consome créditos do OpenRouter)." +
      narratorNote +
      stabilityNote +
      (music.name
        ? `\n\nMúsica de fundo: ${music.name} a ${Math.round(backgroundVolume * 100)}%. ` +
          "Os chunks de voz serão reaproveitados quando compatíveis."
        : "") +
      forceNote
    );
    if (!confirmed) return;

    setRequestPending(true);
    setRequest({ tone: "active", message: "Solicitando a retomada ao backend…" });
    try {
      const result = await generateEpisode(generationArgs(source, item.item_id, {
        mode, voice, language, force, backgroundMusic: music.path, volume: backgroundVolume,
        stability,
      }));
      if (!result.ok || !result.started) {
        setRequest({
          tone: "error",
          message: `Não foi possível iniciar: ` +
            `${result.reason || result.error || "a geração não foi iniciada"}`,
        });
        return;
      }
      setForce(false);
      setRequest({ tone: "active", message: "Geração iniciada; carregando o checkpoint…" });
      await refreshStatus();
      setRequest(null);
    } finally {
      setRequestPending(false);
    }
  }, [estimate, force, item, language, mode, music, refreshStatus, source, stability, voice,
    volumePercent]);

  const handleMarkers = useCallback(async () => {
    const resultado = await exportMarkers(item.item_id, language);
    if (!resultado.ok) {
      alert(`Não foi possível exportar as marcações: ${resultado.error}`);
      return;
    }
    alert(
      `Marcações de ${resultado.chunks} trecho(s) exportadas na pasta do episódio:\n\n` +
      resultado.files.map((caminho) => caminho.split("/").pop()).join("\n")
    );
  }, [item.item_id, language]);

  const handleAbort = useCallback(async () => {
    const result = await abortEpisode(item.item_id, language);
    if (result.ok && result.aborted) {
      alert(result.stopped
        ? "Geração abortada agora. O checkpoint foi preservado."
        : "Abort registrado; aguardando o primeiro checkpoint disponível.");
    }
    refreshStatus();
  }, [item.item_id, language, refreshStatus]);

  const handleRepair = useCallback(async () => {
    if (!confirm(
      "Reparar episódio? Apenas os segmentos com silêncio problemático " +
      "serão regenerados.\n\nIsso consome créditos da API."
    )) return;
    setRequest({ tone: "active", message: "Solicitando reparo…" });
    const result = await repairEpisode(source, item.item_id, language);
    if (!result.ok || !result.started) {
      setRequest({ tone: "error", message: result.reason || "Erro ao iniciar reparo" });
      return;
    }
    setRequest({
      tone: "active",
      message: `Reparando ${result.segments_to_repair} segmento(s) com problema…`,
    });
    refreshStatus();
  }, [item.item_id, language, refreshStatus, source]);

  const handleNotebookLm = useCallback(async () => {
    const result = await exportNotebookLm(source, item.item_id);
    if (result.ok) {
      const error = await openProjectPath(result.pack);
      if (error) alert(error);
    } else {
      alert(result.error);
    }
  }, [item.item_id, source]);

  const handleReextract = useCallback(async () => {
    const confirmed = confirm(
      "Reprocessar o arquivo original com a extração atual?\n\n" +
      "O texto deste conteúdo será substituído — útil quando a leitura do arquivo " +
      "melhorou desde a importação. O item continua o mesmo (não cria duplicata) e " +
      "não há custo de IA. Episódios já gerados não mudam: para atualizá-los, gere " +
      "novamente depois."
    );
    if (!confirmed) return;
    setReextracting(true);
    const result = await reextractFile(item.item_id);
    setReextracting(false);
    if (!result.ok || !result.reextracted) {
      alert(result.error || result.reason || "Não foi possível reextrair o arquivo.");
      return;
    }
    alert(`Texto reprocessado (${result.method}): `
      + `${result.words_before} → ${result.words} palavras.`);
    onItemsChanged();
  }, [item.item_id, onItemsChanged]);

  const handleChooseMusic = useCallback(async () => {
    const selected = await chooseBackgroundMusic();
    if (!selected) return;
    setMusic({ path: selected, name: String(selected).split(/[\\/]/).pop() });
  }, []);

  const needsNarrator = mode === "verbatim" || mode === "reflexive";
  const showVoiceField = needsNarrator && !profileVoice;
  const modeNote = (needsNarrator && stability === "estavel" && STABLE_MODE_NOTES[mode])
    || MODE_NOTES[mode] || MODE_NOTES.adaptation;
  const voiceDiffers = Boolean(profileVoice) && voice !== profileVoice;

  return (
    <div>
      <h2>{item.title}</h2>
      <p className="muted">
        {`${item.published_at} · ~${item.words} palavras · ${item.url || "texto local"}`}
      </p>
      {/* Reextrair só faz sentido para itens que vieram de um arquivo local e
          guardaram de onde: texto colado ou URL não têm o que reprocessar. */}
      {item.source_file && (
        <p className="muted small">
          <button type="button" className="ghost" disabled={reextracting} onClick={handleReextract}>
            🔄 Reextrair do arquivo
          </button>
          <span className="muted small">
            Reprocessa o arquivo original com a extração atual, sem criar um item novo.
          </span>
        </p>
      )}
      <p className="estimate">{estimateLine}</p>

      <div className="generation-options">
        {/* Trocar voz, formato ou idioma no meio da geração produziria um
            episódio com duas configurações misturadas. */}
        {locked && (
          <p className="options-lock" role="status">
            🔒 Geração em andamento — para mudar formato, idioma, narrador ou música,
            aborte e gere novamente.
          </p>
        )}
        <label>
          Formato
          <select
            value={mode}
            disabled={locked}
            onWheel={(event) => event.preventDefault()}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="adaptation">Podcast adaptado</option>
            <option value="verbatim">Leitura fiel, sem reescrita</option>
            <option value="reflexive">Leitura reflexiva, com comentários</option>
          </select>
        </label>
        <label>
          Idioma do episódio
          <select
            value={language}
            disabled={locked}
            onWheel={(event) => event.preventDefault()}
            onChange={(event) => setLanguage(event.target.value)}
          >
            <option value="pt-BR">🇧🇷 Português</option>
            <option value="en">🇺🇸 English</option>
          </select>
        </label>
        {showVoiceField && (
          <label>
            Narrador
            <select
              value={voice}
              disabled={locked || catalogUnavailable}
              onWheel={(event) => event.preventDefault()}
              onChange={(event) => {
                setVoiceTouched(true);
                setVoice(event.target.value);
              }}
            >
              {voiceEntries.length > 0
                ? voiceEntries.map(([name, tone]) => (
                  <option key={name} value={name}>
                    {voiceOptionLabel(name, tone, info.tts_model, info.voice_profiles)}
                  </option>
                ))
                : profileVoice
                  ? <option value={profileVoice}>
                      {voiceOptionLabel(profileVoice, "", info.tts_model, info.voice_profiles)}
                    </option>
                  : <option value="" disabled>Nenhuma voz catalogada para este modelo</option>}
            </select>
            {info.voice_profiles && info.voice_profiles[voice] && (
              <span className="muted small">
                {`Medido em 3 gerações: tom ${info.voice_profiles[voice].pitch_hz} Hz `
                  + `(${info.voice_profiles[voice].pitch_min_hz}-${info.voice_profiles[voice].pitch_max_hz}), `
                  + `${info.voice_profiles[voice].chars_per_second} caracteres por segundo. `
                  + "O tom varia entre gerações; a faixa mostra quanto."}
              </span>
            )}
            {voiceDiffers && (
              <button
                type="button"
                className="voice-hint"
                onClick={() => {
                  setVoice(profileVoice);
                  setVoiceTouched(false);
                }}
              >
                {`⚠ Diferente do perfil (${profileVoice}). Clique para voltar.`}
              </button>
            )}
          </label>
        )}
        {needsNarrator && (
          <label>
            Estabilidade da voz
            <select
              value={stability}
              disabled={locked}
              onWheel={(event) => event.preventDefault()}
              onChange={(event) => {
                setStabilityTouched(true);
                setStability(event.target.value);
              }}
            >
              <option value="natural">Natural — interpretação planejada por trecho</option>
              <option value="estavel">Estável — mesmo tom do começo ao fim</option>
            </select>
          </label>
        )}
        <label className="target-duration">
          Duração alvo do vídeo (min, opcional)
          <input
            type="number"
            min="1"
            step="1"
            placeholder="ex.: 20"
            value={targetMinutes}
            disabled={locked}
            onChange={(event) => setTargetMinutes(event.target.value)}
          />
        </label>
        {encaixe && (
          <p className="muted small">
            {encaixe.sobra > 0
              ? `Neste ritmo (${Math.round(taxa)} palavras/min) o texto rende ~${encaixe.atual.toFixed(1)} min. `
                + `Em ${alvo} min cabem ${encaixe.cabem} palavras: é preciso cortar `
                + `${encaixe.sobra} palavras (${Math.round(encaixe.proporcao * 100)}% do texto).`
              : `O texto já cabe: rende ~${encaixe.atual.toFixed(1)} min, contra os ${alvo} min pedidos.`}
          </p>
        )}
        <p className="muted small">{modeNote}</p>
        {needsNarrator && (
          <p className="muted small">{STABILITY_NOTES[stability]}</p>
        )}

        <div className="background-music-options">
          <div className="background-music-picker">
            <button type="button" disabled={locked} onClick={handleChooseMusic}>
              🎵 Escolher música de fundo
            </button>
            {music.path && (
              <button
                type="button"
                className="ghost"
                disabled={locked}
                onClick={() => setMusic({ path: null, name: null })}
              >
                Remover
              </button>
            )}
            <span className="muted small">{music.name || "Sem música de fundo"}</span>
          </div>
          <label className="background-volume">
            Volume da música
            <input
              type="range"
              min="1"
              max="25"
              value={volumePercent}
              disabled={locked}
              aria-describedby="background-music-rights"
              onChange={(event) => setVolumePercent(Number(event.target.value))}
            />
            <output>{`${volumePercent}%`}</output>
          </label>
          <p id="background-music-rights" className="muted small">
            A faixa fica baixa, repete somente até o fim da narração e não gera custo de TTS.
            Use apenas áudio que você tenha direito de publicar.
          </p>
        </div>
      </div>

      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={requestPending || running}
          onClick={handleGenerate}
        >
          {generateLabel}
        </button>
        <button
          type="button"
          title="Pacote de custo zero na assinatura Google"
          onClick={handleNotebookLm}
        >
          📓 NotebookLM
        </button>
        {running && !status.abort_requested_at && (
          <button type="button" className="danger" onClick={handleAbort}>🛑 Abortar agora</button>
        )}
        {done && (
          <button type="button" onClick={() => playEpisode(status.mp3, item.title)}>
            ▶️ Ouvir
          </button>
        )}
        {done && (
          <button
            type="button"
            title="Legendas (.srt) e capítulos com o tempo de cada trecho, para sincronizar slides na edição"
            onClick={handleMarkers}
          >
            🎬 Marcações de tempo
          </button>
        )}
        {status && (
          <button type="button" onClick={() => onOpenChunks(item.item_id, item.title, language)}>
            🧪 Revisar chunks
          </button>
        )}
        {auditProblems && !running && (
          <button
            type="button"
            className="ghost"
            title="Regenerar apenas segmentos com silêncio problemático"
            onClick={handleRepair}
          >
            🔧 Reparar
          </button>
        )}
        {status && (
          <button
            type="button"
            onClick={async () => {
              const error = await openProjectPath(status.dir);
              if (error) alert(error);
            }}
          >
            📂 Pasta
          </button>
        )}
      </div>

      <label
        className="check-option"
        title="Ignora os artefatos de planejamento existentes"
      >
        <input
          type="checkbox"
          checked={force}
          disabled={locked}
          onChange={(event) => setForce(event.target.checked)}
        />
        <span>{FORCE_LABELS[mode] || FORCE_LABELS.adaptation}</span>
      </label>

      <GenerationProgress status={status} request={request} />
      <GenerationLogPanel status={status} itemId={item.item_id} language={language} />
    </div>
  );
}
