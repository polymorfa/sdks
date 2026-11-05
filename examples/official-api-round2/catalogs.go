package officialround2

import (
	"context"
	polymorfa "github.com/polymorfa/sdks/packages/go"
)

// NextCatalogCursor uses an existing authenticated server client.
func NextCatalogCursor(ctx context.Context, client *polymorfa.MessagingClient) (string, error) {
	limit := 100
	page, err := client.Catalogs().ListProducts(ctx, "number-id", "123", polymorfa.CatalogProductsParams{Limit: &limit, Cursor: "opaque_-"})
	if err != nil {
		return "", err
	}
	return page.Data.Data.NextCursor, nil
}
