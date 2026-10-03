import { PolymorfaValidationError } from "../errors.js";

export type BillingScope = "project" | "customer" | "number";
export interface BillingPriority {
  readonly id: string;
  readonly name: string;
  readonly priority: number;
}
export interface BillingPriorities {
  readonly revision: number;
  readonly projects: readonly BillingPriority[];
  readonly customers: readonly (BillingPriority & {
    readonly projectId: string;
  })[];
  readonly numbers: readonly (BillingPriority & {
    readonly projectId: string;
  })[];
}
export interface BillingLimit {
  readonly scope: BillingScope;
  readonly resourceId: string;
  readonly projectId: string;
  readonly name: string;
  readonly limitCredits: number | null;
  readonly spentCredits: number;
  readonly reservedCredits: number;
  readonly revision: number;
}
export interface BillingLimits {
  readonly checkedAt: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly todayCredits: number;
  readonly monthCredits: number;
  readonly daily: readonly {
    readonly date: string;
    readonly credits: number;
  }[];
  readonly budgets: readonly BillingLimit[];
}
export type ReorderBillingPrioritiesInput =
  | {
      readonly scope: "resource";
      readonly projectId: string;
      readonly resources: readonly {
        readonly scope: "customer" | "number";
        readonly resourceId: string;
      }[];
      readonly expectedRevision: number;
    }
  | {
      readonly scope: "project";
      readonly resourceIds: readonly string[];
      readonly expectedRevision: number;
    }
  | {
      readonly scope: "customer" | "number";
      readonly projectId: string;
      readonly resourceIds: readonly string[];
      readonly expectedRevision: number;
    };
export function billingId(value: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    invalid("resource must be a UUID");
  return value.toLowerCase();
}
export function billingRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2147483646)
    invalid("expectedRevision must be a nonnegative integer");
}
export function billingScope(value: BillingScope): void {
  if (value !== "project" && value !== "customer" && value !== "number")
    invalid("scope must be project, customer or number");
}
export function billingPriority(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 1000000)
    invalid("priority must be an integer from 0 to 1000000");
}
export function billingLimit(value: number | null): void {
  if (
    value !== null &&
    (!Number.isFinite(value) ||
      value < 0 ||
      value > 1000000 ||
      !/^\d+(\.\d{1,6})?$/.test(String(value)))
  )
    invalid(
      "limitCredits must be null or 0–1000000 credits with at most six decimal places",
    );
}
function invalid(message: string): never {
  throw new PolymorfaValidationError(message, {
    code: "invalid_billing_control",
  });
}

export interface ResourceBillingControls {
  readonly budget: BillingLimit;
  readonly priority: number;
  readonly priorityRevision: number;
}
