#[allow(dead_code)]
mod support;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use polymorfa_sdk::Credential;
#[test]
fn opaque_golden_and_rejections() {
    let fixture: serde_json::Value = serde_json::from_slice(
        &std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../contracts/machine-credentials.v1.json"
        ))
        .unwrap(),
    )
    .unwrap();
    for v in fixture["opaque"].as_array().unwrap() {
        let token = v["token"].as_str().unwrap();
        if v["kind"] == "key" {
            assert!(Credential::organization_api_key(token).is_ok());
        } else {
            assert!(Credential::project_token(token).is_ok());
        }
        for bad in [
            token.replacen("_A", "_B", 1),
            format!("{token}="),
            format!("{token}\n"),
            format!("{token}!"),
        ] {
            if v["kind"] == "key" {
                assert!(Credential::organization_api_key(bad).is_err());
            } else {
                assert!(Credential::project_token(bad).is_err());
            }
        }
    }
    for v in fixture["client"]["cases"]
        .as_array()
        .unwrap()
        .iter()
        .chain(fixture["client"]["rejections"].as_array().unwrap())
    {
        assert!(Credential::client_token(v["token"].as_str().unwrap()).is_ok());
    }
    for size in [400, 13000] {
        let mut raw = vec![0u8; size];
        let mut crc = 0xffffffffu32;
        for byte in &raw {
            crc ^= u32::from(*byte);
            for _ in 0..8 {
                crc = (crc >> 1) ^ if crc & 1 != 0 { 0xedb88320 } else { 0 };
            }
        }
        raw.extend_from_slice(&(crc ^ 0xffffffff).to_be_bytes());
        let body = URL_SAFE_NO_PAD.encode(&raw);
        assert!(body.len() > 512);
        assert!(Credential::organization_api_key(format!("pmfa_{body}")).is_ok());
        assert!(Credential::project_token(format!("pmfa_pt_{body}")).is_ok());
        assert!(Credential::client_token(format!(
            "pmfa_ct_{}",
            URL_SAFE_NO_PAD.encode(&raw[..size])
        ))
        .is_ok());
    }
    let token = fixture["client"]["cases"][0]["token"].as_str().unwrap();
    let mut raw = URL_SAFE_NO_PAD.decode(&token[8..]).unwrap();
    let n = raw.len();
    raw[n - 1] ^= 1;
    assert!(Credential::client_token(format!("pmfa_ct_{}", URL_SAFE_NO_PAD.encode(raw))).is_ok());
}

#[tokio::test]
async fn native_wire_reflection() {
    use polymorfa_sdk::{ClientOptions, MessagingClient, RequestOptions};
    use serde_json::json;
    let fixture: serde_json::Value = serde_json::from_slice(
        &std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../contracts/machine-credentials.v1.json"
        ))
        .unwrap(),
    )
    .unwrap();
    let mut credentials = Vec::new();
    for v in fixture["opaque"].as_array().unwrap() {
        let token = v["token"].as_str().unwrap();
        credentials.push((
            if v["kind"] == "key" {
                Credential::organization_api_key(token).unwrap()
            } else {
                Credential::project_token(token).unwrap()
            },
            token.to_string(),
        ));
    }
    for v in fixture["client"]["cases"].as_array().unwrap() {
        let token = v["token"].as_str().unwrap();
        credentials.push((Credential::client_token(token).unwrap(), token.to_string()));
    }
    let long = format!("pmfa_ct_{}", URL_SAFE_NO_PAD.encode(vec![0u8; 600]));
    credentials.push((Credential::client_token(&long).unwrap(), long));
    for (credential, token) in credentials {
        let (base,server)=support::wire_authorization_status("GET","/messaging/s/profile",None,json!({"error":{"code":"unauthorized","message":token,"details":{"apiKey":"synthetic","projectToken":token}}}),Some(token.clone()),401).await;
        let sdk = MessagingClient::new(
            credential,
            ClientOptions {
                base_url: base,
                max_network_retries: 0,
                ..ClientOptions::default()
            },
        )
        .unwrap();
        let error = sdk
            .profile()
            .get("s", RequestOptions::default())
            .await
            .unwrap_err();
        server.await.unwrap();
        assert!(!error.to_string().contains(&token));
        assert!(!format!("{error:?}").contains(&token));
    }
}
