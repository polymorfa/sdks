namespace Polymorfa.Sdk;

internal static class InteractiveMessages
{
    private static void Source(string? url, string? base64)
    {
        if ((url is null) == (base64 is null)) throw new PolymorfaConfigurationException("Interactive media requires exactly one URL or base64 source.");
    }
    internal static void Validate(MessageContent content)
    {
        if (content is ButtonsContent { Buttons.Media: { } media } buttons)
        {
            Source(media.Url, media.Base64);
            if (buttons.Buttons.Title is not null || media.Type is not ("image" or "video" or "document")) throw new PolymorfaConfigurationException("Invalid button media header.");
            if (media.Filename is not null && media.Type != "document" || media.Thumbnail is not null && media.Type != "video") throw new PolymorfaConfigurationException("Invalid button media fields.");
        }
        if (content is CarouselContent carousel)
        {
            if (carousel.Carousel.Cards.Count is < 2 or > 10) throw new PolymorfaConfigurationException("A carousel requires 2–10 cards.");
            foreach (var card in carousel.Carousel.Cards)
            {
                if ((card.Image is null) == (card.Video is null)) throw new PolymorfaConfigurationException("A card requires exactly one image or video.");
                if (card.Image is { } image) Source(image.Url, image.Base64);
                if (card.Video is { } video) Source(video.Url, video.Base64);
            }
        }
    }
}
