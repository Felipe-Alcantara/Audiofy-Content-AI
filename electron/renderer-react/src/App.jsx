import { useCallback, useState } from "react";
import ChatTab from "./components/ChatTab.jsx";
import ChunkModal from "./components/ChunkModal.jsx";
import ContentTab from "./components/ContentTab.jsx";
import CostsTab from "./components/CostsTab.jsx";
import EpisodesTab from "./components/EpisodesTab.jsx";
import Header from "./components/Header.jsx";
import SettingsTab from "./components/SettingsTab.jsx";
import TeleprompterModal from "./components/TeleprompterModal.jsx";
import PlayerProvider from "./state/PlayerProvider.jsx";
import SettingsProvider from "./state/SettingsProvider.jsx";
import StatusProvider from "./state/StatusProvider.jsx";

// Casca do renderer React: abas + modais. Os providers (player, status,
// configurações) ficam por fora para que header, abas e modais compartilhem o
// mesmo estado — como as variáveis de módulo faziam no renderer vanilla.

function AppShell() {
  const [activeTab, setActiveTab] = useState("chat");
  const [source, setSource] = useState("custom");
  const [contentReloadToken, setContentReloadToken] = useState(0);
  const [chunkTarget, setChunkTarget] = useState(null);
  const [teleprompterEpisode, setTeleprompterEpisode] = useState(null);
  const [chatDraft, setChatDraft] = useState(null);

  const reloadContent = useCallback(() => {
    setContentReloadToken((token) => token + 1);
  }, []);

  const openChunks = useCallback((episodeId, title, language) => {
    setTeleprompterEpisode(null);
    setChunkTarget({ episodeId, title, language });
  }, []);

  const openTeleprompter = useCallback((episode) => {
    setChunkTarget(null);
    setTeleprompterEpisode(episode);
  }, []);

  // Arquivo que a extração local não conseguiu ler: em vez de gastar créditos
  // sozinho, o app prepara a instrução no Chat e deixa a decisão com o usuário.
  const delegateExtraction = useCallback(async (filePath, reason) => {
    const name = String(filePath).split(/[\\/]/).pop();
    const confirmed = confirm(
      `Não consegui extrair o texto de "${name}" localmente.\n\n${reason}\n\n` +
      "Quer que o agente de IA leia e transcreva o arquivo?\n\n" +
      "⚠️ Isso consome créditos e pode ficar lento/caro em arquivos grandes " +
      "(livros, dezenas de páginas ou muitas imagens). " +
      "Alternativa sem custo: instalar o OCR local em Configurações → Diagnóstico, " +
      "ou colar o texto manualmente."
    );
    if (!confirmed) return;
    setChatDraft({
      text:
        `[EXTRAÇÃO DE ARQUIVO] Leia o arquivo em "${filePath}" e transcreva o texto ` +
        "integralmente, sem resumir nem reescrever. Depois adicione o resultado como " +
        "conteúdo via ação adicionar_texto, usando o título do próprio documento. " +
        "Não peça confirmação.",
      notice:
        `Transcrição de "${name}" preparada no chat — revise e envie para o agente executar.`,
      token: Date.now(),
    });
    setActiveTab("chat");
  }, []);

  return (
    <>
      <Header activeTab={activeTab} onSelectTab={setActiveTab} />
      <main id="app-content">
        {/* Cada aba é mantida montada só quando ativa: o estado pesado (lista de
            itens, histórico do chat) é recarregado da bridge ao voltar, como no
            vanilla, que também refazia a carga ao ativar a aba. */}
        <section
          id={`tab-${activeTab}`}
          className="tab-page"
          role="tabpanel"
          aria-hidden="false"
          tabIndex={0}
        >
          {activeTab === "chat" && (
            <ChatTab
              currentSource={source}
              draft={chatDraft}
              onContentChanged={reloadContent}
            />
          )}
          {activeTab === "content" && (
            <ContentTab
              source={source}
              onSourceChange={setSource}
              reloadToken={contentReloadToken}
              onOpenChunks={openChunks}
              onDelegateExtraction={delegateExtraction}
            />
          )}
          {activeTab === "episodes" && (
            <EpisodesTab onOpenChunks={openChunks} onOpenTeleprompter={openTeleprompter} />
          )}
          {activeTab === "costs" && <CostsTab />}
          {activeTab === "settings" && <SettingsTab />}
        </section>
      </main>

      <ChunkModal target={chunkTarget} onClose={() => setChunkTarget(null)} />
      <TeleprompterModal
        episode={teleprompterEpisode}
        onClose={() => setTeleprompterEpisode(null)}
      />
    </>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <StatusProvider>
        <PlayerProvider>
          <AppShell />
        </PlayerProvider>
      </StatusProvider>
    </SettingsProvider>
  );
}
