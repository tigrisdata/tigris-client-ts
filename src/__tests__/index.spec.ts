import * as tigris from "../index";

const EXPECTED_EXPORTS = [
	"CacheDelResponse",
	"CacheGetResponse",
	"CacheGetSetResponse",
	"CacheMetadata",
	"CacheSetResponse",
	"Case",
	"Collection",
	"CollectionDescription",
	"CollectionInfo",
	"CollectionMetadata",
	"CollectionOptions",
	"CommitTransactionResponse",
	"CreateBranchResponse",
	"Cursor",
	"DB",
	"DMLMetadata",
	"DatabaseDescription",
	"DatabaseInfo",
	"DatabaseMetadata",
	"DatabaseOptions",
	"DeleteBranchResponse",
	"DeleteCacheResponse",
	"DeleteIndexResponse",
	"DeleteQueryOptions",
	"DeleteResponse",
	"DocMeta",
	"DocStatus",
	"DropCollectionResponse",
	"FacetCount",
	"FacetStats",
	"Field",
	"FindQueryOptions",
	"GeneratedField",
	"IndexInfo",
	"IndexedDoc",
	"ListCachesResponse",
	"MATCH_ALL_QUERY_STRING",
	"Page",
	"PrimaryKey",
	"RollbackTransactionResponse",
	"Search",
	"SearchField",
	"SearchIndex",
	"SearchIterator",
	"SearchMeta",
	"SearchResult",
	"ServerMetadata",
	"Session",
	"Status",
	"TextMatchInfo",
	"Tigris",
	"TigrisCollection",
	"TigrisDataTypes",
	"TigrisSearchIndex",
	"TransactionOptions",
	"TransactionResponse",
	"UpdateQueryOptions",
	"UpdateResponse",
	"WriteOptions",
];

// we are using * exports for files, this test ensures that no unwanted export gets added to package entry path
describe("tigris entrypaths", () => {
	it("should export only expected paths", () => {
		const actualExports = Object.keys(tigris).sort();
		expect(actualExports).toStrictEqual(EXPECTED_EXPORTS);
	});
});
