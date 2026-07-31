import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import TeleprompterModal from "./TeleprompterModal.jsx";
import { mockAudiofy, renderWithProviders, SETTINGS_INFO } from "../testing/harness.jsx";

const EPISODE = {
  episode_id: "artigo-x",
  title: "Artigo X",
  mp3: "/d/final.mp3",
  language: "pt-BR",
};

function chunks(withTiming = true) {
  return {
    ok: true,
    chunks: [
      {
        chunk_index: 1,
        text: "Primeiro parágrafo.",
        speaker: "ana",
        voice: "Kore",
        start_seconds: withTiming ? 0 : null,
        end_seconds: withTiming ? 10 : null,
      },
      {
        chunk_index: 2,
        text: "Comentário do narrador.",
        kind: "commentary",
        start_seconds: withTiming ? 10 : null,
        end_seconds: withTiming ? 20 : null,
      },
    ],
  };
}

const BASE = {
  "settings-info": () => SETTINGS_INFO,
  status: () => ({ ok: true, anything_running: false, running: [], episodes: [] }),
  "playback-position-get": () => ({ ok: true, seconds: 0 }),
};

beforeEach(() => {
  delete window.audiofy;
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  delete window.audiofy;
});

describe("TeleprompterModal", () => {
  it("mostra o texto por parágrafo, numerado, com o rótulo de quem fala", async () => {
    mockAudiofy({ ...BASE, "audio-chunks": () => chunks() });

    renderWithProviders(<TeleprompterModal episode={EPISODE} onClose={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText("Acompanhar a leitura · Artigo X")).toBeInTheDocument()
    );
    expect(screen.getByText("2 trecho(s) de texto disponível para acompanhamento."))
      .toBeInTheDocument();
    expect(screen.getByText("ana: voz Kore")).toBeInTheDocument();
    expect(screen.getByText("comentário do narrador")).toBeInTheDocument();
    expect(screen.getByText("Primeiro parágrafo.")).toBeInTheDocument();
  });

  it("avisa quando o episódio não tem marcação de tempo e não deixa pular", async () => {
    mockAudiofy({ ...BASE, "audio-chunks": () => chunks(false) });

    renderWithProviders(<TeleprompterModal episode={EPISODE} onClose={() => {}} />);

    expect(await screen.findByText(/Sem auditoria de áudio completa/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Primeiro parágrafo/, hidden: true })).toBeNull();
  });

  it("pula o áudio para o parágrafo clicado", async () => {
    mockAudiofy({ ...BASE, "audio-chunks": () => chunks() });

    renderWithProviders(<TeleprompterModal episode={EPISODE} onClose={() => {}} />);
    const paragraph = await screen.findByText("Comentário do narrador.");

    const player = document.querySelector("audio");
    const playSpy = vi.spyOn(player, "play").mockResolvedValue(undefined);

    fireEvent.click(paragraph.closest(".teleprompter-turn"));

    expect(player.currentTime).toBe(10);
    expect(playSpy).toHaveBeenCalled();
  });

  it("pula pelo formulário 'ir para o parágrafo'", async () => {
    mockAudiofy({ ...BASE, "audio-chunks": () => chunks() });

    renderWithProviders(<TeleprompterModal episode={EPISODE} onClose={() => {}} />);
    await screen.findByText("Primeiro parágrafo.");

    const player = document.querySelector("audio");
    vi.spyOn(player, "play").mockResolvedValue(undefined);

    fireEvent.change(screen.getByLabelText("Ir para o parágrafo"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Pular", hidden: true }));

    expect(player.currentTime).toBe(10);
  });
});
