import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ChatTab from "./ChatTab.jsx";
import StatusProvider from "../state/StatusProvider.jsx";

function renderChat(props = {}) {
  return render(
    <StatusProvider>
      <ChatTab onContentChanged={() => {}} {...props} />
    </StatusProvider>
  );
}

function bridgeRouter(handlers) {
  return vi.fn((args, stdin) => {
    const handler = handlers[args[0]];
    if (!handler) return Promise.resolve({ ok: false, error: `sem mock para ${args[0]}` });
    return Promise.resolve(handler(args, stdin));
  });
}

beforeEach(() => {
  delete window.audiofy;
});

afterEach(() => {
  cleanup();
  delete window.audiofy;
});

describe("ChatTab", () => {
  it("carrega o histórico ao montar", async () => {
    window.audiofy = {
      bridge: bridgeRouter({
        "chat-history": () => ({
          ok: true,
          messages: [
            { role: "user", content: "oi" },
            { role: "assistant", content: "olá!" },
          ],
        }),
      }),
    };

    renderChat();

    await waitFor(() => expect(screen.getByText("olá!")).toBeInTheDocument());
    expect(screen.getByText("oi")).toBeInTheDocument();
  });

  it("envia a mensagem com o prefixo do modo escolhido", async () => {
    const bridge = bridgeRouter({
      "chat-history": () => ({ ok: true, messages: [] }),
      chat: () => ({ ok: true, reply: "feito", actions: [] }),
    });
    window.audiofy = { bridge };

    renderChat();
    await waitFor(() => expect(bridge).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /Pesquisar/ }));
    fireEvent.change(screen.getByLabelText("Mensagem para o assistente"), {
      target: { value: "computação quântica" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByText("feito")).toBeInTheDocument());
    const chatCall = bridge.mock.calls.find((call) => call[0][0] === "chat");
    expect(chatCall[1]).toContain("[MODO PESQUISA]");
    expect(chatCall[1]).toContain("computação quântica");
    expect(screen.getByText("computação quântica")).toBeInTheDocument();
  });

  it("executa sozinho as ações propostas e avisa o dono do conteúdo", async () => {
    const onContentChanged = vi.fn();
    const bridge = bridgeRouter({
      "chat-history": () => ({ ok: true, messages: [] }),
      chat: () => ({
        ok: true,
        reply: "achei um tema",
        actions: [{ tipo: "adicionar_texto", titulo: "Tema", texto: "corpo" }],
      }),
      "add-text": () => ({ ok: true, item_id: "tema-1" }),
    });
    window.audiofy = { bridge };

    renderChat({ onContentChanged });
    await waitFor(() => expect(bridge).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Mensagem para o assistente"), {
      target: { value: "pesquise algo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() =>
      expect(screen.getByText("✔ Conteúdo criado: tema-1")).toBeInTheDocument()
    );
    expect(onContentChanged).toHaveBeenCalled();
  });

  it("mostra o erro devolvido pela bridge", async () => {
    window.audiofy = {
      bridge: bridgeRouter({
        "chat-history": () => ({ ok: true, messages: [] }),
        chat: () => ({ ok: false, error: "sem chave" }),
      }),
    };

    renderChat();
    fireEvent.change(screen.getByLabelText("Mensagem para o assistente"), {
      target: { value: "oi" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByText("✖ sem chave")).toBeInTheDocument());
  });

  it("limpa a conversa", async () => {
    const bridge = bridgeRouter({
      "chat-history": () => ({ ok: true, messages: [{ role: "user", content: "oi" }] }),
      "chat-clear": () => ({ ok: true }),
    });
    window.audiofy = { bridge };

    renderChat();
    await waitFor(() => expect(screen.getByText("oi")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "🗑️ Limpar" }));

    await waitFor(() => expect(screen.queryByText("oi")).toBeNull());
    expect(bridge).toHaveBeenCalledWith(["chat-clear", "principal"], undefined);
  });
});
