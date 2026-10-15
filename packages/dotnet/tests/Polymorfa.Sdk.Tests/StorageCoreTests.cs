using Polymorfa.Sdk;
using Polymorfa.Sdk.Storage;
using System.Text.Json;
internal static class StorageCoreTests
{
    private static IReadOnlyDictionary<string,string> Key(params (string Name,string Value)[] values)=>values.ToDictionary(v=>v.Name,v=>v.Value,StringComparer.Ordinal);
    private static IReadOnlyDictionary<string,StorageFieldWrite> Fields(string name,object? value,double version)=>new Dictionary<string,StorageFieldWrite>{{name,new(JsonSerializer.SerializeToElement(value),version)}};
    private static StorageBatch Batch(string session,string? id,params StorageOperation[] operations)=>new(session,operations,id);
    internal static async Task RunAsync()
    {
        ResourceTests.Equal(Enum.GetValues<StorageEntity>().Length,17);ResourceTests.Equal(StorageSchema.Version,2);ResourceTests.Equal(StorageSchema.EncodeKey(StorageEntity.Messages,Key(("sessionId","s.a/💎"),("messageId","!'()"))),"ks%2Ea%2F%F0%9F%92%8E:!'()");
        foreach(var (number,expected) in new[]{(1e-7,"1e-7"),(1e-6,"0.000001"),(1e20,"100000000000000000000"),(1e21,"1e+21"),(-0d,"0"),(1.5,"1.5")})ResourceTests.Equal(StorageMerge.CanonicalJson(JsonSerializer.SerializeToElement(number)),expected);
        ResourceTests.Equal(StorageMerge.CanonicalJson(JsonSerializer.SerializeToElement(new Dictionary<string,int>{{"\ue000",1},{"💎",2}})),"{\"💎\":2,\"\ue000\":1}");
        var memory=new MemoryStorageAdapter();var store=new CustomerStorage(memory);var key=Key(("sessionId","s"),("messageId","m"));var first=Batch("s","event",new StorageUpsert(StorageEntity.Messages,key,Fields("text","first",1)));ResourceTests.True((await store.ApplyAsync(first)).Applied);ResourceTests.True(!(await store.ApplyAsync(first)).Applied);
        var current=memory.Rows(StorageEntity.Messages)[0];var newRow=StorageMerge.EmptyRow(StorageEntity.Messages,Key(("sessionId","s"),("messageId","new")))with{Revision=1};var failed=await memory.CommitAsync(new StorageWrite[]{new StoragePut(StorageEntity.Messages,newRow,null),new StorageRowDelete(StorageEntity.Messages,current.Id,current.Revision+1)});ResourceTests.True(!failed.Ok);ResourceTests.Equal(memory.Rows(StorageEntity.Messages).Count,1);
        await Task.WhenAll(Enumerable.Range(2,9).Select(version=>store.ApplyAsync(Batch("s",null,new StorageUpsert(StorageEntity.Messages,key,Fields("text",version.ToString(System.Globalization.CultureInfo.InvariantCulture),version))))));ResourceTests.Equal((await store.GetAsync(StorageEntity.Messages,key))!["text"].GetString(),"10");
        var checkpoint=new StorageCheckpoint("s","events","next",PatchValue<string>.Set(null),UpdatedAt:100);await store.ApplyAsync(Batch("s",null,checkpoint));try{await store.ApplyAsync(Batch("s",null,checkpoint));throw new Exception("Stale checkpoint advanced");}catch(StorageCheckpointConflictException){}ResourceTests.Equal((await store.CheckpointAsync("s","events"))!.Cursor,"next");
        var operations=Enumerable.Range(0,2000).Select(i=>(StorageOperation)new StorageUpsert(StorageEntity.Messages,Key(("sessionId","big"),("messageId",i.ToString(System.Globalization.CultureInfo.InvariantCulture))),new Dictionary<string,StorageFieldWrite>{{"timestamp",new(JsonSerializer.SerializeToElement(i),i)},{"chatId",new(JsonSerializer.SerializeToElement("chat"),i)}})).ToArray();await store.ApplyAsync(new("big",operations,"chunk"));ResourceTests.Equal(memory.Rows(StorageEntity.Messages).Count,2001);
        var query=new StorageIndexQuery("by_chat",Key(("sessionId","big"),("chatId","chat")),17,Order:"asc");var page=await store.QueryAsync(StorageEntity.Messages,query);ResourceTests.Equal(page.Rows.Count,17);var next=await store.QueryAsync(StorageEntity.Messages,query with{After=page.Next});ResourceTests.Equal(next.Rows[0]["timestamp"].GetInt32(),17);
        await store.ApplyAsync(Batch("big",null,new StorageUpsert(StorageEntity.Chats,Key(("sessionId","big"),("chatId","chat")),Fields("clearedAt",1000,1000)),new StorageClearChat("big","chat",1000)));ResourceTests.Equal(memory.Rows(StorageEntity.Messages).Count,1000);
        await store.ApplyAsync(Batch("big","late",new StorageUpsert(StorageEntity.Messages,Key(("sessionId","big"),("messageId","late")),Fields("text","must stay absent",1001),new("big","chat",500))));ResourceTests.True(await store.GetAsync(StorageEntity.Messages,Key(("sessionId","big"),("messageId","late"))) is null);
        try{await store.ApplyAsync(Batch("s",null,new StorageUpsert(StorageEntity.Messages,Key(("sessionId","foreign"),("messageId","m")),Fields("text","foreign",1))));throw new Exception("Foreign session written");}catch(StorageValidationException){}
        await Snapshot();await StorageLeaseScanTests.RunAsync();
        await Fences();await FailedChunk();Console.WriteLine("PASS schema2 canonical merges, atomic rollback, replay, concurrency, 2000 rows, paging, conditional checkpoints, chat watermark, durable lease fences and failed-chunk marker ordering");
    }
    private sealed class PauseAcquire(MemoryStorageAdapter memory):IStorageAdapter
    {
        private int calls;internal TaskCompletionSource Started {get;}=new(TaskCreationOptions.RunContinuationsAsynchronously);internal TaskCompletionSource Release {get;}=new(TaskCreationOptions.RunContinuationsAsynchronously);public string Name=>"pause-acquire";public StorageCapabilities Capabilities=>memory.Capabilities;
        public Task<IReadOnlyDictionary<string,StorageRow>> GetAsync(StorageEntity e,IReadOnlyList<string> ids,CancellationToken cancellation=default)=>memory.GetAsync(e,ids,cancellation);
        public Task<IReadOnlyList<StorageRow>> QueryAsync(StorageEntity e,StorageIndexQuery q,CancellationToken cancellation=default)=>memory.QueryAsync(e,q,cancellation);
        public async Task<StorageCommitResult> CommitAsync(IReadOnlyList<StorageWrite> writes,CancellationToken cancellation=default){if(Interlocked.Increment(ref calls)==1){Started.TrySetResult();await Release.Task.WaitAsync(cancellation);}return await memory.CommitAsync(writes,cancellation);}
    }
    private static async Task Snapshot()
    {
        var memory=new MemoryStorageAdapter();var paused=new PauseAcquire(memory);var storage=new CustomerStorage(paused);var key=new Dictionary<string,string>{{"sessionId","snapshot"},{"messageId","original"}};var fields=new Dictionary<string,StorageFieldWrite>{{"text",new(JsonSerializer.SerializeToElement("original"),1)}};var operations=new List<StorageOperation>{new StorageUpsert(StorageEntity.Messages,key,fields)};var work=storage.ApplyAsync(new("snapshot",operations));await paused.Started.Task.WaitAsync(TimeSpan.FromSeconds(2));key["sessionId"]="foreign";fields["text"]=new(JsonSerializer.SerializeToElement("changed"),2);operations.Clear();paused.Release.TrySetResult();await work;ResourceTests.Equal((await storage.GetAsync(StorageEntity.Messages,Key(("sessionId","snapshot"),("messageId","original"))))!["text"].GetString(),"original");ResourceTests.Equal(memory.Rows(StorageEntity.Messages).Count,1);
    }
    private sealed class Paused(MemoryStorageAdapter memory):IStorageAdapter
    {
        private int calls;internal TaskCompletionSource Started {get;}=new(TaskCreationOptions.RunContinuationsAsynchronously);internal TaskCompletionSource Release {get;}=new(TaskCreationOptions.RunContinuationsAsynchronously);public string Name=>"paused-memory";public StorageCapabilities Capabilities=>memory.Capabilities;
        public Task<IReadOnlyDictionary<string,StorageRow>> GetAsync(StorageEntity e,IReadOnlyList<string> ids,CancellationToken cancellation=default)=>memory.GetAsync(e,ids,cancellation);
        public Task<IReadOnlyList<StorageRow>> QueryAsync(StorageEntity e,StorageIndexQuery q,CancellationToken cancellation=default)=>memory.QueryAsync(e,q,cancellation);
        public async Task<StorageCommitResult> CommitAsync(IReadOnlyList<StorageWrite> writes,CancellationToken cancellation=default){if(Interlocked.Increment(ref calls)==2){Started.TrySetResult();await Release.Task.WaitAsync(cancellation);}return await memory.CommitAsync(writes,cancellation);}
    }
    private static async Task Fences()
    {
        var memory=new MemoryStorageAdapter();long clock=100;var options=new StorageEngineOptions{Now=()=>Interlocked.Read(ref clock),LeaseDuration=TimeSpan.FromMilliseconds(10),LeaseWait=TimeSpan.Zero};var paused=new Paused(memory);var old=new CustomerStorage(paused,options);var next=new CustomerStorage(memory,options);var key=Key(("sessionId","s"),("messageId","m"));var oldWork=old.ApplyAsync(Batch("s","old",new StorageUpsert(StorageEntity.Messages,key,Fields("text","old",1))));await paused.Started.Task.WaitAsync(TimeSpan.FromSeconds(2));Interlocked.Exchange(ref clock,111);await next.ApplyAsync(Batch("s","new",new StorageUpsert(StorageEntity.Messages,key,Fields("text","new",2))));paused.Release.TrySetResult();try{await oldWork;throw new Exception("Expired writer wrote");}catch(StorageLeaseLostException){}ResourceTests.True(!await next.HasEventAsync("s","old"));var revision=memory.Rows(StorageEntity.Leases)[0].Revision;await next.ApplyAsync(Batch("s","next"));ResourceTests.True(memory.Rows(StorageEntity.Leases)[0].Revision>revision);ResourceTests.Equal((await next.GetAsync(StorageEntity.Messages,key))!["text"].GetString(),"new");
    }
    private sealed class ConflictFirst(MemoryStorageAdapter memory):IStorageAdapter
    {
        private int failed;public string Name=>"conflict-chunk";public StorageCapabilities Capabilities=>new(true,3);
        public Task<IReadOnlyDictionary<string,StorageRow>> GetAsync(StorageEntity e,IReadOnlyList<string> ids,CancellationToken cancellation=default)=>memory.GetAsync(e,ids,cancellation);
        public Task<IReadOnlyList<StorageRow>> QueryAsync(StorageEntity e,StorageIndexQuery q,CancellationToken cancellation=default)=>memory.QueryAsync(e,q,cancellation);
        public Task<StorageCommitResult> CommitAsync(IReadOnlyList<StorageWrite> writes,CancellationToken cancellation=default)=>writes.Count>1&&Interlocked.Exchange(ref failed,1)==0?Task.FromResult(new StorageCommitResult(false,new[]{((StoragePut)writes[0]).Row.Id})):memory.CommitAsync(writes,cancellation);
    }
    private static async Task FailedChunk()
    {
        var memory=new MemoryStorageAdapter();var store=new CustomerStorage(new ConflictFirst(memory),new(){MaxRetries=0});var operations=Enumerable.Range(0,3).Select(i=>(StorageOperation)new StorageUpsert(StorageEntity.Messages,Key(("sessionId","s"),("messageId",i.ToString(System.Globalization.CultureInfo.InvariantCulture))),Fields("text","value",1),new("s","c",1))).ToArray();var batch=new StorageBatch("s",operations,"event");try{await store.ApplyAsync(batch);throw new Exception("Conflict ignored");}catch(StorageConflictException){}ResourceTests.Equal(memory.Rows(StorageEntity.Messages).Count,0);ResourceTests.True(!await store.HasEventAsync("s","event"));ResourceTests.True((await store.ApplyAsync(batch)).Applied);ResourceTests.Equal(memory.Rows(StorageEntity.Messages).Count,3);ResourceTests.True(await store.HasEventAsync("s","event"));
    }
}

