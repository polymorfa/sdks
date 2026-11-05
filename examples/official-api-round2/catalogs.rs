use polymorfa_sdk::{
    official_round2::CatalogProductsParameters, MessagingClient, RequestOptions, Result,
};

pub async fn next_catalog_cursor(client: &MessagingClient) -> Result<Option<String>> {
    let page = client
        .catalogs()
        .list_products(
            "number-id",
            "123",
            &CatalogProductsParameters {
                limit: Some(100),
                cursor: Some("opaque_-".into()),
            },
            RequestOptions::default(),
        )
        .await?;
    Ok(page.data.data.next_cursor)
}
