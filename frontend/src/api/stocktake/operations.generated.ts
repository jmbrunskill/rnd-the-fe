import type * as Types from '../schema-types';

import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type StocktakeRowFragment = { __typename: 'StocktakeNode', id: string, comment?: string | null, description?: string | null, createdDatetime: string, finalisedDatetime?: string | null, stocktakeNumber: number, status: Types.StocktakeNodeStatus, isLocked: boolean, isInitialStocktake: boolean };

export type StocktakesQueryVariables = Types.Exact<{
  storeId: Types.Scalars['String']['input'];
  filter?: Types.InputMaybe<Types.StocktakeFilterInput>;
  page?: Types.InputMaybe<Types.PaginationInput>;
  sort?: Types.InputMaybe<Array<Types.StocktakeSortInput> | Types.StocktakeSortInput>;
}>;


export type StocktakesQuery = { __typename: 'Queries', stocktakes: { __typename: 'StocktakeConnector', totalCount: number, nodes: Array<{ __typename: 'StocktakeNode', id: string, comment?: string | null, description?: string | null, createdDatetime: string, finalisedDatetime?: string | null, stocktakeNumber: number, status: Types.StocktakeNodeStatus, isLocked: boolean, isInitialStocktake: boolean }> } };

export type StocktakeLineFragment = { __typename: 'StocktakeLineNode', id: string, itemName: string, batch?: string | null, expiryDate?: string | null, manufactureDate?: string | null, packSize?: number | null, snapshotNumberOfPacks: number, countedNumberOfPacks?: number | null, comment?: string | null, donorName?: string | null, location?: { __typename: 'LocationNode', code: string } | null, item: { __typename: 'ItemNode', code: string, unitName?: string | null, isVaccine: boolean, doses: number, defaultPackSize: number }, reasonOption?: { __typename: 'ReasonOptionNode', reason: string } | null, manufacturer?: { __typename: 'NameNode', name: string } | null };

export type StocktakeFragment = { __typename: 'StocktakeNode', id: string, comment?: string | null, description?: string | null, createdDatetime: string, finalisedDatetime?: string | null, stocktakeNumber: number, status: Types.StocktakeNodeStatus, isLocked: boolean, isInitialStocktake: boolean, lines: { __typename: 'StocktakeLineConnector', totalCount: number, nodes: Array<{ __typename: 'StocktakeLineNode', id: string, itemName: string, batch?: string | null, expiryDate?: string | null, manufactureDate?: string | null, packSize?: number | null, snapshotNumberOfPacks: number, countedNumberOfPacks?: number | null, comment?: string | null, donorName?: string | null, location?: { __typename: 'LocationNode', code: string } | null, item: { __typename: 'ItemNode', code: string, unitName?: string | null, isVaccine: boolean, doses: number, defaultPackSize: number }, reasonOption?: { __typename: 'ReasonOptionNode', reason: string } | null, manufacturer?: { __typename: 'NameNode', name: string } | null }> } };

export type StocktakeQueryVariables = Types.Exact<{
  stocktakeId: Types.Scalars['String']['input'];
  storeId: Types.Scalars['String']['input'];
}>;


export type StocktakeQuery = { __typename: 'Queries', stocktake: { __typename: 'NodeError' } | { __typename: 'StocktakeNode', id: string, comment?: string | null, description?: string | null, createdDatetime: string, finalisedDatetime?: string | null, stocktakeNumber: number, status: Types.StocktakeNodeStatus, isLocked: boolean, isInitialStocktake: boolean, lines: { __typename: 'StocktakeLineConnector', totalCount: number, nodes: Array<{ __typename: 'StocktakeLineNode', id: string, itemName: string, batch?: string | null, expiryDate?: string | null, manufactureDate?: string | null, packSize?: number | null, snapshotNumberOfPacks: number, countedNumberOfPacks?: number | null, comment?: string | null, donorName?: string | null, location?: { __typename: 'LocationNode', code: string } | null, item: { __typename: 'ItemNode', code: string, unitName?: string | null, isVaccine: boolean, doses: number, defaultPackSize: number }, reasonOption?: { __typename: 'ReasonOptionNode', reason: string } | null, manufacturer?: { __typename: 'NameNode', name: string } | null }> } }, preferences: { __typename: 'PreferencesNode', manageVaccinesInDoses: boolean, allowTrackingOfStockByDonor: boolean } };

export type DeleteStocktakeLinesMutationVariables = Types.Exact<{
  storeId: Types.Scalars['String']['input'];
  ids?: Types.InputMaybe<Array<Types.DeleteStocktakeLineInput> | Types.DeleteStocktakeLineInput>;
}>;


export type DeleteStocktakeLinesMutation = { __typename: 'Mutations', batchStocktake: { __typename: 'BatchStocktakeResponse', deleteStocktakeLines?: Array<{ __typename: 'DeleteStocktakeLineResponseWithId', id: string, response: { __typename: 'DeleteResponse', id: string } | { __typename: 'DeleteStocktakeLineError', error: { __typename: 'CannotEditStocktake', description: string } } }> | null } };

export type UpdateStocktakeLineMutationVariables = Types.Exact<{
  storeId: Types.Scalars['String']['input'];
  input?: Types.InputMaybe<Array<Types.UpdateStocktakeLineInput> | Types.UpdateStocktakeLineInput>;
}>;


export type UpdateStocktakeLineMutation = { __typename: 'Mutations', batchStocktake: { __typename: 'BatchStocktakeResponse', updateStocktakeLines?: Array<{ __typename: 'UpdateStocktakeLineResponseWithId', id: string, response: { __typename: 'StocktakeLineNode', id: string, itemName: string, batch?: string | null, expiryDate?: string | null, manufactureDate?: string | null, packSize?: number | null, snapshotNumberOfPacks: number, countedNumberOfPacks?: number | null, comment?: string | null, donorName?: string | null, location?: { __typename: 'LocationNode', code: string } | null, item: { __typename: 'ItemNode', code: string, unitName?: string | null, isVaccine: boolean, doses: number, defaultPackSize: number }, reasonOption?: { __typename: 'ReasonOptionNode', reason: string } | null, manufacturer?: { __typename: 'NameNode', name: string } | null } | { __typename: 'UpdateStocktakeLineError', error: { __typename: 'AdjustmentReasonNotProvided', description: string } | { __typename: 'AdjustmentReasonNotValid', description: string } | { __typename: 'CannotEditStocktake', description: string } | { __typename: 'SnapshotCountCurrentCountMismatchLine', description: string } | { __typename: 'StockLineReducedBelowZero', description: string } } }> | null } };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}
export const StocktakeRowFragmentDoc = new TypedDocumentString(`
    fragment StocktakeRow on StocktakeNode {
  __typename
  id
  comment
  description
  createdDatetime
  finalisedDatetime
  stocktakeNumber
  status
  isLocked
  isInitialStocktake
}
    `, {"fragmentName":"StocktakeRow"}) as unknown as TypedDocumentString<StocktakeRowFragment, unknown>;
export const StocktakeLineFragmentDoc = new TypedDocumentString(`
    fragment StocktakeLine on StocktakeLineNode {
  __typename
  id
  itemName
  batch
  expiryDate
  manufactureDate
  packSize
  snapshotNumberOfPacks
  countedNumberOfPacks
  comment
  donorName
  location {
    code
  }
  item {
    code
    unitName
    isVaccine
    doses
    defaultPackSize
  }
  reasonOption {
    reason
  }
  manufacturer(storeId: $storeId) {
    name
  }
}
    `, {"fragmentName":"StocktakeLine"}) as unknown as TypedDocumentString<StocktakeLineFragment, unknown>;
export const StocktakeFragmentDoc = new TypedDocumentString(`
    fragment Stocktake on StocktakeNode {
  __typename
  ...StocktakeRow
  lines {
    totalCount
    nodes {
      ...StocktakeLine
    }
  }
}
    fragment StocktakeRow on StocktakeNode {
  __typename
  id
  comment
  description
  createdDatetime
  finalisedDatetime
  stocktakeNumber
  status
  isLocked
  isInitialStocktake
}
fragment StocktakeLine on StocktakeLineNode {
  __typename
  id
  itemName
  batch
  expiryDate
  manufactureDate
  packSize
  snapshotNumberOfPacks
  countedNumberOfPacks
  comment
  donorName
  location {
    code
  }
  item {
    code
    unitName
    isVaccine
    doses
    defaultPackSize
  }
  reasonOption {
    reason
  }
  manufacturer(storeId: $storeId) {
    name
  }
}`, {"fragmentName":"Stocktake"}) as unknown as TypedDocumentString<StocktakeFragment, unknown>;
export const StocktakesDocument = new TypedDocumentString(`
    query stocktakes($storeId: String!, $filter: StocktakeFilterInput, $page: PaginationInput, $sort: [StocktakeSortInput!]) {
  stocktakes(storeId: $storeId, filter: $filter, page: $page, sort: $sort) {
    __typename
    ... on StocktakeConnector {
      totalCount
      nodes {
        ...StocktakeRow
      }
    }
  }
}
    fragment StocktakeRow on StocktakeNode {
  __typename
  id
  comment
  description
  createdDatetime
  finalisedDatetime
  stocktakeNumber
  status
  isLocked
  isInitialStocktake
}`) as unknown as TypedDocumentString<StocktakesQuery, StocktakesQueryVariables>;
export const StocktakeDocument = new TypedDocumentString(`
    query stocktake($stocktakeId: String!, $storeId: String!) {
  stocktake(id: $stocktakeId, storeId: $storeId) {
    __typename
    ... on StocktakeNode {
      ...Stocktake
    }
  }
  preferences(storeId: $storeId) {
    manageVaccinesInDoses
    allowTrackingOfStockByDonor
  }
}
    fragment StocktakeRow on StocktakeNode {
  __typename
  id
  comment
  description
  createdDatetime
  finalisedDatetime
  stocktakeNumber
  status
  isLocked
  isInitialStocktake
}
fragment StocktakeLine on StocktakeLineNode {
  __typename
  id
  itemName
  batch
  expiryDate
  manufactureDate
  packSize
  snapshotNumberOfPacks
  countedNumberOfPacks
  comment
  donorName
  location {
    code
  }
  item {
    code
    unitName
    isVaccine
    doses
    defaultPackSize
  }
  reasonOption {
    reason
  }
  manufacturer(storeId: $storeId) {
    name
  }
}
fragment Stocktake on StocktakeNode {
  __typename
  ...StocktakeRow
  lines {
    totalCount
    nodes {
      ...StocktakeLine
    }
  }
}`) as unknown as TypedDocumentString<StocktakeQuery, StocktakeQueryVariables>;
export const DeleteStocktakeLinesDocument = new TypedDocumentString(`
    mutation deleteStocktakeLines($storeId: String!, $ids: [DeleteStocktakeLineInput!]) {
  batchStocktake(storeId: $storeId, input: {deleteStocktakeLines: $ids}) {
    __typename
    ... on BatchStocktakeResponse {
      deleteStocktakeLines {
        id
        response {
          __typename
          ... on DeleteResponse {
            id
          }
          ... on DeleteStocktakeLineError {
            error {
              description
            }
          }
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<DeleteStocktakeLinesMutation, DeleteStocktakeLinesMutationVariables>;
export const UpdateStocktakeLineDocument = new TypedDocumentString(`
    mutation updateStocktakeLine($storeId: String!, $input: [UpdateStocktakeLineInput!]) {
  batchStocktake(storeId: $storeId, input: {updateStocktakeLines: $input}) {
    __typename
    ... on BatchStocktakeResponse {
      updateStocktakeLines {
        id
        response {
          __typename
          ... on StocktakeLineNode {
            ...StocktakeLine
          }
          ... on UpdateStocktakeLineError {
            error {
              description
            }
          }
        }
      }
    }
  }
}
    fragment StocktakeLine on StocktakeLineNode {
  __typename
  id
  itemName
  batch
  expiryDate
  manufactureDate
  packSize
  snapshotNumberOfPacks
  countedNumberOfPacks
  comment
  donorName
  location {
    code
  }
  item {
    code
    unitName
    isVaccine
    doses
    defaultPackSize
  }
  reasonOption {
    reason
  }
  manufacturer(storeId: $storeId) {
    name
  }
}`) as unknown as TypedDocumentString<UpdateStocktakeLineMutation, UpdateStocktakeLineMutationVariables>;