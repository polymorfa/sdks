"""Opt-in native aioboto3/S3 tests; customer-owned loopback MinIO fixture only."""

import hashlib
import os
import secrets
from dataclasses import replace
from pathlib import Path

import httpx
import pytest

from polymorfa import AsyncMessagingClient, Credential, MediaDescriptor, MediaIntegrityError
from polymorfa.direct_media import UploadLocation
from polymorfa.media_encrypt import encrypt_whatsapp_media
from polymorfa.s3 import S3MediaStore


@pytest.fixture
async def native_s3():
    endpoint = os.environ.get("POLYMORFA_TEST_S3_URL")
    if not endpoint:
        pytest.skip("requires an application-owned native S3 fixture and aioboto3")
    import aioboto3
    from botocore.config import Config

    bucket = "python-native-" + secrets.token_hex(8)
    async with aioboto3.Session().client(
        "s3",
        endpoint_url=endpoint,
        region_name="us-east-1",
        aws_access_key_id="fixture",
        aws_secret_access_key="fixture-for-native-tests",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    ) as client:
        await client.create_bucket(Bucket=bucket)
        try:
            yield client, bucket
        finally:
            response = await client.list_objects_v2(Bucket=bucket)
            for entry in response.get("Contents", []):
                await client.delete_object(Bucket=bucket, Key=entry["Key"])
            await client.delete_bucket(Bucket=bucket)


async def test_actual_s3_two_pass_native_reads_and_borrowed_client_ownership(native_s3):
    client, bucket = native_s3
    plaintext = b"synthetic S3 source" * 8192
    await client.put_object(
        Bucket=bucket, Key="owned/source", Body=plaintext, ContentType="image/jpeg"
    )
    store = S3MediaStore(client, bucket, prefix="owned/")

    class Upload:
        name = "synthetic-egress"

        async def upload(self, session, body, **kwargs):
            assert session == "synthetic-session"
            ciphertext = b"".join([chunk async for chunk in body.open()])
            assert (
                ciphertext != plaintext
                and hashlib.sha256(ciphertext).digest() == body.info.file_enc_sha256
            )
            return UploadLocation("/media/synthetic", "https://mmg.whatsapp.net/media/synthetic")

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
    ) as messaging:
        result = await store.upload_to_whatsapp(
            messaging.whatsapp_media,
            "synthetic-session",
            "source",
            media_type="image",
            egress=Upload(),
        )
    assert result.file_sha256 == hashlib.sha256(plaintext).digest()
    assert result.file_length == len(plaintext)
    assert (await client.head_object(Bucket=bucket, Key="owned/source"))["ContentLength"] == len(
        plaintext
    )


async def test_actual_s3_etag_change_refuses_second_pass(native_s3):
    from botocore.exceptions import ClientError

    client, bucket = native_s3
    await client.put_object(Bucket=bucket, Key="source", Body=b"original", ContentType="image/jpeg")
    store = S3MediaStore(client, bucket)

    class ChangedUpload:
        name = "synthetic-changed-egress"

        async def upload(self, session, body, **kwargs):
            await client.put_object(Bucket=bucket, Key="source", Body=b"changed")
            async for _ in body.open():
                pytest.fail("stale ETag must fail before yielding ciphertext")
            pytest.fail("changed source must fail")

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
    ) as messaging:
        with pytest.raises(ClientError) as failure:
            await store.upload_to_whatsapp(
                messaging.whatsapp_media,
                "synthetic-session",
                "source",
                media_type="image",
                egress=ChangedUpload(),
            )
    assert failure.value.response["ResponseMetadata"]["HTTPStatusCode"] == 412


async def test_actual_s3_verified_archive_and_corruption_preserves_existing_object(native_s3):
    client, bucket = native_s3
    plaintext = b"verified customer-owned native archive" * 4096
    encrypted = await encrypt_whatsapp_media(plaintext, media_type="image", mimetype="image/jpeg")
    descriptor = MediaDescriptor(
        "image",
        encrypted.media_key,
        "https://mmg.whatsapp.net/synthetic",
        file_sha256=encrypted.file_sha256,
        file_enc_sha256=encrypted.file_enc_sha256,
        file_length=encrypted.file_length,
        mimetype="image/jpeg",
    )
    store = S3MediaStore(client, bucket)
    scratch = (
        Path.home()
        / ".polymorfa-agent-work/zk-program-20261014/python-native-s3-spools"
        / secrets.token_hex(8)
    )
    scratch.mkdir(parents=True)
    try:
        result = await store.archive(
            descriptor,
            "archive",
            scratch_directory=scratch,
            http_transport=httpx.MockTransport(
                lambda _: httpx.Response(200, content=encrypted.ciphertext)
            ),
        )
        assert result.bytes == len(plaintext)
        stored = await client.get_object(Bucket=bucket, Key="archive")
        try:
            assert await stored["Body"].read() == plaintext
        finally:
            stored["Body"].close()
        assert stored["Metadata"] == {
            "wa-media-kind": "image",
            "wa-file-sha256": encrypted.file_sha256.hex(),
        }
        assert list(scratch.iterdir()) == []
        with pytest.raises(MediaIntegrityError):
            await store.archive(
                replace(descriptor, file_enc_sha256=b"x" * 32),
                "archive",
                scratch_directory=scratch,
                http_transport=httpx.MockTransport(
                    lambda _: httpx.Response(200, content=encrypted.ciphertext)
                ),
            )
        assert (await client.head_object(Bucket=bucket, Key="archive"))["ETag"] == result.etag
        assert list(scratch.iterdir()) == []
    finally:
        scratch.rmdir()
