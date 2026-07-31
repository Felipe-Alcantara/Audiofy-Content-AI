import { generationFeedback } from "../lib/statusView.js";

// Porte do bloco #progress-box: barra, rótulo e custo ao vivo. A regra de o
// que mostrar vem inteira de generationFeedback() (renderer/status-view.js).
export default function GenerationProgress({ status, request }) {
  // Mensagem local (pedido enviado ao backend, erro ao iniciar) tem prioridade:
  // ela existe justamente no intervalo em que o status ainda não mudou.
  if (request) {
    return (
      <div className={`generation-status ${request.tone}`} role="status" aria-live="polite">
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Progresso da geração"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
        >
          <div id="progress-fill" style={{ width: "0%" }} />
        </div>
        <p id="progress-label" className="muted">{request.message}</p>
        <p className="cost" />
      </div>
    );
  }

  const feedback = generationFeedback(status);
  const running = Boolean(status && status.state === "rodando");
  const auditProblems = Boolean(status && status.audio_audit
    && (status.audio_audit.critical > 0 || status.audio_audit.warnings > 0));
  const showAuditWarning = !running && auditProblems && status.state === "concluido";
  if (!feedback.visible && !showAuditWarning) return null;

  if (showAuditWarning && !feedback.visible) {
    const total = status.audio_audit.critical + status.audio_audit.warnings;
    return (
      <div className="generation-status warning" role="status" aria-live="polite">
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Progresso da geração"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={100}
        >
          <div id="progress-fill" style={{ width: "100%" }} />
        </div>
        <p id="progress-label" className="muted">
          <span className="spinner" />
          {` Auditoria detectou ${total} segmento(s) com silêncio problemático — use 🔧 Reparar`}
        </p>
        <p className="cost" />
      </div>
    );
  }

  return (
    <div
      className={`generation-status ${feedback.tone}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Progresso da geração"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={feedback.percent}
      >
        <div id="progress-fill" style={{ width: `${feedback.percent}%` }} />
      </div>
      <p id="progress-label" className="muted">
        {running && <span className="spinner" />}
        {feedback.label}
      </p>
      <p className="cost">{feedback.cost}</p>
    </div>
  );
}
