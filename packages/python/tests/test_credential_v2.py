import pytest

from polymorfa import Credential
from polymorfa.errors import ConfigurationError


@pytest.mark.parametrize(
    "kind,value",
    [
        (
            "organization_api_key",
            "pmfa_AlsicmZjODAzMi10ZXN0LW9ubHkiLCJ0ZXN0IiwiaHR0cHM6Ly9wbGF0Zm9ybS5leGFtcGxlLnRlc3QiLCJwb2x5bW9yZmEtYXBpIiwia2V5IiwiMTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTExIixudWxsXbjN-6gasxNDFbo2VaQINFS9h-9IDV4h2FAnK4ji8ByM53uN7XQ6MPjmBq13cVl96c-KYIU14G-UZynW-8KxGw8",
        ),
        (
            "project_token",
            "pmfa_pt_AlsicmZjODAzMi10ZXN0LW9ubHkiLCJ0ZXN0IiwiaHR0cHM6Ly9wbGF0Zm9ybS5leGFtcGxlLnRlc3QiLCJwb2x5bW9yZmEtYXBpIiwicHJvamVjdCIsIjIyMjIyMjIyLTIyMjItNDIyMi04MjIyLTIyMjIyMjIyMjIyMiIsbnVsbF35YUtyQHHoF1XFbKgPs7VdbBDzqsuY-qE64Aai_khRLdsvB9SBCsw4YPnmdjSVA6rW4CdtP6NKuj-KlYMZDuAL",
        ),
    ],
)
def test_signed_v2_shape(kind, value):
    Credential(kind, value)
    for invalid in [value + "=", value + "\n", value[:-1] + "!", "A" * 16385]:
        with pytest.raises(ConfigurationError):
            Credential(kind, invalid)


@pytest.mark.parametrize(
    "kind,value",
    [("organization_api_key", "pmfa_" + "A" * 72), ("project_token", "pmfa_pt_" + "A" * 94)],
)
def test_v1_rejected(kind, value):
    with pytest.raises(ConfigurationError):
        Credential(kind, value)
