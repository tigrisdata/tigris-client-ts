import {Metadata} from "@grpc/grpc-js";
import json_bigint from "json-bigint";
import {TransactionCtx as ProtoTransactionCtx} from "./proto/server/v1/api_pb";
import {Session} from "./session";
import {
	LogicalFilter,
	ReadFields,
	SelectorFilter,
	SelectorFilterOperator,
	TigrisCollectionType,
	TigrisDataTypes,
	TigrisSchema,
	UpdateFields
} from "./types";
import * as fs from "fs";

export const Utility = {
	stringToUint8Array(input: string): Uint8Array {
		return new TextEncoder().encode(input);
	},

	uint8ArrayToString(input: Uint8Array): string {
		return new TextDecoder().decode(input);
	},

	filterToString<T>(filter: SelectorFilter<T> | LogicalFilter<T>): string {
		// eslint-disable-next-line no-prototype-builtins
		return filter.hasOwnProperty("logicalOperator")
			? Utility._logicalFilterToString(filter as LogicalFilter<T>)
			: this.objToJsonString(this._selectorFilterToJSONObj(filter as SelectorFilter<T>));
	},

	_selectorFilterToString<T extends TigrisCollectionType>(filter: SelectorFilter<T>): string {
		if (filter.op == SelectorFilterOperator.EQ) {
			return Utility.objToJsonString(Utility._flattenObj(Utility._selectorFilterToJSONObj(filter)))
		}
		return "";
	},

	_selectorFilterToJSONObj<T>(filter: SelectorFilter<T>): object {
		if (filter.op == SelectorFilterOperator.EQ) {
			return filter.fields
		}
		// add support later
		return {}
	},

	_logicalFilterToString<T>(filter: LogicalFilter<T>): string {
		return this.objToJsonString(Utility._logicalFilterToJSONObj(filter))
	},

	_logicalFilterToJSONObj<T>(filter: LogicalFilter<T>): object {
		const result = {};
		const innerFilters = [];
		result[filter.op] = innerFilters;
		if (filter.selectorFilters) {
			for (const value of filter.selectorFilters) {
				innerFilters.push(Utility._flattenObj(Utility._selectorFilterToJSONObj(value)))
			}
		}
		if (filter.logicalFilters) {
			for (const value of filter.logicalFilters) innerFilters.push(Utility._logicalFilterToJSONObj(value))
		}
		return result;
	},

	readFieldString(readFields: ReadFields): string {
		const include = readFields.include?.reduce((acc, field) => ({...acc, [field]: true}), {});
		const exclude = readFields.exclude?.reduce((acc, field) => ({...acc, [field]: false}), {});

		return this.objToJsonString({...include, ...exclude});
	},

	updateFieldsString(updateFields: UpdateFields) {
		const {operator, fields} = updateFields;

		return this.objToJsonString({
			[operator]: fields,
		});
	},

	objToJsonString(obj: unknown): string {
		const JSONbigNative = json_bigint({useNativeBigInt: true});
		return JSONbigNative.stringify(obj);
	},

	jsonStringToObj<T>(json: string): T {
		const JSONbigNative = json_bigint({useNativeBigInt: true});
		return JSONbigNative.parse(json);
	},

	txApiToProto(tx: Session): ProtoTransactionCtx {
		return new ProtoTransactionCtx().setId(tx.id).setOrigin(tx.origin);
	},

	txToMetadata(tx: Session): Metadata {
		const metadata = new Metadata();
		if (tx) {
			metadata.set("Tigris-Tx-Id", tx.id);
			metadata.set("Tigris-Tx-Origin", tx.origin);
		}
		return metadata;
	},

	/*
	This method converts nested json object to single level object.
	 for example
	 {
		 "name": "Alice",
		 "balance" : 123.123,
		 "address": {
			"city": "San Francisco",
			"state": "California"
		 }
	 }
	 gets converted to
	 {
		 "name": "Alice",
		 "balance" : 123.123,
		 "address.city": "San Francisco",
		 "address.state": "California"
	 }

	 This is used for filter JSON serialization internally.
	*/
	_flattenObj(ob: object): object {
		const toReturn = {};
		for (const key in ob) {
			// eslint-disable-next-line no-prototype-builtins
			if (!ob.hasOwnProperty(key)) continue;

			if ((typeof ob[key]) == 'object' && ob[key] !== null) {
				const flatObject = Utility._flattenObj(ob[key]);
				for (const x in flatObject) {
					// eslint-disable-next-line no-prototype-builtins
					if (!flatObject.hasOwnProperty(x)) continue;

					toReturn[key + '.' + x] = flatObject[x];
				}
			} else {
				toReturn[key] = ob[key];
			}
		}
		return toReturn;
	},

	_toJSONSchema<T>(collectionName: string, schema: TigrisSchema<T>): string {
		const root = {};
		const pkeyMap = {};
		root['title'] = collectionName
		root['additionalProperties'] = false
		root['type'] = 'object';
		root['properties'] = this._getSchemaProperties(schema, pkeyMap);
		Utility._postProcessSchema(root, pkeyMap);
		return Utility.objToJsonString(root);
	},
	/*
	TODO:
	  - validate the user defined schema (for example look for primary keys with duplicate
	  order)
	 - this can be extended for other schema massaging
	 */
	_postProcessSchema(result: object, pkeyMap: object): object {
		if (Object.keys(pkeyMap).length === 0) {
			// if no pkeys was used defined. add implicit pkey
			result['properties']['_id'] = {
				'type': 'string',
				'format': 'uuid'
			}
			result['primary_key'] = ['_id'];
		} else {
			result['primary_key'] = []
			// add primary_key in order
			for (let i = 1; i <= Object.keys(pkeyMap).length; i++) {
				result['primary_key'].push(pkeyMap[i.toString()])
			}
		}
		return result;
	},

	_getSchemaProperties<T>(schema: TigrisSchema<T>, pkeyMap: object): object {
		const properties = {};

		for (const property of Object.keys(schema)) {
			let thisProperty = {};
			// single flat property? OR the property referring to another type (nested collection)
			if (typeof schema[property].type === 'object' || (!(schema[property]['items'] ||schema[property]['type']))) {
				thisProperty['type'] = 'object';
				thisProperty['properties'] = this._getSchemaProperties(schema[property]['type'], pkeyMap)
			}else if (schema[property].type!= TigrisDataTypes.ARRAY.valueOf()
				&& typeof schema[property].type != 'object') {
				thisProperty['type'] = this._getType(schema[property].type);
				const format = this._getFormat(schema[property].type)
				if (format) {
					thisProperty['format'] = format;
				}

				// flat property could be a pkey
				if (schema[property].primary_key) {
					pkeyMap[schema[property].primary_key['order']] = property;
					//  autogenerate?
					if (schema[property].primary_key['autoGenerate']) {
						thisProperty['autoGenerate'] = true;
					}
				}
			// array type?
			} else if (schema[property].type === TigrisDataTypes.ARRAY.valueOf()) {
				thisProperty = this._getArrayBlock(schema[property], pkeyMap)
			}


			properties[property] = thisProperty;
		}
		return properties;
	},

	_getArrayBlock(arraySchema: TigrisSchema<any> | TigrisDataTypes, pkeyMap: object): object {
		const arrayBlock = {}
		arrayBlock['type'] = 'array';
		arrayBlock['items'] = {};
		// array of array?
		if (arraySchema['items']['type']===TigrisDataTypes.ARRAY.valueOf()) {
			arrayBlock['items'] = this._getArrayBlock(arraySchema['items'], pkeyMap)
			// array of custom type?
		} else if (typeof arraySchema['items']['type'] === 'object') {
			arrayBlock['items']['type'] = 'object';
			arrayBlock['items']['properties'] = this._getSchemaProperties(arraySchema['items']['type'], pkeyMap)
			// within array: single flat property?
		} else {
			arrayBlock['items']['type'] = this._getType(arraySchema['items']['type'] as TigrisDataTypes);
			const format = this._getFormat(arraySchema['items']['type']  as TigrisDataTypes);
			if (format) {
				arrayBlock['items']['format'] = format;
			}
		}
		return arrayBlock;
	},

	_getType(fieldType: TigrisDataTypes): string {
		switch (fieldType.valueOf()) {
			case TigrisDataTypes.INT32:
			case TigrisDataTypes.INT64:
			case TigrisDataTypes.NUMBER_BIGINT:
				return 'integer';
			case TigrisDataTypes.NUMBER:
				return 'number';
			case TigrisDataTypes.STRING:
			case TigrisDataTypes.UUID:
			case TigrisDataTypes.DATE_TIME:
			case TigrisDataTypes.BYTE_STRING:
				return 'string';
		}
		return undefined;
	},

	_getFormat(fieldType: TigrisDataTypes): string {
		switch (fieldType.valueOf()) {
			case TigrisDataTypes.INT32:
				return 'int32';
			case TigrisDataTypes.INT64:
				return 'int64';
			case TigrisDataTypes.UUID:
				return 'uuid';
			case TigrisDataTypes.DATE_TIME:
				return 'date-time';
			case TigrisDataTypes.BYTE_STRING:
				return 'byte'
		}
		return undefined;
	},

	_readTestDataFile(path: string): string {
		return Utility.objToJsonString(Utility.jsonStringToObj(fs.readFileSync('src/__tests__/data/'+path, 'utf8')));
	},
	_base64Encode(input: string): string {
		return Buffer.from(input, 'binary').toString('base64');
	},
	_base64Decode(b64String: string): string {
		return Buffer.from(b64String, 'base64').toString('binary');
	},
};