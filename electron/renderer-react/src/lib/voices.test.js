import { describe, expect, it } from "vitest";
import {
  presentersFromSpec,
  sortVoicesByLanguage,
  voiceLabel,
  voiceLanguageCode,
  voiceOptionLabel,
  voiceToneLabel,
} from "./voices.js";

describe("voiceLabel", () => {
  it("traduz o prefixo de idioma do Kokoro", () => {
    expect(voiceLabel("pf_dora", "hexgrad/kokoro")).toBe("Dora (português — Brasil)");
    expect(voiceLabel("af_heart", "hexgrad/kokoro")).toBe("Heart (inglês — EUA)");
  });

  it("desmonta o formato locale-nome:modelo da MAI-Voice-2", () => {
    expect(voiceLabel("en-US-Harper:MAI-Voice-2", "microsoft/mai-voice-2"))
      .toBe("Harper (inglês — EUA)");
    expect(voiceLabel("pt-BR-Rui:MAI-Voice-2", "microsoft/mai-voice-2"))
      .toBe("Rui (português — Brasil)");
  });

  it("remove o nome do modelo repetido no início da voz", () => {
    expect(voiceLabel("aura-2-thalia-en", "deepgram/aura-2")).toBe("Thalia (inglês)");
  });

  it("mantém o nome quando não há idioma reconhecível", () => {
    expect(voiceLabel("Zephyr", "google/gemini-tts")).toBe("Zephyr");
  });
});

describe("voiceToneLabel", () => {
  it("remove o idioma da descrição quando o ID já o carrega", () => {
    expect(voiceToneLabel("feminina, clara (pt-br)", "pf_dora")).toBe("feminina, clara");
    expect(voiceToneLabel("suave (fr-fr)", "ff_siwis")).toBe("suave");
  });

  it("preserva o idioma da descrição quando o ID não o carrega", () => {
    expect(voiceToneLabel("feminina, clara (en-us)", "thalia")).toBe("feminina, clara (en-us)");
  });
});

describe("voiceLanguageCode e ordenação", () => {
  it("descobre o idioma nas três convenções", () => {
    expect(voiceLanguageCode("pf_dora", "")).toBe("pt-br");
    expect(voiceLanguageCode("pt-PT-Rui:MAI-Voice-2", "")).toBe("pt-pt");
    expect(voiceLanguageCode("thalia", "feminina (en-us)")).toBe("en-us");
    expect(voiceLanguageCode("Zephyr", "brilhante")).toBe("");
  });

  it("coloca pt-BR primeiro, depois pt-PT, inglês, espanhol e o resto", () => {
    const entries = [
      ["Zephyr", "brilhante"],
      ["thalia", "feminina (en-us)"],
      ["ef_dora", "espanhola"],
      ["pt-PT-Rui:MAI-Voice-2", "masculina"],
      ["pf_dora", "brasileira"],
    ];

    expect(sortVoicesByLanguage(entries).map(([voice]) => voice)).toEqual([
      "pf_dora", "pt-PT-Rui:MAI-Voice-2", "thalia", "ef_dora", "Zephyr",
    ]);
  });

  it("preserva a ordem curada dentro do mesmo grupo de idioma", () => {
    const entries = [["af_bella", "a"], ["af_heart", "b"], ["af_nova", "c"]];
    expect(sortVoicesByLanguage(entries).map(([voice]) => voice))
      .toEqual(["af_bella", "af_heart", "af_nova"]);
  });
});

describe("voiceOptionLabel", () => {
  it("junta rótulo e tom quando há descrição", () => {
    expect(voiceOptionLabel("pf_dora", "feminina, clara (pt-br)", "hexgrad/kokoro"))
      .toBe("Dora (português — Brasil) · feminina, clara");
  });

  it("usa só o rótulo quando não há descrição", () => {
    expect(voiceOptionLabel("Zephyr", "", "google/gemini-tts")).toBe("Zephyr");
  });
});

describe("presentersFromSpec", () => {
  it("lê nome, voz e tom, ignorando entradas incompletas", () => {
    expect(presentersFromSpec("ana:Kore:curiosa, bruno:Puck, :Sulafat")).toEqual([
      { speaker: "ana", voice: "Kore", style: "curiosa" },
      { speaker: "bruno", voice: "Puck", style: "" },
    ]);
  });
});
