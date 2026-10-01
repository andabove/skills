# Worked example: one module, before and after

One module taken through the steps in [SKILL.md](../SKILL.md): the old Promise code, the test file that does not change, and the breaks that prove the tests. The Effect version is the edge example in SKILL.md.

## The old module

The function retries a 5xx twice with a fixed delay, wraps the last fault, and honours the caller's signal.

```ts
interface Invoice {
  readonly id: string
  readonly total: number
}
interface InvoiceClient {
  get(id: string, options: { readonly signal?: AbortSignal | undefined }): Promise<Invoice>
}
declare const isTransient: (error: unknown) => boolean

export class InvoiceLoadError extends Error {
  override name = "InvoiceLoadError"
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })

export async function loadInvoice(
  client: InvoiceClient,
  id: string,
  options: { readonly signal?: AbortSignal } = {}
): Promise<Invoice> {
  options.signal?.throwIfAborted()
  for (let attempt = 1; ; attempt++) {
    try {
      return await client.get(id, { signal: options.signal })
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason
      if (!isTransient(error) || attempt === 3) {
        throw new InvoiceLoadError(`could not load invoice ${id}`, { cause: error })
      }
      await sleep(100, options.signal)
    }
  }
}
```

## The tests, moved first

The tests call `loadInvoice` as production does and pass a fake client through its parameter. The fake records the signal of each call, and a hanging call rejects when its own signal aborts, as a real client does. Commit this file while it passes on the old module. It does not change again.

```ts
import { describe, expect, it } from "vitest"

interface Invoice {
  readonly id: string
  readonly total: number
}
interface InvoiceClient {
  get(id: string, options: { readonly signal?: AbortSignal | undefined }): Promise<Invoice>
}
class HttpError extends Error {
  override name = "HttpError"
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}
// In the project these come from the module under test and its client.
declare function loadInvoice(
  client: InvoiceClient,
  id: string,
  options?: { readonly signal?: AbortSignal }
): Promise<Invoice>

const invoice: Invoice = { id: "in_1", total: 42 }

const fakeClient = (answers: Array<"ok" | "hang" | Error>) => {
  const signals: Array<AbortSignal | undefined> = []
  const client: InvoiceClient = {
    get(_id, { signal }) {
      signals.push(signal)
      const answer = answers[signals.length - 1] ?? "ok"
      if (answer === "ok") return Promise.resolve(invoice)
      if (answer === "hang") {
        return new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true })
        })
      }
      return Promise.reject(answer)
    }
  }
  return { client, signals }
}

describe("loadInvoice", () => {
  it("retries a 503 and succeeds", async () => {
    const { client, signals } = fakeClient([new HttpError(503), "ok"])
    await expect(loadInvoice(client, "in_1")).resolves.toEqual(invoice)
    expect(signals).toHaveLength(2)
  })

  it("gives up after three attempts and keeps the last fault as cause", async () => {
    const last = new HttpError(503)
    const { client, signals } = fakeClient([new HttpError(503), new HttpError(503), last])
    await expect(loadInvoice(client, "in_1")).rejects.toMatchObject({ name: "InvoiceLoadError", cause: last })
    expect(signals).toHaveLength(3)
  })

  it("does not retry a 404", async () => {
    const notFound = new HttpError(404)
    const { client, signals } = fakeClient([notFound])
    await expect(loadInvoice(client, "in_1")).rejects.toMatchObject({ name: "InvoiceLoadError", cause: notFound })
    expect(signals).toHaveLength(1)
  })

  it("aborts the call when the caller aborts", async () => {
    const { client, signals } = fakeClient(["hang"])
    const controller = new AbortController()
    const pending = loadInvoice(client, "in_1", { signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 5))
    controller.abort(new Error("caller went away"))
    await expect(pending).rejects.toThrow("caller went away")
    expect(signals[0]?.aborted).toBe(true)
  })

  it("starts no call when the signal is already aborted", async () => {
    const { client, signals } = fakeClient(["ok"])
    const signal = AbortSignal.abort(new Error("gone"))
    await expect(loadInvoice(client, "in_1", { signal })).rejects.toThrow("gone")
    expect(signals).toHaveLength(0)
  })
})
```

## The breaks

Each break is one edit to the Effect module. Each one must fail a test; revert it after the run.

| Break | Edit | Test that fails |
|---|---|---|
| Drop the signal | `try: () => client.get(id, {})` | "aborts the call when the caller aborts", on the signal assertion. The rejection assertion before it still passes. |
| Change the retry count | `times: 3` | "gives up after three attempts": the fourth call succeeds. |
| Retry the wrong fault | `while: () => true` | "does not retry a 404": the second call succeeds. |
| Remove the already-aborted guard | delete `options.signal?.throwIfAborted()` | "starts no call when the signal is already aborted": one call starts. |

The first break is the one that compiles and looks correct in review. Only the assertion on the call's own signal catches it.
