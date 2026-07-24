"""Persistência da posição de reprodução de cada episódio.

Usa arquivo em disco (escrita atômica), não localStorage do Electron: o
Chromium não garante que localStorage seja fisicamente sincronizado no
momento do setItem — fechar a janela abruptamente pode perder o dado ainda
não commitado, o que fazia o resume sempre voltar para o início.
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy.playback_positions import PlaybackPositions  # noqa: E402


class PlaybackPositionsTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.path = Path(self._tmp.name) / "playback-positions.json"
        self.store = PlaybackPositions(self.path)

    def tearDown(self):
        self._tmp.cleanup()

    def test_le_none_quando_nunca_foi_salvo(self):
        self.assertIsNone(self.store.read("file:///a/b/ep.mp3"))

    def test_salva_e_le_de_volta(self):
        self.store.save("file:///a/b/ep.mp3", 123.45)
        self.assertEqual(self.store.read("file:///a/b/ep.mp3"), 123.45)

    def test_persiste_entre_instancias_diferentes_do_mesmo_arquivo(self):
        # Simula fechar e reabrir o app: uma nova instância lendo o mesmo
        # arquivo precisa enxergar o valor salvo pela instância anterior.
        self.store.save("file:///a/b/ep.mp3", 42.0)
        outra_instancia = PlaybackPositions(self.path)
        self.assertEqual(outra_instancia.read("file:///a/b/ep.mp3"), 42.0)

    def test_escrita_e_atomica_via_arquivo_temporario(self):
        self.store.save("file:///a/b/ep.mp3", 10.0)
        self.assertFalse(self.path.with_suffix(".json.tmp").exists())
        self.assertTrue(self.path.is_file())

    def test_atualizar_um_episodio_preserva_os_demais(self):
        self.store.save("file:///a/b/ep1.mp3", 10.0)
        self.store.save("file:///a/b/ep2.mp3", 20.0)
        self.store.save("file:///a/b/ep1.mp3", 15.0)
        self.assertEqual(self.store.read("file:///a/b/ep1.mp3"), 15.0)
        self.assertEqual(self.store.read("file:///a/b/ep2.mp3"), 20.0)

    def test_arquivo_corrompido_nao_quebra_a_leitura(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text("{ json inválido", encoding="utf-8")
        self.assertIsNone(self.store.read("file:///a/b/ep.mp3"))

    def test_arquivo_corrompido_nao_impede_salvar_de_novo(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text("{ json inválido", encoding="utf-8")
        self.store.save("file:///a/b/ep.mp3", 5.0)
        self.assertEqual(self.store.read("file:///a/b/ep.mp3"), 5.0)

    def test_limita_o_numero_de_entradas_guardadas(self):
        for index in range(250):
            self.store.save(f"file:///a/ep{index}.mp3", float(index))
        data = json.loads(self.path.read_text(encoding="utf-8"))
        self.assertLessEqual(len(data), 200)
        # A entrada mais recente nunca deve ser descartada.
        self.assertIn("file:///a/ep249.mp3", data)

    def test_diretorio_pai_e_criado_se_nao_existir(self):
        aninhado = Path(self._tmp.name) / "sub" / "playback-positions.json"
        store = PlaybackPositions(aninhado)
        store.save("file:///a/b/ep.mp3", 1.0)
        self.assertTrue(aninhado.is_file())


if __name__ == "__main__":
    unittest.main()
