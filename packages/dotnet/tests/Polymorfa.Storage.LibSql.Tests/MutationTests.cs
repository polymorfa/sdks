using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using Polymorfa.Sdk.Storage;
using Polymorfa.Storage.LibSql;
using Turso.Data.Sqlite;

internal sealed class PausedNativeConnection(string connectionString) : SqliteConnection(connectionString)
{
    private int armed;
    internal TaskCompletionSource Started { get; private set; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    internal TaskCompletionSource Release { get; private set; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    internal void Arm() { Started = new(TaskCreationOptions.RunContinuationsAsynchronously); Release = new(TaskCreationOptions.RunContinuationsAsynchronously); Interlocked.Exchange(ref armed, 1); }
    private async Task Pause(CancellationToken cancellation)
    {
        if (Interlocked.Exchange(ref armed, 0) == 1) { Started.TrySetResult(); await Release.Task.WaitAsync(cancellation); }
    }
    protected override DbCommand CreateDbCommand() => new PausedCommand(base.CreateDbCommand(), this);
    private sealed class PausedCommand(DbCommand command, PausedNativeConnection owner) : DbCommand
    {
        [AllowNull] public override string CommandText { get => command.CommandText; set => command.CommandText = value; }
        public override int CommandTimeout { get => command.CommandTimeout; set => command.CommandTimeout = value; }
        public override CommandType CommandType { get => command.CommandType; set => command.CommandType = value; }
        public override bool DesignTimeVisible { get => command.DesignTimeVisible; set => command.DesignTimeVisible = value; }
        public override UpdateRowSource UpdatedRowSource { get => command.UpdatedRowSource; set => command.UpdatedRowSource = value; }
        protected override DbConnection? DbConnection { get => command.Connection; set => command.Connection = value; }
        protected override DbTransaction? DbTransaction { get => command.Transaction; set => command.Transaction = value; }
        protected override DbParameterCollection DbParameterCollection => command.Parameters;
        public override void Cancel() => command.Cancel();
        public override int ExecuteNonQuery() => command.ExecuteNonQuery();
        public override object? ExecuteScalar() => command.ExecuteScalar();
        public override void Prepare() => command.Prepare();
        protected override DbParameter CreateDbParameter() => command.CreateParameter();
        protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior) => command.ExecuteReader(behavior);
        protected override async Task<DbDataReader> ExecuteDbDataReaderAsync(CommandBehavior behavior, CancellationToken cancellation) { await owner.Pause(cancellation); return await command.ExecuteReaderAsync(behavior, cancellation); }
        public override async Task<int> ExecuteNonQueryAsync(CancellationToken cancellation) { await owner.Pause(cancellation); return await command.ExecuteNonQueryAsync(cancellation); }
        protected override void Dispose(bool disposing) { if (disposing) command.Dispose(); base.Dispose(disposing); }
        public override ValueTask DisposeAsync() => command.DisposeAsync();
    }
}

internal static class MutationTests
{
    internal static async Task Run(PausedNativeConnection connection, LibSqlStorageAdapter adapter)
    {
        var key = new Dictionary<string, string> { { "sessionId", "immutable" }, { "messageId", "prepared" } };
        var row = StorageMerge.EmptyRow(StorageEntity.Messages, key);
        var fields = row.Fields.ToDictionary(p => p.Key, p => p.Value);
        using var document = JsonDocument.Parse("{\"original\":true}");
        fields["extra"] = document.RootElement;
        fields["chatId"] = JsonSerializer.SerializeToElement("original-chat");
        fields["timestamp"] = JsonSerializer.SerializeToElement(1);
        var versions = new Dictionary<string, double> { { "extra", 2 } };
        var writes = new List<StorageWrite> { new StoragePut(StorageEntity.Messages, row with { Revision = 1, Fields = fields, Versions = versions }, null) };
        connection.Arm(); var held = adapter.GetAsync(StorageEntity.Messages, new[] { row.Id }); await connection.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var commit = adapter.CommitAsync(writes);
        writes.Clear(); fields["extra"] = JsonSerializer.SerializeToElement("mutated"); versions["extra"] = 999; document.Dispose();
        connection.Release.TrySetResult(); await held; if (!(await commit).Ok) throw new Exception("Prepared commit failed");
        var saved = (await adapter.GetAsync(StorageEntity.Messages, new[] { row.Id }))[row.Id];
        if (!saved.Fields["extra"].GetProperty("original").GetBoolean() || saved.Versions["extra"] != 2) throw new Exception("Caller mutation changed prepared writes");
        var equals = new Dictionary<string, string> { { "sessionId", "immutable" }, { "chatId", "original-chat" } };
        connection.Arm(); held = adapter.GetAsync(StorageEntity.Messages, new[] { row.Id }); await connection.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var query = adapter.QueryAsync(StorageEntity.Messages, new("by_chat", equals, 10)); equals["chatId"] = "mutated-chat";
        connection.Release.TrySetResult(); await held; if ((await query).Single().Id != row.Id) throw new Exception("Caller mutation changed prepared query");
        Console.WriteLine("PASS libsql: paused native command preserves caller writes, JsonElement lifetime, versions and query equality");
    }
}
