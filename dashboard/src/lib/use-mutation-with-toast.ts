import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

type ToastMessage = string | ((data: unknown) => string);

type ToastConfig = {
  success?: ToastMessage;
  error?: ToastMessage | ((err: unknown) => string);
};

type AnyMutationOptions = {
  onSuccess?: (...args: unknown[]) => void;
  onError?: (...args: unknown[]) => void;
  // Allow all other useMutation options to pass through unchecked
  [key: string]: unknown;
};

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong";
}

/**
 * Wrap a useMutation call with automatic toast notifications.
 *
 * Usage:
 *   const myMutation = useMutationWithToast(
 *     trpc.foo.bar.mutationOptions({ onSuccess: () => {...} }),
 *     { success: "Done!", error: "Failed" }
 *   );
 */
export function useMutationWithToast(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any,
  toastConfig: ToastConfig = {},
) {
  const { onSuccess, onError, ...rest } = options as AnyMutationOptions;
  const { success, error } = toastConfig;

  return useMutation({
    ...rest,
    onSuccess: (...args: unknown[]) => {
      if (success) {
        const data = args[0];
        const msg = typeof success === "function" ? success(data) : success;
        if (msg) toast.success(msg);
      }
      if (onSuccess) onSuccess(...args);
    },
    onError: (...args: unknown[]) => {
      if (error) {
        const err = args[0];
        const msg = typeof error === "function" ? error(err) : error;
        toast.error(msg || formatError(err));
      } else {
        toast.error(formatError(args[0]));
      }
      if (onError) onError(...args);
    },
  });
}

export type { ToastConfig };
