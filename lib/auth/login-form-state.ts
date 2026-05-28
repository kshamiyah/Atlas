export type LoginFormState =
  | { status: "idle" }
  | { status: "success"; email: string }
  | { status: "error"; message: string };

export const initialLoginFormState: LoginFormState = { status: "idle" };
