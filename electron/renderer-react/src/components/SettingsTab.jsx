import { useSettings } from "../state/settingsContext.js";
import KeysPanel from "./KeysPanel.jsx";
import ProfilesPanel from "./ProfilesPanel.jsx";
import SetupPanel from "./SetupPanel.jsx";

// Resumo textual do perfil ativo — mesmo layout de colunas alinhadas do
// renderer vanilla (<pre>), porque ele é lido como um "config dump".
function activeConfigSummary(info) {
  const clis = info.subscription_clis
    .map((cli) => `${cli.key}${cli.configured_model ? ` (${cli.configured_model})` : ""}` +
      `${cli.available ? " ✓" : " ✗"}`)
    .join("  ");
  const textModel = info.text_provider === "openrouter"
    ? info.text_model
    : (info.subscription_model || "modelo padrão da CLI") +
      (info.profile_subscription_model ? " (escolhido no perfil)" : "");
  const auditModel = info.text_provider === "openrouter" ? info.audit_model : textModel;
  return (
    `perfil ativo:   ${info.profile}\n` +
    `texto via:      ${info.text_provider}\n` +
    `roteiro:        ${textModel}\n` +
    `auditoria:      ${auditModel}\n` +
    `tts:            ${info.tts_model}\n` +
    `chave:          ${info.has_key ? `configurada (${info.key_source || "ativa"})` : "não configurada"}\n` +
    `overrides:      ${info.overrides.length ? info.overrides.join(", ") : "nenhum"}\n` +
    `apresentadores: ${info.presenters
      .map((presenter) => `${presenter.speaker}:${presenter.voice}` +
        `${presenter.style ? `:${presenter.style}` : ""}`).join(", ")}\n` +
    `assinaturas:    ${clis}`
  );
}

export default function SettingsTab() {
  const { info, reload } = useSettings();

  return (
    <div className="settings-grid">
      <section className="panel">
        <h2>🧾 Configuração ativa</h2>
        <pre className="muted" aria-label="Resumo da configuração ativa">
          {info ? activeConfigSummary(info) : ""}
        </pre>
        <KeysPanel onKeysChanged={reload} />
        <SetupPanel />
      </section>

      <section className="panel">
        <ProfilesPanel onProfilesChanged={reload} />
      </section>
    </div>
  );
}
