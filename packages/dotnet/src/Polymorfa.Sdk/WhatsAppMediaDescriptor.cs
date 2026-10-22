namespace Polymorfa.Sdk;

public sealed record MediaDimensions(uint Width, uint Height);
public sealed record WhatsAppMediaSendMetadata
{
    public string? Mimetype { get; init; }
    public byte[]? Thumbnail { get; init; }
    public MediaDimensions? Dimensions { get; init; }
    public uint? Seconds { get; init; }
    public byte[]? Waveform { get; init; }
    public ulong? MediaKeyTimestamp { get; init; }
    public bool? IsAnimated { get; init; }
    public override string ToString() => "WhatsAppMediaSendMetadata(redacted)";
}
/// <summary>A standard send includes this key in the API body. Use ToSignalDescriptor for a zero-knowledge local send.</summary>
public sealed record WhatsAppMediaSendDescriptor(string DirectPath, byte[] MediaKey, byte[] FileSha256, byte[] FileEncSha256, long FileLength, string MimeType, string Url)
{
    public string? Caption { get; init; }
    public string? Filename { get; init; }
    public bool? Ptt { get; init; }
    public byte[]? Thumbnail { get; init; }
    public uint? Width { get; init; }
    public uint? Height { get; init; }
    public uint? Seconds { get; init; }
    public byte[]? Waveform { get; init; }
    public ulong? MediaKeyTimestamp { get; init; }
    public bool? IsAnimated { get; init; }
    public override string ToString() => "WhatsAppMediaSendDescriptor(redacted)";
    public void Validate(WhatsAppUploadMediaType kind)
    {
        static PolymorfaConfigurationException Invalid(string name) => new($"Invalid media descriptor {name}.");
        if (DirectPath is null || Url is null || MediaKey is null || FileSha256 is null || FileEncSha256 is null) throw Invalid("required fields");
        if (string.IsNullOrEmpty(MimeType) || MimeType.Length > 255 || MimeType.Any(c => c < 32 || c > 126)) throw Invalid("mimetype");
        if (DirectPath.Length > 2048 || !DirectPath.StartsWith('/') || DirectPath.StartsWith("//", StringComparison.Ordinal) || DirectPath.Any(c => c < 33 || c > 126)) throw Invalid("directPath");
        if (Url.Length > 2048 || !Url.StartsWith("https://", StringComparison.Ordinal) || Url.Any(c => c < 33 || c > 126)) throw Invalid("url");
        if (FileLength is < 1 or > 2147483648 || MediaKey.Length != 32 || FileSha256.Length != 32 || FileEncSha256.Length != 32) throw Invalid("length, hashes or key");
        if (Width.HasValue != Height.HasValue || Width is 0 or > 65536 || Height is 0 or > 65536) throw Invalid("dimensions");
        if (Seconds > 86400 || MediaKeyTimestamp is 0 or > 1099511627776) throw Invalid("timing");
        if (Filename is not null && kind != WhatsAppUploadMediaType.Document || Ptt.HasValue && kind is not (WhatsAppUploadMediaType.Audio or WhatsAppUploadMediaType.Ptt)) throw Invalid("filename or ptt");
        if (Thumbnail?.Length > 16384) throw Invalid("thumbnail");
        if (Waveform is not null && (Waveform.Length is < 64 or > 192 || kind is not (WhatsAppUploadMediaType.Audio or WhatsAppUploadMediaType.Ptt))) throw Invalid("waveform");
        if (kind == WhatsAppUploadMediaType.Sticker) { if (MimeType != "image/webp" || Caption is not null || Thumbnail is not null || Seconds is not null || Waveform is not null) throw Invalid("sticker"); }
        else if (IsAnimated.HasValue) throw Invalid("isAnimated");
    }
    public SignalMediaDescriptor ToSignalDescriptor(WhatsAppUploadMediaType kind, string? caption = null, string? fileName = null)
    {
        Validate(kind); if (Thumbnail is not null || Waveform is not null || IsAnimated.HasValue) throw new PolymorfaConfigurationException("The pinned Signal service does not accept thumbnail, waveform or animation metadata.");
        return new(kind == WhatsAppUploadMediaType.Ptt ? "audio" : WhatsAppMedia.UploadKind(kind), DirectPath, MediaKey.ToArray(), FileSha256.ToArray(), FileEncSha256.ToArray(), (ulong)FileLength, MimeType) { Url = Url, Caption = caption ?? Caption, FileName = fileName ?? Filename, Width = Width, Height = Height, Seconds = Seconds, MediaKeyTimestamp = MediaKeyTimestamp is { } timestamp ? (long)timestamp : null, Ptt = kind is WhatsAppUploadMediaType.Audio or WhatsAppUploadMediaType.Ptt ? kind == WhatsAppUploadMediaType.Ptt : null };
    }
}
public sealed record DescriptorImageContent(WhatsAppMediaSendDescriptor Image) : MessageContent;
public sealed record DescriptorVideoContent(WhatsAppMediaSendDescriptor Video) : MessageContent;
public sealed record DescriptorFileContent(WhatsAppMediaSendDescriptor File) : MessageContent;
public sealed record DescriptorVoiceContent(WhatsAppMediaSendDescriptor Voice) : MessageContent;
public sealed record StickerContent(WhatsAppMediaSendDescriptor Sticker) : MessageContent;
public static partial class WhatsAppMedia
{
    public static WhatsAppMediaSendDescriptor ToSendDescriptor(EncryptedWhatsAppMediaInfo info, WhatsAppUploadLocation location, WhatsAppMediaSendMetadata? metadata = null)
    {
        metadata ??= new(); var descriptor = new WhatsAppMediaSendDescriptor(location.DirectPath, info.MediaKey.ToArray(), info.FileSha256.ToArray(), info.FileEncSha256.ToArray(), info.FileLength, metadata.Mimetype ?? info.Mimetype ?? "", location.Url) { Thumbnail = metadata.Thumbnail?.ToArray(), Width = metadata.Dimensions?.Width, Height = metadata.Dimensions?.Height, Seconds = metadata.Seconds, Waveform = metadata.Waveform?.ToArray(), MediaKeyTimestamp = metadata.MediaKeyTimestamp, IsAnimated = metadata.IsAnimated }; descriptor.Validate(info.MediaType); return descriptor;
    }
}
