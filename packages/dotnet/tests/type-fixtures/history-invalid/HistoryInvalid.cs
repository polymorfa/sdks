using Polymorfa.Sdk.Storage;
internal static class HistoryInvalid
{
    internal static void Invalid()
    {
        _ = new StorageHistoryContent { ImageMessage = "a descriptor is not a decoded media message" };
        _ = new StorageWebMessageInfo { MessageTimestamp = true };
        _ = new StorageHistoryConversation { Participant = new[] { "not a participant" } };
        _ = new StorageHistoryMedia { MediaKey = 123 };
    }
}
