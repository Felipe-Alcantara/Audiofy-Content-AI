"""Testes do chat de pesquisa: parsing de ações e persistência de sessão."""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy.chat import ChatSession, parse_actions  # noqa: E402


class ParseActionsTest(unittest.TestCase):
    def test_resposta_sem_acao(self):
        text, actions = parse_actions("Só uma resposta normal.")
        self.assertEqual(text, "Só uma resposta normal.")
        self.assertEqual(actions, [])

    def test_resposta_com_acao(self):
        reply = ("Achei este artigo.\n\n```acao\n"
                 '{"tipo": "adicionar_url", "url": "https://ex.com/a"}\n```')
        text, actions = parse_actions(reply)
        self.assertEqual(text, "Achei este artigo.")
        self.assertEqual(actions[0]["tipo"], "adicionar_url")

    def test_multiplas_acoes(self):
        reply = ('```acao\n{"tipo": "buscar", "fonte": "akita", "termos": "ia"}\n```\n'
                 '```acao\n{"tipo": "gerar", "fonte": "akita", "item_id": "x"}\n```')
        _, actions = parse_actions(reply)
        self.assertEqual(len(actions), 2)

    def test_acao_com_json_invalido_e_ignorada(self):
        reply = "Texto.\n```acao\n{quebrado\n```"
        text, actions = parse_actions(reply)
        self.assertEqual(actions, [])
        self.assertEqual(text, "Texto.")


class ChatSessionTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.chat_dir = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def _fake_provider(self, reply: str):
        def call(system, user, settings):
            self.last_prompt = user
            return reply
        return call

    def test_envia_e_persiste(self):
        session = ChatSession("t", chat_dir=self.chat_dir)
        text, _ = session.send("Oi", None, call_provider=self._fake_provider("Olá!"))
        self.assertEqual(text, "Olá!")
        reloaded = ChatSession("t", chat_dir=self.chat_dir)
        self.assertEqual(len(reloaded.messages), 2)

    def test_historico_entra_no_prompt(self):
        session = ChatSession("t", chat_dir=self.chat_dir)
        session.send("Primeira", None, call_provider=self._fake_provider("R1"))
        session.send("Segunda", None, call_provider=self._fake_provider("R2"))
        self.assertIn("Primeira", self.last_prompt)
        self.assertIn("R1", self.last_prompt)

    def test_clear(self):
        session = ChatSession("t", chat_dir=self.chat_dir)
        session.send("Oi", None, call_provider=self._fake_provider("Olá"))
        session.clear()
        self.assertEqual(ChatSession("t", chat_dir=self.chat_dir).messages, [])


if __name__ == "__main__":
    unittest.main()
