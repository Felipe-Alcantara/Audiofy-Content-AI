// Espelha os helpers de formatação do renderer vanilla
// (electron/renderer/renderer.js) para manter texto e formato idênticos.

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

export function formatEpisodeDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "não medida";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours ? `${hours}h ${minutes}min ${remainder}s` : `${minutes}min ${remainder}s`;
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

// Relógio do transporte dos modais: m:ss, nunca negativo.
export function formatSeconds(value) {
  if (!Number.isFinite(value)) return "0:00";
  const total = Math.max(0, Math.floor(value));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

export function elapsedLabel(timestamp) {
  if (!timestamp) return "sem saída ainda";
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - Number(timestamp)));
  if (seconds < 5) return "agora";
  if (seconds < 60) return `há ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes}min`;
  return `há ${Math.floor(minutes / 60)}h`;
}

export function generationModeLabel(mode) {
  return mode === "verbatim" ? "leitura fiel"
    : mode === "reflexive" ? "leitura reflexiva"
    : "podcast adaptado";
}

export function fileBaseName(filePath) {
  return String(filePath).split(/[\\/]/).pop() || filePath;
}

// O renderer só recebe caminhos do próprio projeto (a bridge confina a
// abertura de arquivos); codificar cada segmento evita quebrar em nomes com
// espaço ou acento.
export function projectPathToFileUrl(target) {
  const encoded = String(target).split(/[\\/]/).map(encodeURIComponent).join("/");
  return `file://${encoded.startsWith("/") ? encoded : `/${encoded}`}`;
}

export function chunkSeverityLabel(chunk) {
  if (chunk.severity === "critical") return "silêncio crítico";
  if (chunk.severity === "warning") return "revisar pausa";
  if (chunk.severity === "ok") return "auditado";
  return "sem auditoria";
}

// Os mesmos rótulos do backend (audio_quality.ISSUE_LABELS): o usuário lê a
// frase, não o código do problema.
const QUALITY_LABELS = {
  queda_de_brilho: "a voz perde brilho do começo ao fim do trecho",
  voz_abafada: "o trecho é mais abafado que o resto do episódio",
  volume_baixo: "o trecho é mais baixo que o resto do episódio",
};

export function qualityIssuesLabel(chunk) {
  const issues = chunk.quality_issues || [];
  if (!issues.length) return "";
  return issues.map((issue) => QUALITY_LABELS[issue] || issue).join("; ");
}

export function speakerLabel(chunk) {
  if (!chunk.speaker) return "";
  if (chunk.voice) {
    const style = chunk.style ? ` (${chunk.style})` : "";
    return ` · ${chunk.speaker}: voz ${chunk.voice}${style}`;
  }
  return ` · voz ${chunk.speaker}`;
}
