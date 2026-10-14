//! Raw requests with caller-defined pagination. These helpers do not extend typed endpoint coverage.
use crate::{
    models::{query_pairs, Query},
    transport::HttpTransport,
    ApiResponse, RequestOptions, ResponseMetadata, Result,
};
use reqwest::Method;
use serde_json::Value;
use std::sync::Arc;

#[derive(Clone)]
pub struct RawRequest {
    pub method: Method,
    pub path: String,
    pub query: Query,
    pub body: Option<Value>,
    pub options: RequestOptions,
}
impl RawRequest {
    pub fn get(path: impl Into<String>) -> Self {
        Self {
            method: Method::GET,
            path: path.into(),
            query: Query::default(),
            body: None,
            options: RequestOptions::default(),
        }
    }
}
pub struct DecodedRawPage<T> {
    pub items: Vec<T>,
    pub next_cursor: Option<String>,
}
type Decoder<T> = Arc<dyn Fn(&Value, &ResponseMetadata) -> Result<DecodedRawPage<T>> + Send + Sync>;
pub struct RawCursorPage<T> {
    pub items: Vec<T>,
    pub next_cursor: Option<String>,
    pub response: ApiResponse<Value>,
    http: HttpTransport,
    request: RawRequest,
    decode: Decoder<T>,
    cursor_parameter: String,
}
impl<T> RawCursorPage<T> {
    pub(crate) async fn load<F>(
        http: HttpTransport,
        request: RawRequest,
        decode: F,
        cursor_parameter: Option<&str>,
    ) -> Result<Self>
    where
        F: Fn(&Value, &ResponseMetadata) -> Result<DecodedRawPage<T>> + Send + Sync + 'static,
    {
        let cursor_parameter = cursor_parameter.unwrap_or("cursor");
        if cursor_parameter.is_empty() {
            return Err(crate::transport::configuration(
                "A cursor parameter is required",
            ));
        }
        Self::read(http, request, Arc::new(decode), cursor_parameter.into()).await
    }
    async fn read(
        http: HttpTransport,
        request: RawRequest,
        decode: Decoder<T>,
        cursor_parameter: String,
    ) -> Result<Self> {
        let query = query_pairs(&request.query)?;
        let response: ApiResponse<Value> = http
            .request(
                request.method.clone(),
                &request.path,
                &query,
                request.body.as_ref(),
                request.options.clone(),
            )
            .await?;
        let decoded = decode(&response.data, &response.metadata)?;
        Ok(Self {
            items: decoded.items,
            next_cursor: decoded.next_cursor,
            response,
            http,
            request,
            decode,
            cursor_parameter,
        })
    }
    pub fn has_more(&self) -> bool {
        self.next_cursor.is_some()
    }
    pub async fn next_page(&self) -> Result<Option<Self>> {
        let Some(cursor) = &self.next_cursor else {
            return Ok(None);
        };
        let mut request = self.request.clone();
        request
            .query
            .insert(self.cursor_parameter.clone(), cursor.clone().into());
        Self::read(
            self.http.clone(),
            request,
            self.decode.clone(),
            self.cursor_parameter.clone(),
        )
        .await
        .map(Some)
    }
    pub fn into_stream(self) -> impl futures_util::Stream<Item = Result<T>> {
        async_stream::try_stream! {
            let mut current = self;
            loop {
                for item in std::mem::take(&mut current.items) { yield item; }
                match current.next_page().await? { Some(next) => current = next, None => break }
            }
        }
    }
}
