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
    pub next_offset: Option<String>,
    pub high_watermark: Option<String>,
    indexed: bool,
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
        let indexed = query.contains_key("afterOffset");
        let (next_offset, high_watermark) = if indexed {
            let after = query
                .get("afterOffset")
                .and_then(|value| match value {
                    crate::models::QueryValue::One(crate::models::QueryPrimitive::String(s)) => {
                        s.parse::<u64>().ok()
                    }
                    _ => None,
                })
                .unwrap_or(0);
            let invalid = || {
                crate::Error::local(
                    crate::ErrorKind::Server,
                    "Invalid indexed event page metadata.",
                    "invalid_response",
                )
                .with_metadata(response.metadata.clone())
            };
            let page = response.data.page.as_ref().ok_or_else(invalid)?;
            let high = page
                .high_watermark
                .as_ref()
                .filter(|value| crate::models::valid_offset(value))
                .ok_or_else(invalid)?;
            if page.has_more {
                let next = page
                    .next_offset
                    .as_ref()
                    .filter(|value| crate::models::valid_offset(value))
                    .ok_or_else(invalid)?;
                let next_value = next.parse::<u64>().map_err(|_| invalid())?;
                if next_value <= after || next_value > high.parse::<u64>().map_err(|_| invalid())? {
                    return Err(invalid());
                }
            } else if page.next_offset.is_some() {
                return Err(invalid());
            }
            (page.next_offset.clone(), Some(high.clone()))
        } else {
            (None, None)
        };
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
            next_offset,
            high_watermark,
            indexed,
            metadata: response.metadata,
            http,
            path,
            query,
            options,
        })
    }
    pub fn has_more(&self) -> bool {
        if self.indexed {
            self.next_offset.is_some()
        } else {
            self.next_cursor.is_some()
        }
    }
    pub async fn next_page(&self) -> Result<Option<Self>> {
        match if self.indexed {
            &self.next_offset
        } else {
            &self.next_cursor
        } {
            None => Ok(None),
            Some(cursor) => {
                let mut query = self.query.clone();
                query.insert(
                    if self.indexed {
                        "afterOffset"
                    } else {
                        "cursor"
                    }
                    .into(),
                    cursor.clone().into(),
                );
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
