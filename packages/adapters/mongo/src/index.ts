// =============================================================================
// @onegrid/mongo
//
// MongoDB adapter for oneGrid SSRM. Translates BlockRequest into
// find / aggregation-pipeline calls; ships a change-streams-backed
// CDC adapter that conforms to the universal row-diff stream shape.
//
// No peer dep — the consumer adapts whichever Mongo client they use
// (the official `mongodb` driver, mongoose's underlying collection,
// etc.) to the small `MongoCollection` / `MongoCollectionForCdc`
// interfaces.
// =============================================================================

export { createMongoDataSource } from './datasource';
export type {
  MongoCollection,
  MongoDataSourceOptions,
} from './datasource';

export { createMongoCdcAdapter } from './cdc';
export type {
  MongoCdcAdapter,
  MongoCdcAdapterOptions,
  MongoChangeEvent,
  MongoChangeStream,
  MongoCollectionForCdc,
  ResumeToken,
} from './cdc';

export {
  compileBlockQuery,
  encodeKeysetCursor,
  decodeKeysetCursor,
  isKeysetCursor,
  isLegacyOffsetCursor,
} from './query';
export type {
  CompiledQuery,
  CompiledFlatQuery,
  CompiledAggregateQuery,
  MongoCollectionDescriptor,
} from './query';
