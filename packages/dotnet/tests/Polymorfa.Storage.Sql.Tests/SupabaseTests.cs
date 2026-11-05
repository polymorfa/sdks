using Npgsql;
using Polymorfa.Sdk.Storage;
using Polymorfa.Storage.Sql;
internal static class SupabaseTests
{
    private static void Check(bool condition) { if (!condition) throw new Exception("Supabase policy assertion failed."); }
    private static async Task Execute(NpgsqlConnection connection, string sql) { await using var command = new NpgsqlCommand(sql, connection); await command.ExecuteNonQueryAsync(); }
    private static async Task<long> Count(NpgsqlConnection connection, string sql) { await using var command = new NpgsqlCommand(sql, connection); return (long)(await command.ExecuteScalarAsync())!; }
    private static async Task Denied(NpgsqlConnection connection, string sql) { try { await Execute(connection, sql); throw new Exception("Unprivileged database operation succeeded."); } catch (PostgresException error) when (error.SqlState == "42501") { } }
    internal static async Task Run()
    {
        var preset = SupabaseStoragePreset.Sql(); Check(preset.Split("FORCE ROW LEVEL SECURITY", StringSplitOptions.None).Length - 1 == 18 && preset.Contains("auth.uid()", StringComparison.Ordinal));
        foreach (var (writer, reader) in new[] { ("same", "same"), ("writer", "PUBLIC"), ("bad;GRANT ALL", "reader") }) { try { _ = SupabaseStoragePreset.Sql(new() { ServerRole = writer, ReaderRole = reader }); throw new Exception("Unsafe policy role accepted."); } catch (StorageValidationException) { } }
        if (Environment.GetEnvironmentVariable("POLYMORFA_STORAGE_RLS_POSTGRES_URL") is not { } url) { Console.WriteLine("SKIP actual Supabase RLS: set independent customer fixture connection string"); return; }
        var target = new NpgsqlConnectionStringBuilder(url); if (target.Host is not ("127.0.0.1" or "localhost" or "::1") || target.Database != "sdk_customer_rls_tests") throw new Exception("RLS integration requires its dedicated loopback fixture database.");
        await using var admin = new NpgsqlConnection(url); await admin.OpenAsync(); var id = Guid.NewGuid().ToString("N"); var schema = "cs_" + id; var writerRole = "writer_" + id; var readerRole = "reader_" + id; var anonymousRole = "anon_" + id; var ownerRole = "owner_" + id; var roles = new[] { writerRole, readerRole, anonymousRole, ownerRole }; var subjectA = Guid.NewGuid(); var subjectB = Guid.NewGuid();
        // This synthetic auth.uid() shim belongs only to the task-owned fixture database.
        await Execute(admin, "CREATE SCHEMA IF NOT EXISTS auth;CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;GRANT USAGE ON SCHEMA auth TO PUBLIC;");
        foreach (var role in roles) await Execute(admin, $"CREATE ROLE \"{role}\" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS");
        var naming = new SqlStorageOptions { Schema = schema, TablePrefix = "app_", CreateTables = false }; await using (var transaction = await admin.BeginTransactionAsync()) { await Execute(admin, SupabaseStoragePreset.Sql(new() { Sql = naming, ServerRole = writerRole, ReaderRole = readerRole })); await transaction.CommitAsync(); }
        string Connection(string role) { var builder = new NpgsqlConnectionStringBuilder(url) { Username = role, Password = "", Pooling = false }; return builder.ConnectionString; }
        await using var adapter = SqlStorageAdapter.Postgres(Connection(writerRole), naming); await adapter.SetupAsync(); var writes = new List<StorageWrite>(); foreach (var entity in Enum.GetValues<StorageEntity>()) foreach (var session in new[] { "session-a", "session-b" }) { var keys = StorageSchema.Definition(entity).Key.ToDictionary(k => k, k => k == "sessionId" ? session : "row"); writes.Add(new StoragePut(entity, StorageMerge.EmptyRow(entity, keys) with { Revision = 1 }, null)); }
        Check((await adapter.CommitAsync(writes)).Ok);
        var members = $"\"{schema}\".app_storage_memberships"; await using (var command = new NpgsqlCommand($"INSERT INTO {members}(session_id,subject) VALUES ('session-a',@a),('session-b',@b)", admin)) { command.Parameters.AddWithValue("a", subjectA); command.Parameters.AddWithValue("b", subjectB); await command.ExecuteNonQueryAsync(); }
        await using var browser = new NpgsqlConnection(Connection(readerRole)); await browser.OpenAsync(); await Execute(browser, $"SET request.jwt.claim.sub='{subjectA}'"); foreach (var entity in Enum.GetValues<StorageEntity>()) { var table = $"\"{schema}\".\"app_{StorageSchema.Definition(entity).Name}\""; await using var command = new NpgsqlCommand($"SELECT session_id FROM {table}", browser); await using var rows = await command.ExecuteReaderAsync(); Check(await rows.ReadAsync() && rows.GetString(0) == "session-a" && !await rows.ReadAsync()); }
        Check(await Count(browser, $"SELECT count(*) FROM {members}") == 1);
        await Denied(browser, $"DELETE FROM {members}"); await Denied(browser, $"UPDATE \"{schema}\".app_messages SET text='forbidden'"); await Denied(browser, $"INSERT INTO \"{schema}\".app_events (_id,session_id,event_id,_rev,_v) VALUES ('fake','session-a','fake',1,'{{}}')");
        await using var guest = new NpgsqlConnection(Connection(anonymousRole)); await guest.OpenAsync(); await Denied(guest, $"SELECT * FROM \"{schema}\".app_messages");
        await Execute(admin, $"GRANT USAGE,CREATE ON SCHEMA \"{schema}\" TO \"{ownerRole}\";ALTER TABLE \"{schema}\".app_messages OWNER TO \"{ownerRole}\""); await using var owner = new NpgsqlConnection(Connection(ownerRole)); await owner.OpenAsync(); Check(await Count(owner, $"SELECT count(*) FROM \"{schema}\".app_messages") == 0);
        await using (var flags = new NpgsqlCommand("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=@schema AND c.relrowsecurity AND c.relforcerowsecurity", admin)) { flags.Parameters.AddWithValue("schema", schema); Check((long)(await flags.ExecuteScalarAsync())! == 18); }
        await Execute(admin, $"DELETE FROM {members} WHERE session_id='session-a'"); Check(await Count(browser, $"SELECT count(*) FROM \"{schema}\".app_messages") == 0); await Execute(browser, "SET request.jwt.claim.sub=''"); Check(await Count(browser, $"SELECT count(*) FROM \"{schema}\".app_contacts") == 0);
        var storage = new CustomerStorage(adapter); Check((await storage.ApplyAsync(new("server-session", Array.Empty<StorageOperation>(), "writer-event"))).Applied);
        await browser.CloseAsync(); await guest.CloseAsync(); await owner.CloseAsync(); await adapter.DisposeAsync(); await Execute(admin, $"DROP SCHEMA \"{schema}\" CASCADE"); foreach (var role in roles) await Execute(admin, $"DROP ROLE \"{role}\"");
        Console.WriteLine("PASS actual PostgreSQL Supabase preset: all 17 entities, isolated live memberships, reader/anonymous write denial, FORCE-RLS owner fencing, revoke and missing-subject denial, native server lease/dedupe write");
    }
}
