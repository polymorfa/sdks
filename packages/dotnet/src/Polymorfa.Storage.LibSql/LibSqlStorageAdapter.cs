using System.Data.Common;
using Polymorfa.Sdk.Storage;
using Polymorfa.Storage.Sql;
using Turso.Data.Sqlite;

namespace Polymorfa.Storage.LibSql;

/// <summary>Customer-owned libSQL storage through Turso's maintained ADO.NET provider.</summary>
public sealed class LibSqlStorageAdapter : IStorageAdapter, IAsyncDisposable
{
    private readonly SqlStorageAdapter core;

    /// <summary>Borrows an open connection. The caller owns credentials, connection lifetime and exclusive use.</summary>
    public LibSqlStorageAdapter(SqliteConnection connection, SqlStorageOptions? options = null)
    {
        ArgumentNullException.ThrowIfNull(connection);
        ValidateConnection(connection);
        core = SqlStorageAdapter.BorrowSqlite(connection, options, "libsql", Conflict);
    }

    private static void ValidateConnection(SqliteConnection connection)
    {
        try
        {
            var configuration = new SqliteConnectionStringBuilder(connection.ConnectionString);
            if (!connection.IsDirectRemote || !Uri.TryCreate(configuration.DataSource, UriKind.Absolute, out var endpoint))
                throw new StorageValidationException("Customer libSQL storage requires a direct remote connection; use SqlStorageAdapter for local SQLite.");
            var explicitSecure = endpoint.Scheme is "https" or "wss" or "turso";
            var explicitPlain = endpoint.Scheme is "http" or "ws";
            if (endpoint.UserInfo.Length != 0 || endpoint.Query.Length != 0 || endpoint.Fragment.Length != 0 ||
                explicitSecure && configuration.Tls == false || explicitPlain && configuration.Tls == true)
                throw new StorageValidationException("Invalid customer libSQL connection configuration.");
            var secure = explicitSecure || endpoint.Scheme == "libsql" && configuration.Tls != false;
            if (!secure && !endpoint.IsLoopback) throw new StorageValidationException("Customer libSQL storage requires TLS except on loopback development endpoints.");
        }
        catch (StorageValidationException) { throw; }
        catch (Exception) { throw new StorageValidationException("Invalid customer libSQL connection configuration."); }
    }

    public string Name => core.Name;
    public StorageCapabilities Capabilities => core.Capabilities;
    public Task SetupAsync(CancellationToken cancellation = default) => Safe(async () => { await core.SetupAsync(cancellation).ConfigureAwait(false); return true; });
    public Task<IReadOnlyDictionary<string, StorageRow>> GetAsync(StorageEntity entity, IReadOnlyList<string> ids, CancellationToken cancellation = default) { var prepared = ids.ToArray(); return Safe(() => core.GetAsync(entity, prepared, cancellation)); }
    public Task<IReadOnlyList<StorageRow>> QueryAsync(StorageEntity entity, StorageIndexQuery query, CancellationToken cancellation = default) { var prepared = query with { EqualValues = query.EqualValues.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal) }; return Safe(() => core.QueryAsync(entity, prepared, cancellation)); }
    public Task<StorageCommitResult> CommitAsync(IReadOnlyList<StorageWrite> writes, CancellationToken cancellation = default)
    {
        var prepared = writes.Select<StorageWrite, StorageWrite>(write => write switch
        {
            StoragePut put => put with { Row = put.Row with { Fields = put.Row.Fields.ToDictionary(p => p.Key, p => p.Value.Clone(), StringComparer.Ordinal), Versions = put.Row.Versions.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal) } },
            StorageRowDelete delete => delete,
            _ => throw new StorageValidationException("Invalid customer libSQL storage operation.")
        }).ToArray();
        return Safe(() => core.CommitAsync(prepared, cancellation));
    }

    private static bool Conflict(DbException error) => error is SqliteException sqlite &&
        (sqlite.SqliteErrorCode is 5 or 6 || sqlite.SqliteExtendedErrorCode is 1555 or 2067);

    private static async Task<T> Safe<T>(Func<Task<T>> operation)
    {
        try { return await operation().ConfigureAwait(false); }
        catch (OperationCanceledException error) { throw new OperationCanceledException("Customer libSQL storage operation canceled; inspect the saved checkpoint before retrying.", error.CancellationToken); }
        catch (Exception error) when (error is not StorageException)
        {
            // Driver transport failures can include endpoint URLs and server SQL errors.
            throw new StorageProviderException("Customer libSQL storage operation failed.");
        }
    }

    public ValueTask DisposeAsync() => core.DisposeAsync();
}
