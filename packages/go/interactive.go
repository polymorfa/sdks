package polymorfa

// InteractiveMediaSource carries exactly one URL or base64 source. Bounds and
// transport availability remain authoritative at the API.
type InteractiveMediaSource struct {
	URL      *string `json:"url,omitempty"`
	Base64   *string `json:"base64,omitempty"`
	MimeType *string `json:"mimeType,omitempty"`
}
type ButtonsMedia struct {
	InteractiveMediaSource
	Type      string  `json:"type"`
	Filename  *string `json:"filename,omitempty"`
	Thumbnail *string `json:"thumbnail,omitempty"`
}
type CarouselVideo struct {
	InteractiveMediaSource
	Thumbnail *string `json:"thumbnail,omitempty"`
}

// A card has no footer. Set the footer on CarouselContent instead.
type CarouselCard struct {
	Body    string                  `json:"body"`
	Buttons []MessageButton         `json:"buttons"`
	Image   *InteractiveMediaSource `json:"image,omitempty"`
	Video   *CarouselVideo          `json:"video,omitempty"`
}
type CarouselContent struct {
	Body   string         `json:"body"`
	Footer *string        `json:"footer,omitempty"`
	Cards  []CarouselCard `json:"cards"`
}

func validateInteractiveSource(v InteractiveMediaSource) error {
	if (v.URL == nil) == (v.Base64 == nil) {
		return validation("Interactive media requires exactly one URL or base64 source.")
	}
	return nil
}
func validateInteractiveContent(v MessageContent) error {
	if b := v.Buttons; b != nil {
		if b.Media != nil {
			m := b.Media
			if b.Title != "" {
				return validation("A button media header cannot have a title.")
			}
			if err := validateInteractiveSource(m.InteractiveMediaSource); err != nil {
				return err
			}
			if m.Type != "image" && m.Type != "video" && m.Type != "document" {
				return validation("Invalid button media kind.")
			}
			if m.Filename != nil && m.Type != "document" || m.Thumbnail != nil && m.Type != "video" {
				return validation("Invalid button media fields.")
			}
		}
	}
	if c := v.Carousel; c != nil {
		if len(c.Cards) < 2 || len(c.Cards) > 10 {
			return validation("A carousel requires 2–10 cards.")
		}
		for _, card := range c.Cards {
			if (card.Image == nil) == (card.Video == nil) {
				return validation("A carousel card requires exactly one image or video.")
			}
			if card.Image != nil {
				if err := validateInteractiveSource(*card.Image); err != nil {
					return err
				}
			}
			if card.Video != nil {
				if err := validateInteractiveSource(card.Video.InteractiveMediaSource); err != nil {
					return err
				}
			}
		}
	}
	return nil
}
