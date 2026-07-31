import { useCallback, useEffect, useMemo, useState } from "react";
import { activateProfile, listProfiles, removeProfile } from "../lib/audiofyClient.js";
import ProfileForm from "./ProfileForm.jsx";

// Categoria de um perfil = família do provedor de texto. Perfis marcados como
// custom vão para "Personalizados", que é o espaço de combinações livres.
function categoryOf(profile) {
  if (profile.text_provider === "claude-code") return "Claude Code";
  if (profile.text_provider === "codex") return "Codex";
  if (profile.text_provider === "gemini-cli") return "Gemini CLI";
  if (profile.text_model.startsWith("anthropic/")) return "Claude API";
  if (profile.text_model.startsWith("openai/")) return "OpenAI API";
  return "Gemini API";
}

export default function ProfilesPanel({ onProfilesChanged }) {
  const [data, setData] = useState(null);
  const [category, setCategory] = useState(null);
  const [editing, setEditing] = useState(null);

  const reload = useCallback(async () => {
    const result = await listProfiles();
    if (result.ok) setData(result);
    onProfilesChanged();
  }, [onProfilesChanged]);

  useEffect(() => {
    listProfiles().then((result) => {
      if (result.ok) setData(result);
    });
  }, []);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const profile of (data ? data.profiles : [])) {
      const key = profile.custom ? "Personalizados" : categoryOf(profile);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(profile);
    }
    return map;
  }, [data]);

  // A aba que contém o perfil ativo aparece selecionada primeiro.
  const activeCategory = useMemo(() => {
    if (category) return category;
    if (!data || !data.profiles.length) return null;
    const active = data.profiles.find((profile) => profile.name === data.active)
      || data.profiles[0];
    return active.custom ? "Personalizados" : categoryOf(active);
  }, [category, data]);

  const items = grouped.get(activeCategory) || [];

  return (
    <>
      <h2>👤 Perfis de geração</h2>
      <p className="muted small">
        Um perfil agrupa provedor de texto (assinatura ou OpenRouter), modelos e apresentadores.
      </p>

      <nav className="profile-tab-bar" role="tablist" aria-label="Categorias de perfil">
        {[...grouped.keys()].map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            className={name === activeCategory ? "active" : ""}
            aria-selected={name === activeCategory}
            onClick={() => setCategory(name)}
          >
            {name}
          </button>
        ))}
      </nav>

      <ul className="row-list">
        {items.map((profile) => {
          const active = profile.name === (data && data.active);
          const provider = profile.text_provider === "openrouter"
            ? "API"
            : `assinatura ${profile.text_provider}` +
              (profile.subscription_model ? ` (${profile.subscription_model})` : "");
          return (
            <li key={profile.name}>
              <div className="row-main">
                <span className="row-title">{profile.name}</span>
                {profile.description && (
                  <span className="muted small">{profile.description}</span>
                )}
                <span className="muted small">
                  {`texto: ${provider} · tts: ${profile.tts_model} · ${profile.presenters_spec}`}
                </span>
              </div>
              {active && <span className="badge ok">ativo</span>}
              {!active && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => activateProfile(profile.name).then(reload)}
                >
                  ativar
                </button>
              )}
              <button
                type="button"
                className="ghost"
                onClick={() => setEditing({ profile, category: activeCategory })}
              >
                editar
              </button>
              {profile.custom && (
                <button
                  type="button"
                  className="ghost"
                  aria-label={`Remover perfil ${profile.name}`}
                  onClick={() => {
                    if (confirm(`Remover o perfil "${profile.name}"?`)) {
                      removeProfile(profile.name).then(reload);
                    }
                  }}
                >
                  🗑️
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        disabled={Boolean(editing)}
        onClick={() => setEditing({ profile: null, category: activeCategory })}
      >
        ➕ Novo perfil
      </button>

      {editing && (
        <ProfileForm
          key={editing.profile ? editing.profile.name : "novo"}
          profile={editing.profile}
          category={editing.category}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}
