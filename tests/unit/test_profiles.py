"""Testes dos perfis nomeados de configuração (modelos + apresentadores)."""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy.profiles import BUILTIN_PROFILES, Profile, ProfileStore  # noqa: E402


class ProfileStoreTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = ProfileStore(Path(self._tmp.name) / "profiles.json")

    def tearDown(self):
        self._tmp.cleanup()

    def test_builtin_padrao_e_o_ativo_inicial(self):
        self.assertEqual(self.store.active().name, "padrao")

    def test_builtins_presentes(self):
        names = [p.name for p in self.store.list_profiles()]
        for builtin in BUILTIN_PROFILES:
            self.assertIn(builtin.name, names)

    def test_trocar_perfil_ativo(self):
        self.store.set_active("economico")
        self.assertEqual(self.store.active().name, "economico")

    def test_perfil_economico_usa_modelo_mais_barato_no_roteiro(self):
        economico = self.store.get("economico")
        self.assertEqual(economico.text_model, economico.audit_model)

    def test_criar_perfil_customizado(self):
        custom = Profile(
            name="meu", text_model="x/y", audit_model="x/z",
            tts_model="x/tts", presenters_spec="solo:Sulafat",
        )
        self.store.save(custom)
        self.store.set_active("meu")
        self.assertEqual(self.store.active().presenters_spec, "solo:Sulafat")

    def test_persistencia_entre_instancias(self):
        self.store.save(Profile("meu", "a/b", "a/c", "a/d", "n:V"))
        self.store.set_active("meu")
        reloaded = ProfileStore(self.store.path)
        self.assertEqual(reloaded.active().name, "meu")

    def test_builtin_nao_pode_ser_removido(self):
        with self.assertRaises(ValueError):
            self.store.remove("padrao")

    def test_perfil_inexistente(self):
        with self.assertRaises(LookupError):
            self.store.set_active("nao-existe")


if __name__ == "__main__":
    unittest.main()
