// Rótulos e ordenação de vozes — porte fiel de electron/renderer/renderer.js.
// A lógica é sutil (três convenções de idioma convivendo nos catálogos dos
// provedores), então mudanças aqui devem ser acompanhadas de teste.

const KOKORO_LANGUAGES = {
  a: "inglês — EUA",
  b: "inglês — Reino Unido",
  e: "espanhol",
  f: "francês",
  h: "hindi",
  i: "italiano",
  j: "japonês",
  p: "português — Brasil",
  z: "chinês",
};

const LOCALE_NAMES = {
  "en-us": "inglês — EUA",
  "en-gb": "inglês — Reino Unido",
  "en-au": "inglês — Austrália",
  "pt-br": "português — Brasil",
  "pt-pt": "português — Portugal",
  "es-mx": "espanhol — México",
  "es-es": "espanhol",
  "fr-fr": "francês",
  "de-de": "alemão",
  "it-it": "italiano",
  "ja-jp": "japonês",
  "ko-kr": "coreano",
  "zh-cn": "chinês",
};

const LANGUAGE_NAMES = {
  en: "inglês",
  "en us": "inglês (EUA)",
  "en gb": "inglês (Reino Unido)",
  "pt br": "português (Brasil)",
  es: "espanhol",
  fr: "francês",
  de: "alemão",
  it: "italiano",
  ja: "japonês",
  ko: "coreano",
  zh: "chinês",
};

export function voiceLabel(voice, ttsModel) {
  const kokoroCode = voice.match(/^([a-z])([fm])[_-]/i);
  const kokoroLanguage = kokoroCode && KOKORO_LANGUAGES[kokoroCode[1].toLowerCase()];

  // MAI-Voice-2 nomeia as vozes como "en-US-Harper:MAI-Voice-2": o locale vem
  // no início e o modelo repetido depois de ":". Sem tratar, o seletor mostra
  // "En US Harper:MAI Voice 2" — ilegível e com o idioma só em código.
  const localeVoice = voice.match(/^([a-z]{2})-([a-z]{2})-([^:]+)(?::.*)?$/i);
  if (localeVoice) {
    const [, primary, region, name] = localeVoice;
    const locale = `${primary}-${region}`.toLowerCase();
    const readable = name.replace(/[_-]+/g, " ").trim();
    return `${readable} (${LOCALE_NAMES[locale] || locale})`;
  }

  let label = voice.replace(/[_-]+/g, " ").trim();
  const modelSlug = (ttsModel || "").split("/").pop();
  if (modelSlug) {
    const prefix = modelSlug.replace(/[-_]+/g, " ").toLowerCase();
    if (label.toLowerCase().startsWith(`${prefix} `)) label = label.slice(prefix.length + 1);
  }
  const languageMatch = label.match(/\s+(en us|en gb|pt br|en|es|fr|de|it|ja|ko|zh)$/i);
  const language = languageMatch && LANGUAGE_NAMES[languageMatch[1].toLowerCase()];
  if (languageMatch) label = label.slice(0, -languageMatch[0].length).trim();
  if (kokoroCode) label = label.slice(2).trim();
  label = label.replace(/\b\w/g, (character) => character.toUpperCase());
  const nativeLanguage = kokoroLanguage || language;
  return nativeLanguage ? `${label || voice} (${nativeLanguage})` : (label || voice);
}

// Remove o idioma da descrição só quando voiceLabel() já o exibe separado:
// pela convenção de prefixo do Kokoro ("pf_dora") ou pelo locale no início do
// ID ("en-US-Harper:MAI-Voice-2"). Nos demais provedores (Deepgram, Voxtral…)
// o idioma existe só na descrição e precisa continuar visível.
export function voiceToneLabel(tone, voice) {
  if (typeof voice !== "string") return tone.trim();
  const hasLanguageInId = /^[a-z][fm][_-]/i.test(voice) || /^[a-z]{2}-[a-z]{2}-/i.test(voice);
  if (!hasLanguageInId) return tone.trim();
  // O código removido é genérico ("xx" ou "xx-YY") em vez de uma lista fixa —
  // senão vozes como ff_siwis (fr-FR) mostrariam o idioma duas vezes.
  return tone
    .replace(/\s*\([a-z]{2}(?:-[a-z]{2,3})?\)\s*$/i, "")
    .replace(/,\s*$/, "")
    .trim();
}

// Prioridade de idioma no seletor: o público do app é brasileiro, então pt-BR
// vem primeiro, pt-PT logo depois, e as línguas mais prováveis na sequência.
const VOICE_LANGUAGE_ORDER = ["pt-br", "pt-pt", "en", "es"];
const VOICE_LANGUAGE_FALLBACK_RANK = VOICE_LANGUAGE_ORDER.length + 1;

export function voiceLanguageCode(voice, tone) {
  const kokoroPrefixes = {
    a: "en", b: "en", e: "es", f: "fr", h: "hi", i: "it", j: "ja", p: "pt-br", z: "zh",
  };
  const kokoroCode = typeof voice === "string" && voice.match(/^([a-z])[fm][_-]/i);
  if (kokoroCode) return kokoroPrefixes[kokoroCode[1].toLowerCase()] || "";

  const localeCode = typeof voice === "string" && voice.match(/^([a-z]{2}-[a-z]{2})-/i);
  if (localeCode) return localeCode[1].toLowerCase();

  const toneCode = typeof tone === "string" && tone.match(/\(([a-z]{2}(?:-[a-z]{2,3})?)\)\s*$/i);
  return toneCode ? toneCode[1].toLowerCase() : "";
}

function voiceLanguageRank(voice, tone) {
  const code = voiceLanguageCode(voice, tone);
  if (!code) return VOICE_LANGUAGE_FALLBACK_RANK;
  // "en-us"/"en-gb"/"es-mx" caem no grupo do idioma base; pt-BR e pt-PT são
  // grupos distintos de propósito, porque a pronúncia difere bastante.
  const base = code.startsWith("pt") ? code : code.split("-")[0];
  const rank = VOICE_LANGUAGE_ORDER.indexOf(base);
  return rank === -1 ? VOICE_LANGUAGE_FALLBACK_RANK : rank;
}

// Ordena por grupo de idioma preservando a ordem curada do catálogo dentro de
// cada grupo (Array.prototype.sort é estável no V8).
export function sortVoicesByLanguage(entries) {
  return [...entries].sort(
    ([voiceA, toneA], [voiceB, toneB]) =>
      voiceLanguageRank(voiceA, toneA) - voiceLanguageRank(voiceB, toneB),
  );
}

// Opção de <select> para uma voz: rótulo legível + tom, quando houver.
export function voiceOptionLabel(voice, tone, ttsModel, profiles) {
  const cleanTone = tone && voiceToneLabel(tone, voice);
  const base = cleanTone
    ? `${voiceLabel(voice, ttsModel)} · ${cleanTone}`
    : voiceLabel(voice, ttsModel);
  // O perfil medido vem antes do rótulo do catálogo porque é o único dado
  // que descreve como a voz soa: "Fenrir" e "Alnilam" parecem masculinas pelo
  // nome e não são.
  const profile = profiles && profiles[voice];
  if (!profile) return base;
  return `${base} · ${profile.pitch_label} ${profile.pitch_hz} Hz`;
}

export function presentersFromSpec(spec) {
  return spec.split(",").map((chunk) => {
    const [speaker = "", voice = "Kore", style = ""] = chunk.trim().split(":");
    return { speaker: speaker.trim(), voice: voice.trim(), style: style.trim() };
  }).filter((presenter) => presenter.speaker && presenter.voice);
}
