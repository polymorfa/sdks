use crate::{
    models::{query_pairs, CursorEnvelope, Query},
    transport::HttpTransport,
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::de::DeserializeOwned;

pub struct CursorPage<T> {
    pub items: Vec<T>,
    pub next_cursor: Option<String>,
    pub metadata: crate::ResponseMetadata,
    http: HttpTransport,
    path: String,
    query: Query,
    options: RequestOptions,
}
impl<T: DeserializeOwned> CursorPage<T> {
    pub(crate) async fn load(
        http: HttpTransport,
        path: String,
        query: Query,
        options: RequestOptions,
    ) -> Result<Self> {
        let pairs = query_pairs(&query)?;
        let response: ApiResponse<CursorEnvelope<T>> = http
            .request::<_, ()>(Method::GET, &path, &pairs, None, options.clone())
            .await?;
        let next_cursor = response.data.page.and_then(|p| p.next_cursor).or_else(|| {
            response
                .metadata
                .headers
                .get("polymorfa-next-cursor")
                .cloned()
        });
        Ok(Self {
            items: response.data.data,
            next_cursor,
            metadata: response.metadata,
            http,
            path,
            query,
            options,
        })
    }
    pub fn has_more(&self) -> bool {
        self.next_cursor.is_some()
    }
    pub async fn next_page(&self) -> Result<Option<Self>> {
        match &self.next_cursor {
            None => Ok(None),
            Some(cursor) => {
                let mut query = self.query.clone();
                query.insert("cursor".into(), cursor.clone().into());
                Ok(Some(
                    Self::load(
                        self.http.clone(),
                        self.path.clone(),
                        query,
                        self.options.clone(),
                    )
                    .await?,
                ))
            }
        }
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
