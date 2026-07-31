import '@testing-library/jest-dom/vitest'

// jsdom não implementa scrollIntoView; o teleprompter o usa para acompanhar o
// parágrafo ativo. Stub no nível do ambiente de teste, sem tocar no componente.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom também não implementa play/pause/load do <audio> (só registra "Not
// implemented" no console). Substituir por no-ops mantém a saída dos testes
// legível; o comportamento real do player é verificado no Electron.
for (const method of ['play', 'pause', 'load']) {
  HTMLMediaElement.prototype[method] = function noop() {}
}

// jsdom não implementa alert/confirm; vários fluxos do app os usam para
// confirmar custo. Padrão: alert silencioso e confirm negativo — cada teste
// que precisa de "sim" faz o spy explicitamente.
window.alert = () => {}
window.confirm = () => false
