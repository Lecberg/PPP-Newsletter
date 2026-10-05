export class PortalError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export class BrevoError extends Error {
  constructor(public status: number, public definite: boolean, message: string) { super(message); }
}
