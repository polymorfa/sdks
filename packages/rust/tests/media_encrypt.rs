use futures_util::StreamExt as _;
use polymorfa_sdk::{media_encrypt::*, ErrorKind};
use serde_json::Value;
#[tokio::test]
async fn encryption_matches_independent_node_vectors_for_every_media_kind() {
    let fixtures: Value =
        serde_json::from_str(include_str!("fixtures/whatsapp-media.json")).unwrap();
    for fixture in fixtures["fixtures"].as_array().unwrap() {
        let kind = match fixture["kind"].as_str().unwrap() {
            "image" => UploadMediaType::Image,
            "video" => UploadMediaType::Video,
            "audio" => UploadMediaType::Audio,
            "document" => UploadMediaType::Document,
            "sticker" => UploadMediaType::Sticker,
            _ => unreachable!(),
        };
        let bytes = |field: &str| hex::decode(fixture[field].as_str().unwrap()).unwrap();
        let mut options = MediaEncryptionOptions::new(kind);
        options.media_key = Some(bytes("mediaKey").try_into().unwrap());
        let result = encrypt_media(&bytes("plaintext"), options.clone())
            .await
            .unwrap();
        assert_eq!(result.ciphertext, bytes("encrypted"));
        assert_eq!(result.info.file_sha256.to_vec(), bytes("fileSha256"));
        assert_eq!(result.info.file_enc_sha256.to_vec(), bytes("fileEncSha256"));
        let input = bytes("plaintext");
        let source = Box::pin(futures_util::stream::iter(
            input
                .chunks(3)
                .map(|c| Ok(bytes::Bytes::copy_from_slice(c)))
                .collect::<Vec<_>>(),
        ));
        let mut stream = encrypt_media_stream(source, options).unwrap();
        let mut output = Vec::new();
        while let Some(chunk) = stream.body.next().await {
            output.extend_from_slice(&chunk.unwrap());
        }
        assert_eq!(output, result.ciphertext);
        assert_eq!(
            stream.info.await.unwrap().unwrap().file_length,
            input.len() as u64
        );
    }
}
#[tokio::test]
async fn streamed_encryption_emits_before_eof_and_propagates_limits_and_cancellation() {
    let (tx, rx) = tokio::sync::mpsc::channel(1);
    let source = Box::pin(
        async_stream::stream! {let mut rx=rx;while let Some(part)=rx.recv().await{yield part;}},
    );
    let mut result =
        encrypt_media_stream(source, MediaEncryptionOptions::new(UploadMediaType::Ptt)).unwrap();
    tx.send(Ok(bytes::Bytes::from(vec![7; 65536])))
        .await
        .unwrap();
    assert!(result.body.next().await.unwrap().unwrap().len() >= 65536);
    assert!(!tx.is_closed());
    drop(tx);
    while let Some(chunk) = result.body.next().await {
        chunk.unwrap();
    }
    assert_eq!(result.info.await.unwrap().unwrap().file_length, 65536);
    let mut options = MediaEncryptionOptions::new(UploadMediaType::Image);
    options.max_bytes = 1;
    let failure = encrypt_media(&[1, 2], options).await.err().unwrap();
    assert_eq!(failure.kind, ErrorKind::MediaIntegrity);
    let options = MediaEncryptionOptions::new(UploadMediaType::Image);
    options.cancellation.cancel();
    let failure = encrypt_media(&[1], options).await.err().unwrap();
    assert_eq!(failure.kind, ErrorKind::Cancelled);
    let options = MediaEncryptionOptions::new(UploadMediaType::Image);
    let cancellation = options.cancellation.clone();
    let mut pending =
        encrypt_media_stream(Box::pin(futures_util::stream::pending()), options).unwrap();
    cancellation.cancel();
    assert_eq!(
        pending.body.next().await.unwrap().unwrap_err().kind,
        ErrorKind::Cancelled
    );
    let first = generate_media_key();
    assert_ne!(first, generate_media_key());
    assert_eq!(encrypted_length(16).unwrap(), 42);
    assert!(encrypted_length(u64::MAX).is_err());
}
