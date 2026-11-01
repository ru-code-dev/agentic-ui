import unittest


class XTest(unittest.TestCase):
    def test_docstring(self) -> None:
        """Imports are stdlib only [SV-C1]."""

    def test_mapped(self) -> None:
        pass

    def test_untagged(self) -> None:
        """No tag here."""
