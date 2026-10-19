import pytest

from polymorfa import Credential
from polymorfa.errors import ConfigurationError


@pytest.mark.parametrize(
    "kind,value",
    [
        (
            "organization_api_key",
            "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
        ),
        (
            "project_token",
            "pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
        ),
    ],
)
def test_opaque_shape(kind, value):
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
