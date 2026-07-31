// Espelha os helpers de formatação do renderer vanilla
// (electron/renderer/renderer.js) para manter texto/formato idênticos
// enquanto a migração para React está em andamento.

export function usd(value, decimals = 4) {
  return Number.isFinite(value) ? `US$ ${value.toFixed(decimals)}` : "—";
}

export function formatEpisodeDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "não medida";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours ? `${hours}h ${minutes}min ${remainder}s` : `${minutes}min ${remainder}s`;
}
