/** Validated incoming Official API cart. No total or payment status is inferred.
 * A malformed line causes the backend to omit the entire cart.
 */
export interface IncomingOrderCart {
  readonly catalogId: string;
  readonly text?: string;
  readonly items: readonly {
    readonly productRetailerId: string;
    readonly quantity: number;
    readonly itemPrice: number;
    readonly currency: string;
  }[];
}
