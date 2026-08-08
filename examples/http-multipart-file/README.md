# HTTP Multipart Refund-Evidence Upload

## Problem

A refund service accepts an evidence file plus the fixed purpose `refund_evidence`. The application checks the five MiB size limit before creating the command, then lets Fetch serialize `FormData` so the multipart boundary matches the body.

## Scenario

The runner uploads the 21-byte local file `receipt.txt` to `POST /refund-evidence` after the size check. The fixture uses `Request.formData()` to parse the real multipart request, reads the file and purpose parts, and returns the typed ID `evidence-1042`.

## Approach

Check the `File.size` before command creation, append the file and fixed purpose to `FormData`, and let the platform generate the multipart boundary consumed by the local fixture.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, exported upload operation, native multipart fixture, and runnable demonstration.

## Run

```sh
pnpm --silent --filter @defjs/example-http-multipart-file start
```

Execution is deterministic, local, and exits after one in-memory upload.

## Expected result

```text
{"evidenceId":"evidence-1042","fileName":"receipt.txt","bytes":21,"purpose":"refund_evidence"}
```

Successful `Request.formData()` parsing demonstrates that Fetch supplied matching multipart framing without exposing the generated boundary value.

## Inspiration

- [RFC 7578 section 4.1](https://www.rfc-editor.org/rfc/rfc7578.html#section-4.1) requires a multipart boundary parameter that matches the body delimiters.
- [MDN FormData guidance](https://github.com/mdn/content/blob/a9dc3374034d357cbfea717fd5d641605359e3c7/files/en-us/web/api/xmlhttprequest_api/using_formdata_objects/index.md#L131-L155) warns against manually setting the multipart content type because the runtime supplies the boundary.
- [OpenAI Node file creation](https://github.com/openai/openai-node/blob/228c224393ef4bf3bda2a9d7eb40f387499299b5/src/resources/files.ts#L47-L51) provides an SDK example of a multipart file-plus-purpose operation.
