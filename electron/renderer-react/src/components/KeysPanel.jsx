import { useCallback, useEffect, useState } from "react";
import {
  activateEnvironmentKey,
  activateKey,
  addKey,
  checkEnvironmentKey,
  checkKey,
  getBalance,
  listKeys,
  moveKey,
  removeKey,
} from "../lib/audiofyClient.js";

// Chaves do OpenRouter: guardadas localmente com permissão restrita e sempre
// mascaradas; a origem em uso é escolhida explicitamente pelo usuário.
function VerifyButton({ command }) {
  const [state, setState] = useState({ text: "", className: "muted small", busy: false });

  const verify = useCallback(async () => {
    setState({ text: "consultando…", className: "muted small", busy: true });
    const result = await command();
    setState({
      text: result.ok ? result.detail : `✖ ${result.error}`,
      className: result.ok && result.available ? "small state-concluido" : "small state-falhou",
      busy: false,
    });
  }, [command]);

  return (
    <>
      <span className={state.className}>{state.text}</span>
      <button type="button" className="ghost" disabled={state.busy} onClick={verify}>
        verificar
      </button>
    </>
  );
}

export default function KeysPanel({ onKeysChanged }) {
  const [keys, setKeys] = useState(null);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [balance, setBalance] = useState({ text: "", className: "muted small" });

  const reload = useCallback(async () => {
    const result = await listKeys();
    if (result.ok) setKeys(result);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const activate = useCallback(async (command, label) => {
    const result = await command();
    if (!result.ok) {
      setBalance({ text: `✖ ${result.error}`, className: "small state-falhou" });
      return;
    }
    setBalance({ text: `✓ ${label} agora está em uso.`, className: "small state-concluido" });
    await reload();
    onKeysChanged();
  }, [onKeysChanged, reload]);

  const handleAdd = useCallback(async () => {
    const cleanName = name.trim();
    const cleanValue = value.trim();
    if (!cleanName || !cleanValue) return;
    const result = await addKey(cleanName, cleanValue);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    setName("");
    setValue("");
    setBalance({
      text: `✓ Chave "${cleanName}" registrada. Use o botão “usar” para ativá-la.`,
      className: "small state-concluido",
    });
    reload();
  }, [name, reload, value]);

  const handleBalance = useCallback(async () => {
    setBalance({ text: "consultando…", className: "muted small" });
    const result = await getBalance();
    setBalance({
      text: result.ok ? result.detail : `✖ ${result.error}`,
      className: result.ok && result.valid ? "small state-concluido" : "small state-falhou",
    });
  }, []);

  return (
    <>
      <h3>🔑 Chaves do OpenRouter</h3>
      <p className="muted small">
        Guardadas localmente com permissão restrita e sempre mascaradas.
        Escolha explicitamente qual origem será usada.
      </p>
      <p className="muted small" role="status">
        {keys
          ? `${keys.count} ${keys.count === 1 ? "chave cadastrada" : "chaves cadastradas"} · ` +
            `fila na ordem exibida · em uso: ${keys.effective_source || "nenhuma"}`
          : ""}
      </p>

      <ul className="row-list">
        {keys && keys.environment.available && (
          <li className="key-row">
            <div className="row-main">
              <span className="row-title">OPENROUTER_API_KEY</span>
              <span className="muted mono">{`${keys.environment.source} · valor protegido`}</span>
            </div>
            {keys.environment.in_use
              ? <span className="badge ok">em uso</span>
              : (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => activate(activateEnvironmentKey, keys.environment.source)}
                >
                  usar
                </button>
              )}
            <VerifyButton command={checkEnvironmentKey} />
          </li>
        )}

        {keys && !keys.keys.length && !keys.environment.available && (
          <li className="muted">Nenhuma chave disponível.</li>
        )}

        {keys && keys.keys.map((key) => (
          <li key={key.name} className="key-row">
            <div className="row-main">
              <span className="row-title">{`#${key.priority} · ${key.name}`}</span>
              <span className="muted mono">{key.masked}</span>
            </div>
            {key.in_use
              ? <span className="badge ok">em uso</span>
              : (
                <>
                  {key.selected && <span className="badge">selecionada</span>}
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => activate(() => activateKey(key.name), key.name)}
                  >
                    usar
                  </button>
                </>
              )}
            <VerifyButton command={() => checkKey(key.name)} />
            <button
              type="button"
              className="ghost"
              title={`Aumentar prioridade de ${key.name}`}
              aria-label={`Aumentar prioridade de ${key.name}`}
              disabled={key.priority === 1}
              onClick={() => moveKey(key.name, "up").then(reload)}
            >
              ↑
            </button>
            <button
              type="button"
              className="ghost"
              title={`Diminuir prioridade de ${key.name}`}
              aria-label={`Diminuir prioridade de ${key.name}`}
              disabled={key.priority === keys.count}
              onClick={() => moveKey(key.name, "down").then(reload)}
            >
              ↓
            </button>
            <button
              type="button"
              className="ghost"
              aria-label={`Remover chave ${key.name}`}
              onClick={() => {
                if (confirm(`Remover a chave "${key.name}"?`)) removeKey(key.name).then(reload);
              }}
            >
              🗑️
            </button>
          </li>
        ))}
      </ul>

      <div className="form-row">
        <input
          type="text"
          placeholder="nome (ex.: pessoal)"
          aria-label="Nome da chave"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          type="password"
          placeholder="sk-or-…"
          aria-label="Chave do OpenRouter"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="button" className="primary" onClick={handleAdd}>➕ Registrar chave</button>
        <button type="button" onClick={handleBalance}>✓ Verificar chave em uso</button>
      </div>
      <p className={balance.className} role="status">{balance.text}</p>
    </>
  );
}
