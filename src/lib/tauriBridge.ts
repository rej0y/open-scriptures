export type InvokeFunction = <T>(
  command: string,
  args?: Record<string, unknown>
) => Promise<T>;

type GlobalInvokeHost = typeof globalThis & {
  __OPEN_SCRIPTURES_INVOKE__?: InvokeFunction;
};

let cachedInvoke: InvokeFunction | null = null;

async function resolveInvoke() {
  const override = (globalThis as GlobalInvokeHost).__OPEN_SCRIPTURES_INVOKE__;
  if (override) return override;

  if (!cachedInvoke) {
    const tauri = await import('@tauri-apps/api/core');
    cachedInvoke = tauri.invoke as InvokeFunction;
  }

  return cachedInvoke;
}

export async function invoke<T>(command: string, args?: Record<string, unknown>) {
  const fn = await resolveInvoke();
  return fn<T>(command, args);
}
