"use strict";

// Testa o COMPORTAMENTO do transporte dos modais (não só o texto do código):
// o <audio> vive no dock e os modais o comandam. O bug original era mover o
// elemento pelo DOM entre dock e modais — `appendChild` move, não copia, e o
// Chromium reinicia a mídia ao remontá-la, deixando o player mudo ao voltar.
//
// As funções vivem em renderer.js, que é um script de página (sem exports) e
// depende de `document`/`window`. Em vez de arrastar uma dependência de DOM
// completo só para isto, o teste recria o mínimo que essas funções tocam e
// avalia o trecho relevante do arquivo real — assim o que roda aqui é o mesmo
// código que roda no app.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const rendererPath = path.resolve(__dirname, "../renderer/renderer.js");

function criarElemento(id) {
  const ouvintes = new Map();
  return {
    id,
    textContent: "",
    onclick: null,
    classList: {
      classes: new Set(["hidden"]),
      add(nome) {
        this.classes.add(nome);
      },
      remove(nome) {
        this.classes.delete(nome);
      },
      contains(nome) {
        return this.classes.has(nome);
      },
    },
    // <audio> falso: o suficiente para play/pause e disparo de eventos.
    paused: true,
    currentTime: 0,
    readyState: 4,
    src: "",
    dataset: {},
    play() {
      this.paused = false;
      this.disparar("play");
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
      this.disparar("pause");
    },
    focus() {},
    addEventListener(evento, callback) {
      if (!ouvintes.has(evento)) ouvintes.set(evento, []);
      ouvintes.get(evento).push(callback);
    },
    removeEventListener(evento, callback) {
      const lista = ouvintes.get(evento) || [];
      const posicao = lista.indexOf(callback);
      if (posicao >= 0) lista.splice(posicao, 1);
    },
    disparar(evento) {
      for (const callback of [...(ouvintes.get(evento) || [])]) callback();
    },
    totalDeOuvintes() {
      return [...ouvintes.values()].reduce((soma, lista) => soma + lista.length, 0);
    },
  };
}

/** Avalia só as funções de transporte do renderer real, com um DOM mínimo. */
function carregarTransporte() {
  const fonte = fs.readFileSync(rendererPath, "utf8");
  const trechos = [
    /function ensurePlayerDockVisible\(\) \{[\s\S]*?\n\}/,
    /function bindModalTransport\(buttonId, elapsedId\) \{[\s\S]*?\n\}/,
    /function formatSeconds\(value\) \{[\s\S]*?\n\}/,
  ].map((padrao) => {
    const encontrado = fonte.match(padrao);
    assert.ok(encontrado, `função ausente em renderer.js: ${padrao}`);
    return encontrado[0];
  });

  const elementos = new Map(
    ["episode-player", "player-dock", "btn-toggle", "elapsed"].map((id) => [id, criarElemento(id)])
  );
  const contexto = {
    $: (id) => elementos.get(id),
    Number,
    Math,
    String,
    Promise,
  };
  vm.createContext(contexto);
  vm.runInContext(trechos.join("\n\n"), contexto);
  return { contexto, elementos };
}

test("o botão do modal reflete e comanda o estado do player do dock", () => {
  const { contexto, elementos } = carregarTransporte();
  const player = elementos.get("episode-player");
  const botao = elementos.get("btn-toggle");

  contexto.bindModalTransport("btn-toggle", "elapsed");
  assert.equal(botao.textContent, "▶️ Tocar", "com o player pausado, oferece tocar");

  botao.onclick();
  assert.equal(player.paused, false, "clicar no botão do modal dá play no player do dock");
  assert.equal(botao.textContent, "⏸️ Pausar");

  botao.onclick();
  assert.equal(player.paused, true);
  assert.equal(botao.textContent, "▶️ Tocar");
});

test("o botão acompanha mudanças feitas fora do modal", () => {
  const { contexto, elementos } = carregarTransporte();
  const player = elementos.get("episode-player");
  const botao = elementos.get("btn-toggle");

  contexto.bindModalTransport("btn-toggle", "elapsed");
  // Usuário aperta play no próprio dock, não no modal.
  player.play();
  assert.equal(botao.textContent, "⏸️ Pausar", "o modal reflete o player, não um estado próprio");
});

test("o tempo decorrido acompanha o player", () => {
  const { contexto, elementos } = carregarTransporte();
  const player = elementos.get("episode-player");
  const tempo = elementos.get("elapsed");

  contexto.bindModalTransport("btn-toggle", "elapsed");
  player.currentTime = 83;
  player.disparar("timeupdate");
  assert.equal(tempo.textContent, "1:23");
});

test("fechar o modal solta os listeners, sem empilhar a cada abertura", () => {
  const { contexto, elementos } = carregarTransporte();
  const player = elementos.get("episode-player");

  const soltar = contexto.bindModalTransport("btn-toggle", "elapsed");
  const durante = player.totalDeOuvintes();
  assert.ok(durante > 0);

  soltar();
  assert.equal(player.totalDeOuvintes(), 0, "abrir e fechar várias vezes não pode vazar listeners");

  // Abrir de novo funciona normalmente.
  contexto.bindModalTransport("btn-toggle", "elapsed");
  assert.equal(player.totalDeOuvintes(), durante);
});

test("abrir um modal não pausa nem descarrega o que está tocando", () => {
  const { contexto, elementos } = carregarTransporte();
  const player = elementos.get("episode-player");
  player.src = "file:///episodio.mp3";
  player.dataset.source = player.src;
  player.play();
  player.currentTime = 42;

  contexto.bindModalTransport("btn-toggle", "elapsed");

  assert.equal(player.paused, false, "o áudio continua tocando ao abrir o acompanhamento");
  assert.equal(player.currentTime, 42, "a posição é preservada");
  assert.equal(player.src, "file:///episodio.mp3", "a fonte não é descartada");
});

test("o dock fica visível para o usuário poder pausar com o modal aberto", () => {
  const { contexto, elementos } = carregarTransporte();
  const dock = elementos.get("player-dock");
  assert.ok(dock.classList.contains("hidden"), "começa escondido");

  contexto.ensurePlayerDockVisible();

  assert.equal(dock.classList.contains("hidden"), false);
});

test("formatSeconds cobre zero, minutos e valores inválidos", () => {
  const { contexto } = carregarTransporte();
  assert.equal(contexto.formatSeconds(0), "0:00");
  assert.equal(contexto.formatSeconds(9), "0:09");
  assert.equal(contexto.formatSeconds(600), "10:00");
  assert.equal(contexto.formatSeconds(NaN), "0:00", "player sem metadata não quebra a exibição");
});
