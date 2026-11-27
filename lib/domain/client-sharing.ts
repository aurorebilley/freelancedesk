import { BusinessError, checkFields, object } from "./validation.ts";

export const sharePermissions = { read: "Lecture seule", edit: "Modification" } as const;
export type SharePermission = keyof typeof sharePermissions;

export interface ClientShare {
  clientId: string;
  ownerId: string;
  sharedUserId: string;
  ownerEmail: string;
  sharedUserEmail: string;
  permission: SharePermission;
}

export function isSharePermission(value: unknown): value is SharePermission {
  return value === "read" || value === "edit";
}

export function validateShare(input: unknown, creation: true): { email: string; permission: SharePermission };
export function validateShare(input: unknown, creation: false): { permission: SharePermission };
export function validateShare(input: unknown, creation: boolean) {
  const data = object(input);
  checkFields(data, creation ? ["email", "permission"] : ["permission"]);
  const { permission } = data;
  if (!isSharePermission(permission)) throw new BusinessError("Le niveau d’accès est invalide.");
  if (!creation) return { permission };
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BusinessError("Saisis une adresse e-mail valide.");
  }
  return { email, permission };
}
