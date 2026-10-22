using Polymorfa.Sdk;

internal static class UploadTransportKey
{
    internal static object CannotReadMediaKey(WhatsAppEncryptedUploadBody body) => body.MediaKey;
}
