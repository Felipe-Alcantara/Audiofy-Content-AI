import { useCallback, useEffect, useState } from "react";
import { getTtsCatalog, setupCheck, setupInstall } from "../lib/audiofyClient.js";

export default function SetupPanel() {
  const [setup, setSetup] = useState(null);
  const [message, setMessage] = useState("");
  const [installing, setInstalling] = useState(false);
  const [catalog, setCatalog] = useState("");

  const applySetup = useCallback((result) => {
    setSetup(result);
    setMessage(result.ready
      ? "✓ Ambiente pronto para gerar episódios."
      : "Há itens obrigatórios que precisam de atenção.");
  }, []);

  useEffect(() => {
    setupCheck().then((result) => {
      if (result.ok) applySetup(result);
    });
  }, [applySetup]);

  const handleCheck = useCallback(async () => {
    setMessage("… verificando ambiente");
    const result = await setupCheck();
    if (result.ok) applySetup(result);
    else setMessage(`✖ ${result.error}`);
  }, [applySetup]);

  const handleInstall = useCallback(async () => {
    if (!confirm(
      "Instalar tudo que estiver faltando (git, ffmpeg, dependências Python) e criar o .env, se necessário?"
    )) return;
    setInstalling(true);
    setMessage("… preparando o ambiente; isso pode levar alguns minutos");
    const result = await setupInstall();
    setInstalling(false);
    if (!result.ok) {
      setMessage(`✖ ${result.error}`);
      return;
    }
    applySetup(result);
    if (result.actions.length) {
      setMessage(result.actions
        .map((action) => `${action.ok ? "✓" : "✗"} ${action.name}: ${action.detail}`)
        .join(" · "));
    }
  }, [applySetup]);

  const handleCatalog = useCallback(async () => {
    setCatalog("carregando…");
    const result = await getTtsCatalog();
    if (!result.ok) {
      setCatalog(`✖ ${result.error}`);
      return;
    }
    const models = result.models.length
      ? result.models.map((model) => model.id).join("\n")
      : "Nenhum modelo carregado.";
    const warning = result.catalog_error ? `Aviso: ${result.catalog_error}\n\n` : "";
    let voicesText = "";
    for (const [modelId, voices] of Object.entries(result.voice_catalogs || {})) {
      const entries = Object.entries(voices);
      const tier = (result.tts_tiers && result.tts_tiers[modelId]) || {};
      const tierLabel = tier.label
        ? ` [${tier.label} — US$ ${tier.effective_cost_per_m_chars}/M]`
        : "";
      voicesText += `\n${modelId}${tierLabel}:\n`;
      voicesText += entries.length
        ? `${entries.map(([voice, style]) => `  ${voice} (${style})`).join("\n")}\n`
        : "  (voz livre — digite o nome ao configurar)\n";
    }
    setCatalog(`${warning}Modelos TTS:\n${models}\n\nVozes por modelo:${voicesText}`);
  }, []);

  return (
    <>
      <h3>🛠️ Diagnóstico / Setup</h3>
      <ul className="row-list">
        {setup && setup.checks.map((check) => (
          <li key={check.name}>
            <span className={`badge ${check.ok ? "ok" : "warn"}`}>{check.ok ? "✓" : "✗"}</span>
            <div className="row-main">
              <span className="row-title">{check.name}</span>
              {!check.ok && <span className="muted small">{check.hint}</span>}
            </div>
            {!check.required && <span className="badge">opcional</span>}
          </li>
        ))}
      </ul>
      <div className="form-row">
        <button type="button" onClick={handleCheck}>🔄 Verificar novamente</button>
        <button type="button" className="primary" disabled={installing} onClick={handleInstall}>
          🛠️ Instalar/corrigir
        </button>
      </div>
      <p className="muted small" role="status">{message}</p>

      <h3>🎛️ Catálogo TTS / vozes</h3>
      <button type="button" onClick={handleCatalog}>Carregar catálogo</button>
      <pre className="muted">{catalog}</pre>
    </>
  );
}
