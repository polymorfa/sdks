use serde_json::Value;
use std::fmt::Write as _;
type WireRow = (u16, String, Vec<(String, String)>);
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    task::JoinHandle,
};
#[derive(Clone, Debug)]
pub struct Captured {
    pub method: String,
    pub path: String,
    pub headers: BTreeMap<String, String>,
    pub bytes: Vec<u8>,
}
impl Captured {
    pub fn body(&self) -> Value {
        if self.bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&self.bytes).unwrap()
        }
    }
}
pub struct Wire {
    pub base: String,
    pub requests: Arc<Mutex<Vec<Captured>>>,
    task: JoinHandle<()>,
}
impl Drop for Wire {
    fn drop(&mut self) {
        self.task.abort();
    }
}
impl Wire {
    pub async fn new(rows: Vec<(u16, Value)>) -> Self {
        Self::raw(
            rows.into_iter()
                .map(|(s, v)| (s, v.to_string(), vec![]))
                .collect(),
        )
        .await
    }
    pub async fn raw(rows: Vec<WireRow>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let save = requests.clone();
        let task = tokio::spawn(async move {
            for (status, body, headers) in rows {
                let (mut socket, _) =
                    tokio::time::timeout(Duration::from_secs(10), listener.accept())
                        .await
                        .unwrap()
                        .unwrap();
                let mut raw = Vec::new();
                let mut buf = [0; 8192];
                let end = loop {
                    let n = socket.read(&mut buf).await.unwrap();
                    assert!(n > 0);
                    raw.extend_from_slice(&buf[..n]);
                    if let Some(n) = raw.windows(4).position(|b| b == b"\r\n\r\n") {
                        break n + 4;
                    }
                };
                let head = String::from_utf8(raw[..end].to_vec()).unwrap();
                let mut lines = head.lines();
                let first = lines.next().unwrap().split_whitespace().collect::<Vec<_>>();
                let headers_in = lines
                    .filter_map(|l| l.split_once(':'))
                    .map(|(k, v)| (k.to_ascii_lowercase(), v.trim().to_owned()))
                    .collect::<BTreeMap<_, _>>();
                let length = headers_in
                    .get("content-length")
                    .and_then(|s| s.parse::<usize>().ok())
                    .unwrap_or(0);
                while raw.len() < end + length {
                    let n = socket.read(&mut buf).await.unwrap();
                    assert!(n > 0);
                    raw.extend_from_slice(&buf[..n]);
                }
                save.lock().unwrap().push(Captured {
                    method: first[0].into(),
                    path: first[1].into(),
                    headers: headers_in,
                    bytes: raw[end..end + length].to_vec(),
                });
                // An uncertain effect: consume the request, then close without a response.
                if status == 0 {
                    continue;
                }
                let mut extra = String::new();
                for (k, v) in headers {
                    write!(extra, "{k}: {v}\r\n").unwrap();
                }
                let reason = if status == 202 {
                    "Accepted"
                } else if status < 300 {
                    "OK"
                } else {
                    "Fixture"
                };
                socket.write_all(format!("HTTP/1.1 {status} {reason}\r\ncontent-type: application/json\r\nx-request-id: rust41\r\nx-trace-id: trace41\r\nset-cookie: private=secret\r\ncontent-length: {}\r\nconnection: close\r\n{extra}\r\n{body}",body.len()).as_bytes()).await.unwrap();
            }
        });
        Self {
            base,
            requests,
            task,
        }
    }
    pub fn captured(&self) -> Vec<Captured> {
        self.requests.lock().unwrap().clone()
    }
    pub fn check(&self, index: usize, method: &str, path: &str, body: Value, version: &str) {
        let rows = self.captured();
        let r = &rows[index];
        assert_eq!(r.method, method);
        assert_eq!(r.path, path);
        assert_eq!(r.body(), body);
        assert_eq!(r.headers["polymorfa-version"], version);
        assert!(r.headers.contains_key("authorization"));
    }
}
