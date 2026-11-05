/** Readiness is checked by the backend before connection activation. Unknown
 * keeps the link pending until cancellation or expiry; clients must not treat it as ready.
 */
export type CloudReadinessFailureCode =
  | "meta_credentials_invalid"
  | "meta_phone_not_registered"
  | "meta_webhook_not_subscribed"
  | "meta_payment_method_missing"
  | "meta_quality_flagged"
  | "meta_readiness_unknown";
