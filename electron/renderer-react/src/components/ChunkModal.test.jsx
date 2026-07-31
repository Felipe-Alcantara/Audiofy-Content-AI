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
});
