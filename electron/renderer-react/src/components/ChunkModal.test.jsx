import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import ChunkModal from "./ChunkModal.jsx";
import { mockAudiofy, renderWithProviders, SETTINGS_INFO } from "../testing/harness.jsx";

const CHUNKS = {
  ok: true,
  audit: { segments: 2, critical: 1, warnings: 0 },
  chunks: [
    {
      chunk_index: 1,
      chunk_total: 2,
      file: "001.mp3",
      path: "/d/001.mp3",
      severity: "ok",
      duration_seconds: 12.34,
      longest_silence_seconds: 0.5,
      speaker: "ana",
      voice: "Kore",
    },
    {
      chunk_index: 2,
      chunk_total: 2,
      file: "002.mp3",
      path: "/d/002.mp3",
      severity: "critical",
      duration_seconds: 8,
      longest_silence_seconds: 6,
    },
  ],
};

const CHUNKS_COM_QUALIDADE = {
  ok: true,
  audit: { segments: 3, critical: 0, warnings: 0 },
  quality: { total: 3, com_problema: 2, trechos_com_problema: [2, 3] },
  chunks: [
    { chunk_index: 1, chunk_total: 3, file: "001.wav", path: "/d/001.wav", severity: "ok",
      duration_seconds: 30, quality_issues: [], quality_severity: "ok" },
    { chunk_index: 2, chunk_total: 3, file: "002.wav", path: "/d/002.wav", severity: "ok",
      duration_seconds: 30, quality_issues: ["queda_de_brilho"], quality_severity: "atencao",
      brightness_drop: 0.41 },
    { chunk_index: 3, chunk_total: 3, file: "003.wav", path: "/d/003.wav", severity: "ok",
      duration_seconds: 30, quality_issues: ["volume_baixo"], quality_severity: "atencao" },
  ],
};

const BASE = {
  "settings-info": () => SETTINGS_INFO,
  status: () => ({ ok: true, anything_running: false, running: [], episodes: [] }),
};

beforeEach(() => {
  delete window.audiofy;
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  delete window.audiofy;
});

describe("ChunkModal", () => {
  it("lista os chunks com auditoria, duração e severidade", async () => {
    const bridge = mockAudiofy({ ...BASE, "audio-chunks": () => CHUNKS });

    renderWithProviders(
      <ChunkModal
        target={{ episodeId: "artigo-x", title: "Artigo X", language: "pt-BR" }}
        onClose={() => {}}
      />
    );

    await waitFor(() =>
      expect(screen.getByText("Revisão dos chunks · Artigo X")).toBeInTheDocument()
    );
    expect(bridge).toHaveBeenCalledWith(
      ["audio-chunks", "artigo-x", "--language=pt-BR"], undefined
    );
    expect(screen.getByText("2 chunks · 1 crítico(s) · 0 aviso(s)")).toBeInTheDocument();
    expect(screen.getByText("Chunk 1 de 2 · ana: voz Kore")).toBeInTheDocument();
    expect(screen.getByText("001.mp3 · 12.3s · auditado · maior silêncio 0.5s"))
      .toBeInTheDocument();
    expect(screen.getByText("002.mp3 · 8.0s · silêncio crítico · maior silêncio 6.0s"))
      .toBeInTheDocument();
  });

  it("anuncia o chunk que passou a tocar", async () => {
    mockAudiofy({ ...BASE, "audio-chunks": () => CHUNKS });

    renderWithProviders(
      <ChunkModal
        target={{ episodeId: "artigo-x", title: "Artigo X" }}
        onClose={() => {}}
      />
    );
    await screen.findByText("Chunk 1 de 2 · ana: voz Kore");

    fireEvent.click(screen.getAllByRole("button", { name: "▶️ ouvir", hidden: true })[1]);

    expect(await screen.findByText("Tocando chunk 2 de 2 · 002.mp3")).toBeInTheDocument();
  });

  it("fecha quando a bridge falha, avisando o erro", async () => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
    const onClose = vi.fn();
    mockAudiofy({ ...BASE, "audio-chunks": () => ({ ok: false, error: "sem áudio" }) });

    renderWithProviders(
      <ChunkModal target={{ episodeId: "artigo-x", title: "Artigo X" }} onClose={onClose} />
    );

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(window.alert).toHaveBeenCalledWith("sem áudio");
  });

  it("não renderiza nada sem alvo", () => {
    mockAudiofy(BASE);
    const { container } = renderWithProviders(
      <ChunkModal target={null} onClose={() => {}} />
    );
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("mostra o problema de qualidade de cada trecho, além do silêncio", async () => {
    mockAudiofy({ ...BASE, "audio-chunks": () => CHUNKS_COM_QUALIDADE });

    renderWithProviders(
      <ChunkModal
        target={{ episodeId: "artigo-x", title: "Artigo X", language: "pt-BR" }}
        onClose={() => {}}
      />
    );

    expect(await screen.findByText(/perde brilho/)).toBeInTheDocument();
    expect(screen.getByText(/mais baixo que o resto/)).toBeInTheDocument();
    expect(screen.getByText(/2 de 3 trecho/)).toBeInTheDocument();
  });

  it("refaz só os trechos escolhidos, avisando o custo antes", async () => {
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(true);
    const bridge = mockAudiofy({
      ...BASE,
      "audio-chunks": () => CHUNKS_COM_QUALIDADE,
      "regenerate-chunks": () => ({ ok: true, started: true, chunks: [2, 3],
        estimated_cost_usd: 0.06 }),
    });

    renderWithProviders(
      <ChunkModal
        target={{ episodeId: "artigo-x", title: "Artigo X", language: "pt-BR" }}
        onClose={() => {}}
      />
    );

    // Os trechos com problema já vêm marcados: é o que o usuário quer refazer.
    // O <dialog> não abre no jsdom, então o conteúdo fica fora da árvore de
    // acessibilidade: consulta por texto, como os demais testes deste arquivo.
    fireEvent.click(await screen.findByText(/Refazer 2 trecho/));

    await waitFor(() => expect(bridge).toHaveBeenCalledWith(
      ["regenerate-chunks", "custom", "artigo-x", "2,3", "--language=pt-BR"], undefined
    ));
    expect(confirmar).toHaveBeenCalled();
  });

  it("não gasta nada quando o usuário cancela a confirmação", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const bridge = mockAudiofy({ ...BASE, "audio-chunks": () => CHUNKS_COM_QUALIDADE });

    renderWithProviders(
      <ChunkModal
        target={{ episodeId: "artigo-x", title: "Artigo X", language: "pt-BR" }}
        onClose={() => {}}
      />
    );

    fireEvent.click(await screen.findByText(/Refazer 2 trecho/));

    await waitFor(() => expect(bridge).not.toHaveBeenCalledWith(
      expect.arrayContaining(["regenerate-chunks"]), undefined
    ));
  });
});
