import { useCallback, useEffect, useMemo, useState } from "react";
import { listModels, saveProfile } from "../lib/audiofyClient.js";
import { presentersFromSpec, sortVoicesByLanguage, voiceOptionLabel } from "../lib/voices.js";
import { useSettings } from "../state/settingsContext.js";

// Uma aba de categoria representa uma família de texto. Perfis builtin não
// podem trocar de família durante a edição; "Personalizados" é o espaço
// explícito para combinações livres.
const PROVIDER_BY_CATEGORY = {
  "Claude Code": "claude-code",
  Codex: "codex",
  "Gemini CLI": "gemini-cli",
  "Claude API": "openrouter",
  "OpenAI API": "openrouter",
  "Gemini API": "openrouter",
};

const TIER_ORDER = ["ultra-economico", "economico", "padrao", "premium", "unknown"];
const TIER_LABELS = {
  "ultra-economico": "Ultra-econômico — prototipagem e alto volume",
  economico: "Econômico — bom custo para uso recorrente",
  padrao: "Padrão — equilíbrio entre qualidade e custo",
  premium: "Premium — máxima qualidade, maior custo",
  unknown: "Sem classificação — confira antes de usar",
};

// Agrupa por empresa preservando a ordem do catálogo, como os <optgroup> do
// renderer vanilla.
function ModelPicker({ label, models, value, onChange }) {
  const vendors = useMemo(() => {
    const currentVendor = value && value.includes("/") ? value.split("/", 1)[0] : "";
    return [...new Set([
      ...models.map((model) => model.vendor),
      ...(currentVendor ? [currentVendor] : []),
    ])].sort();
  }, [models, value]);
  const [vendor, setVendor] = useState(
    () => (value && value.includes("/") ? value.split("/", 1)[0] : vendors[0] || "")
  );
  const matches = models.filter((model) => model.vendor === vendor);
  const known = matches.some((model) => model.id === value);

  return (
    <div className="model-picker">
      <label>
        {`Empresa ${label}`}
        <select
          value={vendor}
          onChange={(event) => {
            setVendor(event.target.value);
            const first = models.find((model) => model.vendor === event.target.value);
            if (first) onChange(first.id);
          }}
        >
          {vendors.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label>
        {`Modelo ${label}`}
        <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
          {value && !known && (
            <option value={value}>{`${value} — configuração atual`}</option>
          )}
          {matches.map((model) => (
            <option key={model.id} value={model.id}>
              {`${model.id} — ${model.price_line}`}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function PresenterRow({ presenter, voices, ttsModel, onChange, onRemove }) {
  const hasVoices = voices.length > 0;
  return (
    <div className="presenter-row">
      <input
        className="pf-speaker"
        type="text"
        placeholder="nome"
        value={presenter.speaker}
        onChange={(event) => onChange({ ...presenter, speaker: event.target.value })}
      />
      <select
        className="pf-voice"
        value={presenter.voice}
        disabled={!hasVoices}
        onChange={(event) => onChange({ ...presenter, voice: event.target.value })}
      >
        {hasVoices
          ? voices.map(([name, tone]) => (
            <option key={name} value={name}>{voiceOptionLabel(name, tone, ttsModel)}</option>
          ))
          : <option value="">Nenhuma voz catalogada para este modelo</option>}
      </select>
      <input
        className="pf-style"
        type="text"
        placeholder="tom (opcional)"
        title={
          "O tom é enviado ao modelo de voz como instrução. Medido em 19 gerações reais do "
          + "Gemini TTS: instruções opostas (\"eufórico e acelerado\" contra \"sussurrado e "
          + "lento\") produziram áudios cuja diferença de velocidade, brilho e volume ficou "
          + "menor que a variação entre repetições da MESMA instrução. Ou seja: neste modelo "
          + "o tom não muda o áudio de forma mensurável. Escolher a voz muda."
        }
        value={presenter.style}
        onChange={(event) => onChange({ ...presenter, style: event.target.value })}
      />
      <button
        type="button"
        className="ghost"
        aria-label={`Remover apresentador ${presenter.speaker || "sem nome"}`}
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  );
}

export default function ProfileForm({ profile, category, onCancel, onSaved }) {
  const { info } = useSettings();
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const base = profile || info || {};
  const lockedProvider = PROVIDER_BY_CATEGORY[category]
    || (profile && !profile.custom ? profile.text_provider : null);

  const [name, setName] = useState(profile ? profile.name : "");
  const [description, setDescription] = useState(profile ? profile.description : "");
  const [provider, setProvider] = useState(lockedProvider || base.text_provider || "openrouter");
  const [subscriptionModel, setSubscriptionModel] = useState(
    profile ? profile.subscription_model || "" : (info && info.profile_subscription_model) || ""
  );
  const [textModel, setTextModel] = useState(base.text_model || "");
  const [auditModel, setAuditModel] = useState(base.audit_model || "");
  const [ttsModel, setTtsModel] = useState(base.tts_model || "");
  const [forceLanguage, setForceLanguage] = useState(Boolean(profile && profile.force_language));
  const [stableVoice, setStableVoice] = useState(Boolean(profile && profile.stable_voice));
  const [presenters, setPresenters] = useState(() => (profile
    ? presentersFromSpec(profile.presenters_spec)
    : (info && info.presenters.length
      ? info.presenters
      : [{ speaker: "apresentador_a", voice: "Kore", style: "curioso" }])));

  useEffect(() => {
    let cancelled = false;
    setError("carregando catálogo de modelos…");
    listModels().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(`✖ catálogo indisponível: ${result.error}`);
        return;
      }
      setCatalog(result);
      setError(result.catalog_error
        ? `⚠ Catálogo remoto indisponível; mantendo os modelos atuais: ${result.catalog_error}`
        : "");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const voices = useMemo(() => {
    const map = (catalog && catalog.voice_catalogs && catalog.voice_catalogs[ttsModel]) || {};
    return sortVoicesByLanguage(Object.entries(map));
  }, [catalog, ttsModel]);

  // Trocar o modelo TTS troca o catálogo: uma voz do modelo antigo não existe
  // mais como opção e o campo cairia vazio.
  useEffect(() => {
    if (!voices.length) return;
    const available = voices.map(([voice]) => voice);
    setPresenters((current) => current.map((presenter) => (
      available.includes(presenter.voice) ? presenter : { ...presenter, voice: available[0] }
    )));
  }, [voices]);

  const tier = catalog && catalog.tts_tiers && catalog.tts_tiers[ttsModel];
  const isAmbiguous = Boolean(catalog
    && (catalog.language_ambiguous_models || []).includes(ttsModel));
  const canForceLanguage = Boolean(catalog
    && (catalog.language_forcing_models || []).includes(ttsModel));

  const subscriptionCli = (info ? info.subscription_clis : [])
    .find((item) => item.key === provider);
  const providerOptions = [
    { key: "openrouter", label: "OpenRouter (API, custo por token)" },
    ...((info ? info.subscription_clis : []) || []).map((cli) => ({
      key: cli.key,
      label: `${cli.name} — custo US$ 0${cli.available ? "" : " (não instalada)"}`,
      disabled: !cli.available,
    })),
  ].filter((option) => !lockedProvider || option.key === lockedProvider);

  const ttsGroups = useMemo(() => {
    if (!catalog) return [];
    const grouped = new Map(TIER_ORDER.map((entry) => [entry, []]));
    for (const model of catalog.tts_models) {
      const modelTier = (catalog.tts_tiers && catalog.tts_tiers[model.id]
        && catalog.tts_tiers[model.id].tier) || "unknown";
      (grouped.get(modelTier) || grouped.get("unknown")).push(model);
    }
    return [...grouped.entries()]
      .filter(([, entries]) => entries.length)
      .map(([key, entries]) => [key, [...entries].sort((a, b) => a.id.localeCompare(b.id))]);
  }, [catalog]);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    const spec = presenters
      .map((presenter) => {
        const speaker = presenter.speaker.trim();
        const style = presenter.style.trim();
        return style ? `${speaker}:${presenter.voice}:${style}` : `${speaker}:${presenter.voice}`;
      })
      .filter((chunk) => !chunk.startsWith(":"))
      .join(", ");
    const payload = {
      name: name.trim(),
      description: description.trim(),
      text_provider: provider,
      text_model: provider === "openrouter" ? textModel : "(assinatura)",
      audit_model: provider === "openrouter" ? auditModel : "(assinatura)",
      subscription_model: provider === "openrouter" ? "" : subscriptionModel.trim(),
      tts_model: ttsModel,
      presenters_spec: spec,
      force_language: forceLanguage,
      stable_voice: stableVoice,
      activate: true,
    };
    if (!payload.name || !spec) {
      setError("✖ preencha o nome e pelo menos um apresentador");
      return;
    }
    if (!payload.tts_model
      || (provider === "openrouter" && (!payload.text_model || !payload.audit_model))) {
      setError("✖ selecione os modelos obrigatórios");
      return;
    }
    setSaving(true);
    const result = await saveProfile(payload);
    setSaving(false);
    if (result.ok) onSaved();
    else setError(`✖ ${result.error}`);
  }, [auditModel, description, forceLanguage, name, onSaved, presenters, provider,
    stableVoice, subscriptionModel, textModel, ttsModel]);

  return (
    <form className="profile-form" onSubmit={handleSubmit}>
      <h3>{profile ? `Editar perfil: ${profile.name}` : "Novo perfil"}</h3>
      <label>
        Nome
        <input
          type="text"
          placeholder="ex.: meu-podcast"
          required
          readOnly={Boolean(profile)}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        Descrição curta
        <input
          type="text"
          placeholder="ex.: barato para testes"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      {!lockedProvider && (
        <label>
          Provedor das etapas de texto
          <select value={provider} onChange={(event) => setProvider(event.target.value)}>
            {providerOptions.map((option) => (
              <option key={option.key} value={option.key} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {provider !== "openrouter" && subscriptionCli && subscriptionCli.supports_model && (
        <label>
          Modelo da assinatura
          <select
            aria-describedby="pf-subscription-model-hint"
            value={subscriptionModel}
            onChange={(event) => setSubscriptionModel(event.target.value)}
          >
            <option value="">
              {subscriptionCli.configured_model
                ? `Modelo padrão da CLI (${subscriptionCli.configured_model})`
                : "Modelo padrão da CLI"}
            </option>
            {(subscriptionCli.model_suggestions || []).map((suggestion) => (
              <option key={suggestion} value={suggestion}>{suggestion}</option>
            ))}
          </select>
          <span id="pf-subscription-model-hint" className="muted small">
            O modelo padrão da CLI é usado quando nenhuma opção específica é escolhida.
          </span>
        </label>
      )}

      {provider === "openrouter" && catalog && (
        <div id="pf-api-models">
          <ModelPicker
            label="do roteiro"
            models={catalog.text_models}
            value={textModel}
            onChange={setTextModel}
          />
          <ModelPicker
            label="da auditoria"
            models={catalog.text_models}
            value={auditModel}
            onChange={setAuditModel}
          />
        </div>
      )}

      <div className="tts-model-picker">
        <label>
          Modelo TTS (voz)
          <select value={ttsModel} onChange={(event) => setTtsModel(event.target.value)}>
            {catalog && ttsModel && !catalog.tts_models.some((model) => model.id === ttsModel) && (
              <option value={ttsModel}>{`${ttsModel} — configuração atual`}</option>
            )}
            {ttsGroups.map(([groupTier, models]) => (
              <optgroup key={groupTier} label={TIER_LABELS[groupTier] || groupTier}>
                {models.map((model) => {
                  const modelTier = catalog.tts_tiers && catalog.tts_tiers[model.id];
                  const cost = modelTier
                    ? ` · US$ ${modelTier.effective_cost_per_m_chars}/M caracteres`
                    : "";
                  return (
                    <option key={model.id} value={model.id}>
                      {`${model.id}${cost} · ${model.price_line}`}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      {tier && (
        <span className={`pf-tier-badge tier-${tier.tier}`}>
          {`${tier.label} — US$ ${tier.effective_cost_per_m_chars}/M caracteres`}
        </span>
      )}

      {/* Modelos multilíngues decidem o idioma pelo texto de entrada. Em
          português isso é um problema concreto: a detecção tende ao europeu e
          chega a variar no meio da leitura. */}
      {isAmbiguous && (
        <p className="muted small">
          {canForceLanguage
            ? "⚠️ Este modelo detecta o idioma pelo texto e pode puxar para o " +
              "português de Portugal. Marque a opção abaixo para forçar o português do Brasil."
            : "⚠️ Este modelo detecta o idioma pelo texto e pode puxar para o " +
              "português de Portugal, até alternando de sotaque no meio da leitura. " +
              "Para português do Brasil garantido, use um modelo com voz por idioma."}
        </p>
      )}
      {canForceLanguage && (
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={forceLanguage}
            onChange={(event) => setForceLanguage(event.target.checked)}
          />
          <span>Forçar o idioma configurado no perfil</span>
        </label>
      )}

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={stableVoice}
          onChange={(event) => setStableVoice(event.target.checked)}
        />
        <span>Voz estável nas leituras (menos variação de tom)</span>
      </label>
      <p className="muted small">
        Padrão deste perfil para a leitura fiel e a reflexiva: uma direção vocal única
        para o áudio inteiro, em vez de uma interpretação planejada por trecho. Cada
        episódio ainda pode escolher o contrário na hora de gerar.
      </p>

      <span className="field-label" id="pf-presenters-label">Apresentadores</span>
      <p className="muted small">
        O campo <strong>tom</strong> vai ao modelo de voz como instrução, mas medimos que ele
        não muda velocidade, brilho nem volume de forma detectável no Gemini TTS: instruções
        opostas produziram áudios com diferença menor que a variação entre repetições da mesma
        instrução. Quem realmente muda o resultado é a <strong>escolha da voz</strong>. O campo
        continua aqui porque outros modelos podem respeitá-lo — e porque ele descreve a intenção
        para quem lê o perfil depois.
      </p>
      <div id="pf-presenters" role="group" aria-labelledby="pf-presenters-label">
        {presenters.map((presenter, index) => (
          <PresenterRow
            key={index}
            presenter={presenter}
            voices={voices}
            ttsModel={ttsModel}
            onChange={(updated) => setPresenters((current) =>
              current.map((entry, position) => (position === index ? updated : entry)))}
            onRemove={() => setPresenters((current) =>
              current.filter((_, position) => position !== index))}
          />
        ))}
      </div>
      <button
        type="button"
        className="ghost"
        onClick={() => setPresenters((current) => [
          ...current,
          { speaker: "", voice: voices.length ? voices[0][0] : "Kore", style: "" },
        ])}
      >
        ➕ apresentador
      </button>

      <div className="form-row">
        <button type="submit" className="primary" disabled={saving}>💾 Salvar e ativar</button>
        <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
      </div>
      <p className="error small" role="alert">{error}</p>
    </form>
  );
}
