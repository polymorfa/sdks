use base64::{engine::general_purpose::STANDARD, Engine as _};
use polymorfa_sdk::history_chunks::*;
use serde_json::Value;
fn corpus() -> Value {
    serde_json::from_str(include_str!("fixtures/strict-history.json")).unwrap()
}
fn input(corpus: &Value, name: &str) -> Vec<u8> {
    STANDARD
        .decode(corpus["streams"][name]["input"].as_str().unwrap())
        .unwrap()
}
#[tokio::test]
async fn one_stream_controls_refuse_unused_bytes_on_both_public_paths() {
    let corpus = corpus();
    for format in ["gzip", "zlib", "raw"] {
        let single = input(&corpus, &format!("provider-{format}"));
        assert_eq!(decode_history_payload(&single, 1024).unwrap().sync_type, 3);
        assert_eq!(
            download_history_chunk(
                HistoryChunkInput::Inline(single.clone()),
                HistoryChunkOptions::default()
            )
            .await
            .unwrap()
            .sync_type,
            3
        );
        for tail in [vec![0], input(&corpus, &format!("empty-{format}"))] {
            let joined = [single.clone(), tail].concat();
            for error in [
                decode_history_payload(&joined, 1024).err(),
                download_history_chunk(
                    HistoryChunkInput::Inline(joined),
                    HistoryChunkOptions::default(),
                )
                .await
                .err(),
            ] {
                assert_eq!(
                    error.map(|e| e.code.clone()),
                    Some(Some("media_invalid_ciphertext".into())),
                    "{format}: unused compressed bytes accepted"
                );
            }
        }
    }
}
fn plaintext(corpus: &Value, name: &str) -> Vec<u8> {
    let value = &corpus["plain"][name];
    if let Some(encoded) = value["base64"].as_str() {
        return STANDARD.decode(encoded).unwrap();
    }
    let size = value["zeroFieldBytes"].as_u64().unwrap() as usize;
    let mut result = vec![8, 3, 162, 6];
    let mut n = size;
    while n > 127 {
        result.push((n as u8 & 127) | 128);
        n >>= 7;
    }
    result.push(n as u8);
    result.resize(result.len() + size, 0);
    result
}
fn malformed(corpus: &Value, recipe: &Value) -> Vec<u8> {
    if let Some(encoded) = recipe["hex"].as_str() {
        return hex::decode(encoded).unwrap();
    }
    let mut bytes = input(corpus, recipe["base"].as_str().unwrap());
    if let Some(cut) = recipe["cut"].as_u64() {
        bytes.truncate(cut as usize);
    }
    if let Some(flip) = recipe["flip"].as_i64() {
        let offset = if flip < 0 {
            bytes.len() - (-flip) as usize
        } else {
            flip as usize
        };
        bytes[offset] ^= recipe["mask"].as_u64().unwrap_or(1) as u8;
    }
    if let Some(name) = recipe["append"].as_str() {
        bytes.extend(input(corpus, name));
    }
    if let Some(encoded) = recipe["tailHex"].as_str() {
        bytes.extend(hex::decode(encoded).unwrap());
    }
    bytes
}
fn code(result: polymorfa_sdk::Result<HistoryChunk>) -> Option<String> {
    result.err().and_then(|error| error.code.clone())
}
#[tokio::test]
async fn independent_complete_streams_and_malformed_recipes_on_public_methods() {
    let corpus = corpus();
    let mut complete = 0;
    let mut refused = 0;
    let mut protobuf_only = 0;
    for (name, stream) in corpus["streams"].as_object().unwrap() {
        let bytes = input(&corpus, name);
        let plain = stream["plain"].as_str().unwrap();
        for decoded in [
            decode_history_payload(&bytes, DEFAULT_MAX_INFLATED_BYTES),
            download_history_chunk(
                HistoryChunkInput::Inline(bytes.clone()),
                HistoryChunkOptions::default(),
            )
            .await,
        ] {
            if plain == "invalid-protobuf" {
                assert_eq!(
                    code(decoded).as_deref(),
                    Some("media_invalid_ciphertext"),
                    "{name}: protobuf policy only"
                );
                protobuf_only += 1;
            } else {
                let decoded = decoded.unwrap_or_else(|error| panic!("{name}: {error}"));
                assert_eq!(decoded.proto.encoded, plaintext(&corpus, plain), "{name}");
                if plain == "provider" {
                    assert_eq!(
                        decoded.conversations[0].last_message_timestamp,
                        Some(u64::MAX)
                    );
                    assert_eq!(decoded.chunk_order, Some(7));
                    assert_eq!(decoded.progress, Some(92));
                    assert_eq!(
                        decoded.proto.bytes(100),
                        Some(b"unknown provider data".as_slice())
                    );
                }
                complete += 1;
            }
        }
    }
    for recipe in corpus["invalid"].as_array().unwrap() {
        // An invalid protobuf base cannot prove compression refusal through this API.
        if recipe["base"]
            .as_str()
            .is_some_and(|name| corpus["streams"][name]["plain"] == "invalid-protobuf")
        {
            protobuf_only += 2;
            for result in [
                decode_history_payload(&malformed(&corpus, recipe), DEFAULT_MAX_INFLATED_BYTES),
                download_history_chunk(
                    HistoryChunkInput::Inline(malformed(&corpus, recipe)),
                    HistoryChunkOptions::default(),
                )
                .await,
            ] {
                assert_eq!(code(result).as_deref(), Some("media_invalid_ciphertext"));
            }
            continue;
        }
        let bytes = malformed(&corpus, recipe);
        for result in [
            decode_history_payload(&bytes, DEFAULT_MAX_INFLATED_BYTES),
            download_history_chunk(
                HistoryChunkInput::Inline(bytes),
                HistoryChunkOptions::default(),
            )
            .await,
        ] {
            assert_eq!(
                code(result).as_deref(),
                Some("media_invalid_ciphertext"),
                "{}",
                recipe["name"]
            );
            refused += 1;
        }
    }
    assert_eq!(complete, 70);
    assert_eq!(refused, 5888);
    assert_eq!(protobuf_only, 102);
    println!("public corpus: {complete} complete-stream checks, {refused} compressed refusals, {protobuf_only} protobuf-only checks (not compression proof)");
}
#[tokio::test]
async fn quotas_validation_order_empty_output_and_bad_trailer_precedence() {
    let corpus = corpus();
    assert_eq!(
        code(decode_history_payload(&[], 0)).as_deref(),
        Some("media_invalid_ciphertext")
    );
    for maximum in [0, usize::MAX] {
        assert_eq!(
            code(decode_history_payload(
                &input(&corpus, "provider-gzip"),
                maximum
            ))
            .as_deref(),
            Some("invalid_configuration")
        );
    }
    for format in ["gzip", "zlib", "raw"] {
        assert!(
            decode_history_payload(&input(&corpus, &format!("empty-{format}")), 1)
                .unwrap()
                .proto
                .encoded
                .is_empty()
        );
        for plain in ["provider", "repeat", "large"] {
            let bytes = input(&corpus, &format!("{plain}-{format}"));
            let size = plaintext(&corpus, plain).len();
            assert_eq!(
                decode_history_payload(&bytes, size)
                    .unwrap()
                    .proto
                    .encoded
                    .len(),
                size
            );
            assert_eq!(
                code(decode_history_payload(&bytes, size - 1)).as_deref(),
                Some("media_too_large")
            );
            let mut options = HistoryChunkOptions::default();
            options.media.max_bytes = bytes.len();
            assert!(download_history_chunk(
                HistoryChunkInput::Inline(bytes.clone()),
                options.clone()
            )
            .await
            .is_ok());
            options.media.max_bytes -= 1;
            assert_eq!(
                code(
                    download_history_chunk(HistoryChunkInput::Inline(bytes.clone()), options).await
                )
                .as_deref(),
                Some("media_too_large")
            );
            if format != "raw" {
                let mut corrupt = bytes;
                let trailer = corrupt.len() - if format == "gzip" { 8 } else { 1 };
                corrupt[trailer] ^= 1;
                for maximum in [1, size - 1] {
                    assert_eq!(
                        code(decode_history_payload(&corrupt, maximum)).as_deref(),
                        Some("media_too_large"),
                        "{plain}-{format} max {maximum}"
                    );
                }
                assert_eq!(
                    code(decode_history_payload(&corrupt, size)).as_deref(),
                    Some("media_invalid_ciphertext")
                );
            }
        }
    }
    let mut options = HistoryChunkOptions::default();
    options.media.cancellation.cancel();
    options.media.max_bytes = 0;
    options.max_inflated_bytes = 0;
    assert_eq!(
        code(download_history_chunk(HistoryChunkInput::Inline(vec![]), options).await).as_deref(),
        Some("request_cancelled")
    );
    let mut options = HistoryChunkOptions::default();
    options.media.max_bytes = 1;
    options.max_inflated_bytes = 0;
    assert_eq!(
        code(download_history_chunk(HistoryChunkInput::Inline(vec![0; 2]), options).await)
            .as_deref(),
        Some("media_too_large")
    );
}
#[tokio::test]
async fn inline_cancellation_is_observed_during_local_inflation_on_a_single_thread() {
    let corpus = corpus();
    for format in ["gzip", "zlib", "raw"] {
        let options = HistoryChunkOptions::default();
        let cancellation = options.media.cancellation.clone();
        let abort = async move {
            tokio::task::yield_now().await;
            cancellation.cancel();
        };
        let decode = download_history_chunk(
            HistoryChunkInput::Inline(input(&corpus, &format!("large-{format}"))),
            options,
        );
        let (result, ()) = tokio::join!(decode, abort);
        assert_eq!(code(result).as_deref(), Some("request_cancelled"));
    }
}
#[tokio::test]
async fn gzip_header_boundaries_preserve_existing_supported_and_unsupported_inputs() {
    use sha2::{Digest, Sha256};
    let records: Vec<Value> =
        serde_json::from_str(include_str!("fixtures/strict-history-headers.json")).unwrap();
    let mut supported = 0;
    let mut valid_unsupported = 0;
    let mut incomplete = 0;
    for record in records {
        let mut bytes = vec![];
        for segment in record["segments"].as_array().unwrap() {
            if let Some(encoded) = segment["base64"].as_str() {
                bytes.extend(STANDARD.decode(encoded).unwrap());
            } else {
                bytes.resize(
                    bytes.len() + segment["count"].as_u64().unwrap() as usize,
                    segment["byte"].as_u64().unwrap() as u8,
                );
            }
        }
        assert_eq!(
            hex::encode(Sha256::digest(&bytes)),
            record["sha256"].as_str().unwrap()
        );
        if record["supported"] == true {
            // Sample long header prefixes; ordinary short headers are exhaustive
            // in strict-history.json. Every cut here is before complete EOF.
            let mut cuts = vec![
                0,
                1,
                2,
                3,
                9,
                10,
                11,
                bytes.len() / 2,
                bytes.len() - 9,
                bytes.len() - 5,
                bytes.len() - 1,
            ];
            cuts.sort_unstable();
            cuts.dedup();
            for cut in cuts {
                assert_eq!(
                    code(decode_history_payload(&bytes[..cut], 1024)).as_deref(),
                    Some("media_invalid_ciphertext")
                );
                assert_eq!(
                    code(
                        download_history_chunk(
                            HistoryChunkInput::Inline(bytes[..cut].to_vec()),
                            HistoryChunkOptions::default()
                        )
                        .await
                    )
                    .as_deref(),
                    Some("media_invalid_ciphertext")
                );
            }
            for tail in [vec![0], bytes.clone()] {
                let joined = [bytes.clone(), tail].concat();
                assert_eq!(
                    code(decode_history_payload(&joined, 1024)).as_deref(),
                    Some("media_invalid_ciphertext")
                );
                assert_eq!(
                    code(
                        download_history_chunk(
                            HistoryChunkInput::Inline(joined),
                            HistoryChunkOptions::default()
                        )
                        .await
                    )
                    .as_deref(),
                    Some("media_invalid_ciphertext")
                );
            }
        }
        for decoded in [
            decode_history_payload(&bytes, 1024),
            download_history_chunk(
                HistoryChunkInput::Inline(bytes.clone()),
                HistoryChunkOptions::default(),
            )
            .await,
        ] {
            if record["supported"] == true {
                assert_eq!(
                    decoded.unwrap().proto.encoded,
                    STANDARD.decode(record["plain"].as_str().unwrap()).unwrap(),
                    "{}",
                    record["name"]
                );
                supported += 1;
            } else {
                // The existing safe error also covers valid-but-unsupported headers.
                assert_eq!(
                    code(decoded).as_deref(),
                    Some("media_invalid_ciphertext"),
                    "{}",
                    record["name"]
                );
                if record["compression"] == "valid" {
                    valid_unsupported += 1;
                } else {
                    incomplete += 1;
                }
            }
        }
    }
    assert_eq!((supported, valid_unsupported, incomplete), (12, 18, 2));
    // Unused bits in the final byte are allowed; only unused whole bytes fail.
    assert!(decode_history_payload(&[3, 128], 1)
        .unwrap()
        .proto
        .encoded
        .is_empty());
    println!("headers: {supported} supported checks; {valid_unsupported} valid-but-unsupported safe refusals; {incomplete} incomplete refusals");
}
