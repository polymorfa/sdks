# Polymorfa Python SDK foundation

This source package contains a small, synchronous Python 3.11+ server client for
the Platform API. It is not published to PyPI. The only resource implemented is
`Client.projects.list()`, which calls `GET /platform/projects` with a team API
key carrying `sessions:read`. Project tokens and browser client tokens are not
accepted. The server still decides whether the key may access the route.

Install from a checked-out, reviewed SDK commit:

```bash
python -m pip install ./packages/python
```

```python
import os
from polymorfa_sdk import Client

client = Client(api_key=os.environ["POLYMORFA_API_KEY"])
response = client.projects.list()
for project in response.data:
    print(project.id, project.name, project.stage)
print(response.metadata.request_id)
```

The default base URL is `https://api.polymorfa.com`. `base_url` accepts another
HTTPS origin for the target environment, or loopback HTTP for local tests.
`api_version="2026-03-20"` sends `Polymorfa-Version` when an explicit version is
needed. `timeout` is in seconds and defaults to 10.

Responses contain typed `Project` values and the API's request ID and applied
version headers. Non-JSON success bodies and unexpected project-list shapes
raise `ProtocolError`. HTTP errors retain status, a safe error code when
present, and the request ID; they never include the server's raw body or the
API key. Transport failures raise `TransportError`. This client makes no
automatic retry, including after an ambiguous failure. Redirects are not
followed with the credential.

This package does not yet implement project creation, other Platform resources,
Messaging, webhooks, streaming, pagination, async transport, or SDK publication.
Its package name and release process must be reviewed before any PyPI release.

From the repository root, run the offline tests with:

```bash
uv run --python 3.11 --project packages/python python -m unittest discover -s packages/python/tests
```
