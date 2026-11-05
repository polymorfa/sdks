using System.Collections.ObjectModel;
using System.Text;

namespace Polymorfa.Sdk;

internal static class IdempotencyHeaders
{
    internal static RequestOptions Prepare(RequestOptions options, bool generate = false)
    {
        var key = options.IdempotencyKey;
        var headerPresent = false;
        var headers = new Dictionary<string, string>();
        foreach (var (name, value) in options.Headers ?? new Dictionary<string, string>())
        {
            if (!name.Equals("idempotency-key", StringComparison.OrdinalIgnoreCase)) headers[name] = value;
            else if (options.IdempotencyKey is null)
            {
                if (headerPresent && key != value) throw new PolymorfaConfigurationException("Supply one unambiguous idempotency key.");
                key = value; headerPresent = true;
            }
        }
        if ((key is not null || headerPresent) && (string.IsNullOrWhiteSpace(key) || Encoding.UTF8.GetByteCount(key) > 255 || key.Any(character => character < 32 && character != '\t' || character == 127)))
            throw new PolymorfaConfigurationException("The idempotency key must contain 1 to 255 bytes and valid header characters.");
        // A raw header alone does not opt an unsafe request into automatic retries.
        if (!generate && options.IdempotencyKey is null && headerPresent) headers["idempotency-key"] = key!;
        return options with
        {
            Headers = options.Headers is null ? null : new ReadOnlyDictionary<string, string>(headers),
            IdempotencyKey = generate ? key ?? Guid.NewGuid().ToString() : options.IdempotencyKey
        };
    }
}
