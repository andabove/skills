# APIs that Effect 3 had and 4.0.0 removed

Checked against `effect` 4.0.0 and `@effect/platform` 0.97.2 (the last release for `effect` 3.22). Scope: the core `effect` package and the `@effect/platform` modules that moved into it. For `@effect/ai*`, `@effect/cluster`, `@effect/sql*`, `@effect/rpc`, `@effect/cli` and `@effect/experimental`, search `migration/v3-to-v4.md` for `` -> `none` `` under the module's heading.

How this list was built: every `` -> `none` `` entry of `migration/v3-to-v4.md` at `effect@4.0.0`, plus each v3 export that is absent from 4.0.0 under the same name, has no entry in the reference, and has no replacement in the 4.0.0 source. A name marked `*` has no entry in the reference at all. Type-level helpers (`*TypeId`, `*Unify`, `*UnifyIgnore`, `*Variance`; 182 names) are left out. Each listed name was checked to be absent from the 4.0.0 module it maps to.

Before you rewrite a call to one of these, look up its name in the reference: most entries name the v4 primitive to rebuild it from.

## Whole modules

`effect/ChildExecutorDecision`, `effect/MergeState`, `effect/ModuleVersion`, `effect/RateLimiter` (a rate limiter now lives in `effect/persistence/RateLimiter`), `effect/RuntimeFlagsPatch`, `effect/ScheduleInterval`, `effect/ScheduleIntervals`, `effect/Streamable`, `effect/TestAnnotation`, `effect/TestAnnotationMap`, `effect/TestAnnotations`, `effect/UpstreamPullRequest`, `effect/UpstreamPullStrategy`, `@effect/platform/HttpMultiplex`.

`effect/Encoding` is listed as removed in the reference but moved: its codecs live in `effect/encoding/Base64`, `effect/encoding/Base64Url` and `effect/encoding/Hex` (`encodeBase64` to `Base64.encode`, `decodeBase64` to `Base64.decode`, which returns a `Result`, and the same for `Base64Url` and `Hex`). A Base64 round trip through `effect/encoding/Base64` returns the input unchanged. v3 `encodeUriComponent` and `decodeUriComponent` have no v4 module; use the JavaScript globals.

Other v3 modules are gone as modules but have per-API replacements: for example `effect/Either` (now `effect/Result`), `effect/FiberRef` (now `Context.Reference` and `References`), `effect/Micro`, `effect/STM` and the `T*` modules (now the `Tx*` modules). Their removed members are in the list below.

## Same name, new behaviour

The reference lists these as removed, but 4.0.0 exports the name with a different meaning:

- `Schema.Symbol`: now the schema of `symbol` values; the v3 string-to-symbol codec is gone.
- `TSubscriptionRef.changes` maps to `TxSubscriptionRef.changes`, which now needs a `Scope`.

## Removed APIs by module

- `effect/Cache`: `Cache.CacheStats`, `Cache.EntryStats`, `Cache.makeCacheStats`, `Cache.makeEntryStats`
- `effect/Cause`: `Cause.InterruptedException`, `Cause.Parallel`, `Cause.Sequential`, `Cause.isInterruptedException`, `Cause.isParallelType`, `Cause.isRuntimeException`, `Cause.isSequentialType`
- `effect/Channel`: `Channel.ChannelException`, `Channel.bufferChunk`, `Channel.concatAllWith`, `Channel.concatMapWith`, `Channel.concatMapWithCustom`, `Channel.doneCollect`, `Channel.emitCollect`, `Channel.foldCauseChannel`, `Channel.foldChannel`, `Channel.fromInput`, `Channel.isChannelException`, `Channel.mapInputEffect`, `Channel.mapInputErrorEffect`, `Channel.mergeAllUnboundedWith`, `Channel.mergeAllWith`, `Channel.mergeOutWith`, `Channel.read`, `Channel.readOrFail`, `Channel.readWith`, `Channel.readWithCause`
- `effect/Clock`: `Clock.CancelToken`, `Clock.ClockScheduler`, `Clock.Task`
- `effect/Config`: `Config.Config.IsPlainObject`
- `effect/ConfigError`: `ConfigError.ConfigError.Reducer`, `ConfigError.ConfigErrorReducer`, `ConfigError.MissingData`, `ConfigError.Options`, `ConfigError.Unsupported`, `ConfigError.isMissingData`, `ConfigError.isUnsupported`, `ConfigError.reduceWithContext`
- `effect/ConfigProvider`: `ConfigProvider.ConfigProvider.FromMapConfig`
- `effect/ConfigProviderPathPatch`: `ConfigProviderPathPatch.Empty`, `ConfigProviderPathPatch.MapName`, `ConfigProviderPathPatch.Nested`, `ConfigProviderPathPatch.Unnested`
- `effect/Data`: `Data.array`, `Data.case`, `Data.struct`, `Data.tuple`, `Data.unsafeArray`, `Data.unsafeStruct`
- `effect/DefaultServices`: `DefaultServices.DefaultServices`
- `effect/Differ`: `Differ.Differ.Context.Patch`, `Differ.environment`
- `effect/Duration`: `Duration.formatIso`, `Duration.fromIso`, `Duration.unsafeFormatIso`
- `effect/Effect`: `Effect.Adapter`, `Effect.Blocked`, `Effect.blocked`, `Effect.cacheRequestResult`, `Effect.cachedFunction`, `Effect.catchSomeDefect`, `Effect.checkInterruptible`, `Effect.custom`, `Effect.diffFiberRefs`, `Effect.dropUntil`, `Effect.dropWhile`, `Effect.finalizersMask`, `Effect.getFiberRefs`, `Effect.getRuntimeFlags`, `Effect.inheritFiberRefs`, `Effect.iterate`, `Effect.loop`, `Effect.parallelFinalizers`, `Effect.patchFiberRefs`, `Effect.patchRuntimeFlags`, `Effect.reduceWhile`, `Effect.runRequestBlock`, `Effect.sequentialFinalizers`, `Effect.setFiberRefs`, `Effect.step`, `Effect.takeUntil`, `Effect.takeWhile`, `Effect.transplant`, `Effect.updateFiberRefs`, `Effect.whenLogLevel`, `Effect.withConcurrency`, `Effect.withFiberRuntime`, `Effect.withMaxOpsBeforeYield`, `Effect.withRequestBatching`, `Effect.withRequestCache`, `Effect.withRequestCaching`, `Effect.withRuntimeFlagsPatch`, `Effect.withRuntimeFlagsPatchScoped`, `Effect.withScheduler`, `Effect.withSchedulingPriority`
- `effect/Fiber`: `Fiber.Fiber.Descriptor`, `Fiber.Fiber.Dump`, `Fiber.children`, `Fiber.dumpAll`, `Fiber.inheritAll`, `Fiber.match`, `Fiber.pretty`, `Fiber.roots`, `Fiber.unsafeRoots`
- `effect/FiberId`: `FiberId.Composite`, `FiberId.combine`, `FiberId.combineAll`, `FiberId.composite`, `FiberId.isComposite`, `FiberId.unsafeMake`
- `effect/FiberRef`: `FiberRef.currentConcurrency`, `FiberRef.currentRequestBatchingEnabled`, `FiberRef.currentRuntimeFlags`, `FiberRef.currentSchedulingPriority`, `FiberRef.currentSupervisor`, `FiberRef.interruptedCause`, `FiberRef.makeRuntimeFlags`, `FiberRef.unsafeMakeSupervisor`, `FiberRef.versionMismatchErrorLogLevel`
- `effect/FiberRefs`: `FiberRefs.FiberRefsSym`, `FiberRefs.fiberRefs`, `FiberRefs.forkAs`, `FiberRefs.joinAs`
- `effect/FiberRefsPatch`: `FiberRefsPatch.FiberRefsPatch`, `FiberRefsPatch.diff`, `FiberRefsPatch.Remove`*, `FiberRefsPatch.Update`*
- `effect/FiberStatus`: `FiberStatus.Running`, `FiberStatus.Suspended`, `FiberStatus.isFiberStatus`, `FiberStatus.isSuspended`, `FiberStatus.running`, `FiberStatus.suspended`
- `effect/Graph`: `Graph.Proto`
- `effect/GroupBy`: `GroupBy.make`
- `effect/Hash`: `Hash.cached`
- `effect/HashSet`: `HashSet.beginMutation`, `HashSet.endMutation`, `HashSet.mutate`, `HashSet.values`
- `effect/Inspectable`: `Inspectable.withRedactableContext`
- `effect/Layer`: `Layer.isFresh`, `Layer.setRequestBatching`, `Layer.setRequestCache`, `Layer.setRequestCaching`, `Layer.setVersionMismatchErrorLogLevel`
- `effect/List`: `List.Nil`
- `effect/Match`: `Match.SafeRefinementId`
- `effect/Metric`: `Metric.MetricApply`, `Metric.fiberLifetimes`, `Metric.make`, `Metric.mapType`, `Metric.succeed`, `Metric.sync`
- `effect/MetricBoundaries`: `MetricBoundaries.isMetricBoundaries`
- `effect/MetricHook`: `MetricHook.make`, `MetricHook.onModify`, `MetricHook.onUpdate`
- `effect/MetricLabel`: `MetricLabel.isMetricLabel`
- `effect/MetricState`: `MetricState.isCounterState`, `MetricState.isFrequencyState`, `MetricState.isGaugeState`, `MetricState.isHistogramState`, `MetricState.isMetricState`, `MetricState.isSummaryState`
- `effect/Micro`: `Micro.CurrentConcurrency`, `Micro.withConcurrency`, `Micro.yieldFlush`
- `effect/MutableList`: `MutableList.isEmpty`, `MutableList.length`, `MutableList.pop`
- `effect/MutableQueue`: `MutableQueue.EmptyMutableQueue`, `MutableQueue.MutableQueue.Empty`, `MutableQueue.capacity`
- `effect/ParseResult`: `ParseResult.eitherOrUndefined`
- `effect/Queue`: `Queue.BackingQueue`
- `effect/RedBlackTree`: `RedBlackTree.Direction`, `RedBlackTree.RedBlackTree.Direction`, `RedBlackTree.getOrder`
- `effect/Request`: `Request.Listeners`, `Request.interruptWhenPossible`, `Request.isEntry`
- `effect/RequestBlock`: `RequestBlock.Empty`, `RequestBlock.Par`, `RequestBlock.RequestBlock`, `RequestBlock.Seq`, `RequestBlock.reduce`
- `effect/Runtime`: `Runtime.FiberFailure`, `Runtime.FiberFailureCauseId`, `Runtime.FiberFailureId`, `Runtime.Runtime.Context`, `Runtime.defaultRuntimeFlags`, `Runtime.disableRuntimeFlag`, `Runtime.enableRuntimeFlag`, `Runtime.isFiberFailure`, `Runtime.updateRuntimeFlags`
- `effect/RuntimeFlags`: `RuntimeFlags.None`, `RuntimeFlags.OpSupervision`, `RuntimeFlags.RuntimeFlag`, `RuntimeFlags.RuntimeFlags`, `RuntimeFlags.WindDown`, `RuntimeFlags.diff`, `RuntimeFlags.differ`, `RuntimeFlags.disable`, `RuntimeFlags.disableAll`, `RuntimeFlags.disableOpSupervision`, `RuntimeFlags.disableWindDown`, `RuntimeFlags.enable`, `RuntimeFlags.enableAll`, `RuntimeFlags.enableOpSupervision`, `RuntimeFlags.enableWindDown`, `RuntimeFlags.interruptible`, `RuntimeFlags.interruption`, `RuntimeFlags.isDisabled`, `RuntimeFlags.make`, `RuntimeFlags.none`, `RuntimeFlags.opSupervision`, `RuntimeFlags.patch`, `RuntimeFlags.render`, `RuntimeFlags.toSet`, `RuntimeFlags.windDown`
- `effect/STM`: `STM.Adapter`, `STM.All.Narrow`, `STM.All.Options`, `STM.orElse`, `STM.orElseEither`, `STM.orTry`
- `effect/Schedule`: `Schedule.bothInOut`, `Schedule.collectAllInputs`, `Schedule.collectAllOutputs`, `Schedule.collectUntil`, `Schedule.collectUntilEffect`, `Schedule.collectWhile`, `Schedule.collectWhileEffect`, `Schedule.compose`, `Schedule.reduce`, `Schedule.reduceEffect`, `Schedule.resetAfter`, `Schedule.resetWhen`, `Schedule.zipLeft`, `Schedule.zipRight`, `Schedule.zipWith`
- `effect/ScheduleDecision`: `ScheduleDecision.ScheduleDecision`, `ScheduleDecision.isContinue`, `ScheduleDecision.Continue`*
- `effect/Scheduler`: `Scheduler.ControlledScheduler`, `Scheduler.PriorityBuckets`, `Scheduler.make`, `Scheduler.makeMatrix`
- `effect/Schema`: `Schema.Annotable`, `Schema.Annotable.All`, `Schema.Annotable.Any`, `Schema.Annotable.Self`, `Schema.AnnotableClass`, `Schema.AnnotableDeclare`, `Schema.Annotations.Doc`, `Schema.Annotations.GenericSchema`, `Schema.Annotations.Schema`, `Schema.ArrayFormatterIssue`, `Schema.BetweenBigDecimalSchemaId`, `Schema.BetweenBigIntSchemaId`, `Schema.BetweenDateSchemaId`, `Schema.BetweenDurationSchemaId`, `Schema.BetweenSchemaId`, `Schema.BigDecimalFromNumber`, `Schema.BigIntFromNumber`, `Schema.BooleanFromString`, `Schema.BrandSchemaId`, `Schema.CapitalizedSchemaId`, `Schema.Config`, `Schema.Data`, `Schema.DataFromSelf`, `Schema.DateFromSelfSchemaId`, `Schema.Element`, `Schema.Element.Token`, `Schema.EndsWithSchemaId`, `Schema.EnumsDefinition`, `Schema.FiberId`, `Schema.FiberIdEncoded`, `Schema.FiberIdFromSelf`, `Schema.FiniteSchemaId`, `Schema.FromPropertySignature`, `Schema.GreaterThanBigDecimalSchemaId`, `Schema.GreaterThanBigIntSchemaId`, `Schema.GreaterThanDateSchemaId`, `Schema.GreaterThanDurationSchemaId`, `Schema.GreaterThanOrEqualToBigDecimalSchemaId`, `Schema.GreaterThanOrEqualToBigIntSchemaId`, `Schema.GreaterThanOrEqualToDateSchemaId`, `Schema.GreaterThanOrEqualToDurationSchemaId`, `Schema.GreaterThanOrEqualToSchemaId`, `Schema.GreaterThanSchemaId`, `Schema.IncludesSchemaId`, `Schema.IndexSignature`, `Schema.IndexSignature.Context`, `Schema.IndexSignature.Encoded`, `Schema.IndexSignature.NonEmptyRecords`, `Schema.IndexSignature.Record`, `Schema.IndexSignature.Type`, `Schema.InstanceOfSchemaId`, `Schema.IntSchemaId`, `Schema.ItemsCountSchemaId`, `Schema.JsonNumberSchemaId`, `Schema.LeftEncoded`, `Schema.LengthSchemaId`, `Schema.LessThanBigDecimalSchemaId`, `Schema.LessThanBigIntSchemaId`, `Schema.LessThanDateSchemaId`, `Schema.LessThanDurationSchemaId`, `Schema.LessThanOrEqualToBigDecimalSchemaId`, `Schema.LessThanOrEqualToBigIntSchemaId`, `Schema.LessThanOrEqualToDateSchemaId`, `Schema.LessThanOrEqualToDurationSchemaId`, `Schema.LessThanOrEqualToSchemaId`, `Schema.LessThanSchemaId`, `Schema.List`, `Schema.ListFromSelf`, `Schema.LowercasedSchemaId`, `Schema.MapFromRecord`, `Schema.MaxItemsSchemaId`, `Schema.MaxLengthSchemaId`, `Schema.MinItemsSchemaId`, `Schema.MinLengthSchemaId`, `Schema.MultipleOfSchemaId`, `Schema.NegativeBigDecimalSchemaId`, `Schema.NonEmptyArrayEnsure`, `Schema.NonNaNSchemaId`, `Schema.NonNegativeBigDecimalSchemaId`, `Schema.NonPositiveBigDecimalSchemaId`, `Schema.Not`, `Schema.OptionalOptions`, `Schema.ParseJsonOptions`, `Schema.PatternSchemaId`, `Schema.PositiveBigDecimalSchemaId`, `Schema.PropertySignature`, `Schema.PropertySignature.AST`, `Schema.PropertySignature.All`, `Schema.PropertySignature.Any`, `Schema.PropertySignature.Token`, `Schema.PropertySignatureDeclaration`, `Schema.PropertySignatureTransformation`, `Schema.ReadonlyMapFromRecord`, `Schema.RefineSchemaId`, `Schema.RightEncoded`, `Schema.Schema.All`, `Schema.Schema.Any`, `Schema.Schema.AnyNoContext`, `Schema.Schema.AsSchema`, `Schema.Schema.Context`, `Schema.Schema.Encoded`, `Schema.Schema.ToAsserts`, `Schema.Serializable`, `Schema.Serializable.All`, `Schema.Serializable.Any`, `Schema.Serializable.Context`, `Schema.Serializable.Encoded`, `Schema.Serializable.Type`, `Schema.SerializableWithResult`, `Schema.SerializableWithResult.All`, `Schema.SerializableWithResult.Any`, `Schema.SerializableWithResult.Context`, `Schema.SimplifyMutable`, `Schema.SortedSet`, `Schema.SortedSetFromSelf`, `Schema.StartsWithSchemaId`, `Schema.Struct.Constructor`, `Schema.Struct.Context`, `Schema.Struct.Field`, `Schema.Struct.Key`, `Schema.Struct.OptionalEncodedPropertySignature`, `Schema.Struct.OptionalTypePropertySignature`, `Schema.Struct.PropertySignatureWithDefault`, `Schema.TaggedRequest.All`, `Schema.TaggedRequest.Any`, `Schema.ToPropertySignature`, `Schema.TrimmedSchemaId`, `Schema.TupleType.ElementsEncoded`, `Schema.TupleType.ElementsType`, `Schema.TupleType.Encoded`, `Schema.TupleType.Type`, `Schema.TypeLiteral`, `Schema.TypeLiteral.Constructor`, `Schema.TypeLiteral.Encoded`, `Schema.TypeLiteral.Type`, `Schema.ULIDSchemaId`, `Schema.UUIDSchemaId`, `Schema.UncapitalizedSchemaId`, `Schema.UppercasedSchemaId`, `Schema.ValidDateSchemaId`, `Schema.WithResult`, `Schema.WithResult.All`, `Schema.WithResult.Any`, `Schema.WithResult.Context`, `Schema.WithResult.Failure`, `Schema.WithResult.FailureEncoded`, `Schema.WithResult.Success`, `Schema.WithResult.SuccessEncoded`, `Schema.asSerializable`, `Schema.asSerializableWithResult`, `Schema.asWithResult`, `Schema.deserialize`, `Schema.deserializeExit`, `Schema.deserializeFailure`, `Schema.deserializeSuccess`, `Schema.element`, `Schema.exitSchema`, `Schema.failureSchema`, `Schema.getNumberIndexedAccess`, `Schema.head`, `Schema.headNonEmpty`, `Schema.headOrElse`, `Schema.isPropertySignature`, `Schema.keyof`, `Schema.makePropertySignature`, `Schema.optionalElement`, `Schema.pluck`, `Schema.propertySignature`, `Schema.serializableSchema`, `Schema.serialize`, `Schema.serializeExit`, `Schema.serializeFailure`, `Schema.serializeSuccess`, `Schema.successSchema`, `Schema.symbolSerializable`, `Schema.symbolWithResult`, `Schema.withDefaults`, `Schema.validateOption`*, `Schema.TupleType`*
- `effect/SchemaAST`: `SchemaAST.BatchingAnnotation`, `SchemaAST.BatchingAnnotationId`, `SchemaAST.BrandAnnotation`, `SchemaAST.Compiler`, `SchemaAST.Match`, `SchemaAST.ParseIssueTitleAnnotation`, `SchemaAST.ParseIssueTitleAnnotationId`, `SchemaAST.ParseOptionsAnnotationId`, `SchemaAST.getBatchingAnnotation`, `SchemaAST.getBrandAnnotation`, `SchemaAST.getCompiler`, `SchemaAST.getDecodingFallbackAnnotation`, `SchemaAST.getParseIssueTitleAnnotation`, `SchemaAST.getParseOptionsAnnotation`, `SchemaAST.getTemplateLiteralCapturingRegExp`, `SchemaAST.getTemplateLiteralRegExp`, `SchemaAST.isComposeTransformation`, `SchemaAST.keyof`, `SchemaAST.pick`
- `effect/Secret`: `Secret.Secret.Proto`
- `effect/Sink`: `Sink.collectAllFrom`, `Sink.collectAllToMapN`, `Sink.collectAllWhileWith`, `Sink.drop`, `Sink.dropUntil`, `Sink.dropUntilEffect`, `Sink.dropWhile`, `Sink.dropWhileEffect`, `Sink.filterInput`, `Sink.filterInputEffect`, `Sink.foldWeighted`, `Sink.foldWeightedDecompose`, `Sink.foldWeightedDecomposeEffect`, `Sink.foldWeightedEffect`, `Sink.race`, `Sink.raceBoth`, `Sink.raceWith`, `Sink.splitWhere`
- `effect/SortedMap`: `SortedMap.getOrder`
- `effect/Stream`: `Stream.accumulateChunks`, `Stream.broadcastedQueues`, `Stream.broadcastedQueuesDynamic`, `Stream.distributedWith`, `Stream.distributedWithDynamic`, `Stream.filterMapWhileEffect`, `Stream.fromEffectOption`, `Stream.fromTPubSub`, `Stream.fromTQueue`, `Stream.mergeWithTag`, `Stream.provideServiceStream`, `Stream.repeatEither`, `Stream.repeatElementsWith`, `Stream.repeatWith`, `Stream.runFoldWhile`, `Stream.runFoldWhileEffect`, `Stream.runFoldWhileScoped`, `Stream.runFoldWhileScopedEffect`, `Stream.scheduleWith`, `Stream.some`, `Stream.splitOnChunk`, `Stream.whenCase`, `Stream.whenCaseEffect`, `Stream.zipAll`, `Stream.zipAllLeft`, `Stream.zipAllRight`, `Stream.zipAllSortedByKey`, `Stream.zipAllSortedByKeyLeft`, `Stream.zipAllSortedByKeyRight`, `Stream.zipAllSortedByKeyWith`, `Stream.zipAllWith`
- `effect/StreamHaltStrategy`: `StreamHaltStrategy.fromInput`
- `effect/Subscribable`: `Subscribable.isSubscribable`
- `effect/Supervisor`: `Supervisor.AbstractSupervisor`, `Supervisor.Supervisor`, `Supervisor.addSupervisor`, `Supervisor.fromEffect`, `Supervisor.none`
- `effect/TMap`: `TMap.takeFirst`, `TMap.takeFirstSTM`, `TMap.takeSome`, `TMap.takeSomeSTM`
- `effect/TQueue`: `TQueue.seek`
- `effect/TRandom`: `TRandom.TRandom`, `TRandom.live`*
- `effect/TReentrantLock`: `TReentrantLock.TReentrantLock.Proto`, `TReentrantLock.fiberReadLocks`, `TReentrantLock.fiberWriteLocks`
- `effect/TSemaphore`: `TSemaphore.TSemaphore.Proto`, `TSemaphore.unsafeMake`
- `effect/TSet`: `TSet.takeFirst`, `TSet.takeFirstSTM`, `TSet.takeSome`, `TSet.takeSomeSTM`
- `effect/Take`: `Take.make`
- `effect/TestClock`: `TestClock.save`, `TestClock.sleeps`, `TestClock.live`*
- `effect/TestConfig`: `TestConfig.TestConfig`
- `effect/TestLive`: `TestLive.TestLive`
- `effect/TestServices`: `TestServices.annotate`, `TestServices.annotations`, `TestServices.annotationsLayer`, `TestServices.annotationsWith`, `TestServices.get`, `TestServices.liveLayer`, `TestServices.liveServices`, `TestServices.supervisedFibers`, `TestServices.testConfig`, `TestServices.testConfigLayer`, `TestServices.testConfigWith`, `TestServices.withAnnotations`, `TestServices.withAnnotationsScoped`, `TestServices.withLiveScoped`, `TestServices.withTestConfig`, `TestServices.withTestConfigScoped`, `TestServices.live`*
- `effect/Tuple`: `Tuple.TupleTypeLambda`
- `effect/Utils`: `Utils.Adapter`, `Utils.GenKind`, `Utils.GenKindImpl`, `Utils.PCGRandomState`, `Utils.YieldWrap`, `Utils.adapter`, `Utils.internalCall` (still in the 4.0.0 source and runtime exports, marked `@internal` and absent from the type declarations: not public API), `Utils.isGenKind`, `Utils.isGeneratorFunction`, `Utils.makeGenKind`, `Utils.structuralRegion`, `Utils.structuralRegionState`, `Utils.yieldWrapGet`
- `@effect/platform/Command`: `Command.flatten`
- `@effect/platform/FileSystem`: `FileSystem.File.Descriptor`, `FileSystem.FileDescriptor`
- `@effect/platform/HttpLayerRouter`: `HttpLayerRouter.FindMyWay`*
- `@effect/platform/HttpRouter`: `HttpRouter.HttpRouter.DefaultServices`, `HttpRouter.Tag`
- `@effect/platform/HttpServer`: `HttpServer.ServeOptions`
- `@effect/platform/HttpServerRequest`: `HttpServerRequest.withMaxBodySize`*, `HttpServerRequest.upgrade`*
