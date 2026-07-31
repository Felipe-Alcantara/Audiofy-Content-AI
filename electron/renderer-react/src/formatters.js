// Espelha os helpers de formatação do renderer vanilla
// (electron/renderer/renderer.js) para manter texto/formato idênticos
// enquanto a migração para React está em andamento.

export function usd(value, decimals = 4) {
  return Number.isFinite(value) ? `US$ ${value.toFixed(decimals)}` : "—";
}

export function formatEpisodeDate(value, includeTime = false) {
  if (!value) return "não registrada";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", includeTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "short" }).format(date);
}

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "não medido";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${unit}`;
}

export function generationModeLabel(mode) {
  return mode === "verbatim" ? "leitura fiel"
    : mode === "reflexive" ? "leitura reflexiva"
    : "podcast adaptado";
}

export function formatEpisodeDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "não medida";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours ? `${hours}h ${minutes}min ${remainder}s` : `${minutes}min ${remainder}s`;
}
