import { useEffect, useRef, useState } from "react";
import { getGenerationLog } from "../lib/audiofyClient.js";
import { elapsedLabel } from "../lib/formatters.js";

// Porte de refreshGenerationLog(): mostra as últimas linhas do worker e se ele
// ainda está vivo. Sem episódio (status ausente) o painel some, como no vanilla.
export default function GenerationLogPanel({ status, itemId, language }) {
  const [log, setLog] = useState(null);
  const outputRef = useRef(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!status || !itemId) {
      requestRef.current += 1;
      setLog(null);
      return;
    }
    const request = ++requestRef.current;
    getGenerationLog(itemId, language).then((result) => {
      // Respostas de um item/idioma anterior não podem sobrescrever o atual.
      if (request !== requestRef.current) return;
      setLog(result);
    });
  }, [status, itemId, language]);

  useEffect(() => {
    const output = outputRef.current;
    if (!output) return;
    const nearBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 48;
    if (nearBottom) output.scrollTop = output.scrollHeight;
  }, [log]);

  if (!status || !log) return null;

  const suffix = log.truncated ? " · exibindo somente as últimas linhas" : "";
  const key = status.key_source ? ` · chave efetiva: ${status.key_source}` : "";
  const text = log.ok && log.exists
    ? (log.text || "Aguardando a primeira mensagem do worker…")
    : (log.error || "O worker ainda não criou o arquivo de log.");

  return (
    <details className="generation-log-panel" open>
      <summary>
        <span>🧾 Log da geração</span>
        <span
          className={log.worker_alive ? "small state-rodando" : "small muted"}
          aria-live="polite"
        >
          {log.worker_alive ? "● worker ativo" : `● ${status.state}`}
        </span>
      </summary>
      <p id="generation-log-meta" className="muted small">
        {log.ok
          ? `Última saída ${elapsedLabel(log.updated_at)}${key}${suffix}`
          : "Não foi possível consultar o log."}
      </p>
      <pre
        ref={outputRef}
        id="generation-log"
        tabIndex={0}
        role="log"
        aria-label="Últimas linhas do log da geração"
      >
        {text}
      </pre>
    </details>
  );
}
