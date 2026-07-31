// Regras de erro/progresso da geração são compartilhadas com o renderer
// vanilla: o arquivo é um script clássico que publica window.audiofyStatusView
// (e é testado por electron/tests/status-view.test.js). Importar aqui mantém
// UMA implementação para as duas superfícies — nada é reescrito em React.
import "../../../renderer/status-view.js";

const statusView = (typeof window !== "undefined" && window.audiofyStatusView) || {};

export const {
  canAutoResumeKeyLimit,
  friendlyGenerationError,
  generationFeedback,
  isExhaustionFailure,
  isInsufficientCredits,
  isKeyLimitFailure,
} = statusView;
