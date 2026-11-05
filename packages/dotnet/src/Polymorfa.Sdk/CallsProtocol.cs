using System.Buffers.Binary;
using System.Text.Json;

namespace Polymorfa.Sdk;

public abstract record CallSocketFrame;
public sealed record CallReady(string? Session, string? Participant, int? SampleRate, bool? Video, string? CallId, string? ConnectionId) : CallSocketFrame;
public sealed record CallLifecycleEvent(string Event, string CallId, JsonElement Payload, string Timestamp) : CallSocketFrame;
public sealed record CallTrickleCandidate(string Candidate, string? SdpMid = null, double? SdpMLineIndex = null);
public sealed record CallCandidate(string CallId, string? ConnectionId, CallTrickleCandidate Candidate) : CallSocketFrame;
public sealed record CallSocketError(string Code, string? Message) : CallSocketFrame;
public sealed record CallPong : CallSocketFrame;
public sealed record CallAudioFrame(short[] Pcm) : CallSocketFrame;
public sealed record CallVideoFrame(byte Codec, bool Keyframe, uint Source, ulong TimestampUs, byte[] Data) : CallSocketFrame;
public sealed record CallMediaState(bool AudioMuted, bool VideoEnabled, bool ScreenSharing = false);
public sealed record CallMediaStateReply(string RequestId, bool AudioMuted, bool VideoEnabled, bool ScreenSharing = false) : CallSocketFrame;
public sealed record CallMediaStateError(string RequestId, string Code) : CallSocketFrame;
public sealed record CallRemoteMedia(bool? AudioMuted) : CallSocketFrame;
public sealed record CallReaction(string Emoji, bool? Self, string? ParticipantId) : CallSocketFrame;
public sealed record CallHandState(bool Raised, bool Supported) : CallSocketFrame;
public sealed record CallParticipantFrame(string Type, CallParticipant Participant) : CallSocketFrame;
public sealed record CallParticipantLeft(string ParticipantId, string? Reason) : CallSocketFrame;
public sealed record CallVideoSource(uint Source, CallParticipant? Participant, string? ConnectionId, string? ConnectionParticipant) : CallSocketFrame;
public sealed record CallVideoSourceRemoved(uint Source) : CallSocketFrame;
public sealed record CallKeyframeRequest : CallSocketFrame;
public static class CallsProtocol
{
    public const string MediaSubprotocol = "pmfa.calls.v2";
    public static string CreateConnectionId() => Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(18)).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    internal static bool Connection(string? value) => value is not null && System.Text.RegularExpressions.Regex.IsMatch(value, "^[A-Za-z0-9_-]{8,64}$");
    internal static bool Participant(string? value) => value is not null && System.Text.RegularExpressions.Regex.IsMatch(value, "^[A-Za-z0-9._:@-]{1,128}$");
    public static byte[] EncodeAudio(ReadOnlySpan<short> pcm) { var bytes = new byte[1 + pcm.Length * 2]; bytes[0] = 1; for (var i = 0; i < pcm.Length; i++) BinaryPrimitives.WriteInt16LittleEndian(bytes.AsSpan(1 + i * 2), pcm[i]); return bytes; }
    public static byte[] EncodeVideo(CallVideoFrame frame) { if (frame.Codec != 1 || frame.Data.Length == 0) throw new PolymorfaValidationException("Provide H.264 video data.", "invalid_media_frame"); var bytes = new byte[15 + frame.Data.Length]; bytes[0] = 2; bytes[1] = 1; bytes[2] = frame.Keyframe ? (byte)1 : (byte)0; BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(3), frame.Source); BinaryPrimitives.WriteUInt64BigEndian(bytes.AsSpan(7), frame.TimestampUs); frame.Data.CopyTo(bytes, 15); return bytes; }
    public static CallSocketFrame? DecodeBinary(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length < 1) return null;
        if (bytes[0] == 1) { if (bytes.Length % 2 != 1) return null; var pcm = new short[(bytes.Length - 1) / 2]; for (var i = 0; i < pcm.Length; i++) pcm[i] = BinaryPrimitives.ReadInt16LittleEndian(bytes.Slice(1 + i * 2, 2)); return new CallAudioFrame(pcm); }
        if (bytes[0] != 2 || bytes.Length <= 15 || bytes[1] != 1) return null;
        return new CallVideoFrame(bytes[1], (bytes[2] & 1) != 0, BinaryPrimitives.ReadUInt32BigEndian(bytes[3..]), BinaryPrimitives.ReadUInt64BigEndian(bytes[7..]), bytes[15..].ToArray());
    }
    public static CallSocketFrame? ParseText(ReadOnlySpan<byte> bytes, bool media)
    {
        try
        {
            using var doc = JsonDocument.Parse(bytes.ToArray()); var f = doc.RootElement; if (f.ValueKind != JsonValueKind.Object) return null;
            string? S(string name) => f.TryGetProperty(name, out var x) && x.ValueKind == JsonValueKind.String ? x.GetString() : null;
            bool? B(string name) => f.TryGetProperty(name, out var x) && x.ValueKind is JsonValueKind.True or JsonValueKind.False ? x.GetBoolean() : null;
            uint U(string name) => f.TryGetProperty(name, out var x) && x.TryGetUInt32(out var n) ? n : 0;
            bool OptionalString(string name) => !f.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.String;
            bool OptionalBool(string name) => !f.TryGetProperty(name, out var value) || value.ValueKind is JsonValueKind.True or JsonValueKind.False;
            var type = S("type"); var id = S("requestId");
            if (type == "pong") return new CallPong();
            if (type == "error" && S("code") is { } code && OptionalString("message")) return new CallSocketError(code, S("message"));
            if (type == "ready") { var rate = U("sampleRate"); return ((!media && OptionalString("session") && OptionalString("participant")) || (media && rate is > 0 and <= int.MaxValue && B("video") is not null && OptionalString("callId") && OptionalString("connectionId"))) ? new CallReady(S("session"), S("participant"), media ? (int)rate : null, B("video"), S("callId"), S("connectionId")) : null; }
            if (!media)
            {
                if (type == "event" && S("event") is { } name && S("callId") is { } call && S("timestamp") is { } timestamp && f.TryGetProperty("payload", out var payload)) return new CallLifecycleEvent(name, call, payload.Clone(), timestamp);
                if (type == "candidate" && S("callId") is { } callId && (S("connectionId") is null || Connection(S("connectionId"))) && f.TryGetProperty("candidate", out var candidate) && candidate.ValueKind == JsonValueKind.Object && candidate.TryGetProperty("candidate", out var text) && text.ValueKind == JsonValueKind.String) return new CallCandidate(callId, S("connectionId"), candidate.Deserialize<CallTrickleCandidate>(HttpTransport.Json)!);
                return null;
            }
            if (type == "media_state" && Connection(id) && B("audioMuted") is { } muted && B("videoEnabled") is { } enabled && OptionalBool("screenSharing")) return new CallMediaStateReply(id!, muted, enabled, B("screenSharing") == true);
            if (type == "media_error" && Connection(id) && S("code") is { } error) return new CallMediaStateError(id!, error);
            if (type == "remote_media" && f.TryGetProperty("audioMuted", out var remote) && remote.ValueKind is JsonValueKind.True or JsonValueKind.False or JsonValueKind.Null) return new CallRemoteMedia(B("audioMuted"));
            if (type == "reaction" && S("emoji") is { } emoji && new[] { "", "👍", "❤️", "😂", "😮", "😢", "🙏" }.Contains(emoji) && (B("self") == true && !f.TryGetProperty("participantId", out _) || !f.TryGetProperty("self", out _) && S("participantId") is { } participantId && System.Text.RegularExpressions.Regex.IsMatch(participantId, "^[1-9][0-9]{0,18}$"))) return new CallReaction(emoji, B("self"), S("participantId"));
            if (type == "hand_state" && B("raised") is { } raised && B("supported") is { } supported) return new CallHandState(raised, supported);
            if (type == "participant_left" && S("participantId") is { } left && OptionalString("reason")) return new CallParticipantLeft(left, S("reason"));
            CallParticipant? ParticipantValue() { if (!f.TryGetProperty("participant", out var p) || p.ValueKind != JsonValueKind.Object) return null; if (p.TryGetProperty("handle", out _) || !p.TryGetProperty("audioMuted", out var audio) || audio.ValueKind is not (JsonValueKind.True or JsonValueKind.False) || !p.TryGetProperty("video", out var video) || video.ValueKind is not (JsonValueKind.True or JsonValueKind.False) || new[] { "phoneNumber", "bsuid", "username" }.Any(key => p.TryGetProperty(key, out var v) && v.ValueKind != JsonValueKind.String) || p.TryGetProperty("handRaised", out var hand) && hand.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return null; var value = p.Deserialize<CallParticipant>(HttpTransport.Json); return value is { Id.Length: > 0, State: "invited" or "ringing" or "connected" or "left" } ? value : null; }
            if (type is "participant_joined" or "participant_state" && ParticipantValue() is { } participant) return new CallParticipantFrame(type, participant);
            if (type == "video_source" && U("source") > 0) { var owner = ParticipantValue(); var connection = S("connectionId"); if (owner is not null && !f.TryGetProperty("connectionId", out _) && !f.TryGetProperty("connectionParticipant", out _) || !f.TryGetProperty("participant", out _) && Connection(connection) && OptionalString("connectionParticipant")) return new CallVideoSource(U("source"), owner, connection, S("connectionParticipant")); }
            if (type == "video_source_removed" && U("source") > 0) return new CallVideoSourceRemoved(U("source"));
            return type == "keyframe_request" ? new CallKeyframeRequest() : null;
        }
        catch (Exception e) when (e is JsonException or InvalidOperationException or FormatException) { return null; }
    }
}
