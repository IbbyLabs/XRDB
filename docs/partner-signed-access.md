# Partner Signed Access Guide

Use this guide to set up and call XRDB partner signed access for server to server integrations.

## Why this exists

Partner traffic often comes from one backend IP serving many users. Signed partner access lets XRDB apply elevated and isolated rate limits per partner and blocks copied client traffic from reusing those limits.

## What to configure

Set this environment variable:

- `XRDB_PARTNER_ACCESS_KEYS`

Each entry format:

`partnerId:secret:perMinute:burst`

Multiple entries can be separated by commas, semicolons, or newlines.

Example:

```env
XRDB_PARTNER_ACCESS_KEYS=partnerone:randomsecretvalue:240:80,partnertwo:anothersecretvalue:180:60
```

Field details:

- `partnerId`: stable partner identifier sent in request headers.
- `secret`: shared HMAC secret known only to XRDB and the partner backend.
- `perMinute`: sustained request budget per minute.
- `burst`: short spike allowance before `429` responses.

## Request contract

Partner requests should include all headers below:

- `X-XRDB-Partner-Id`
- `X-XRDB-Timestamp` (unix seconds)
- `X-XRDB-Nonce` (single use random value)
- `X-XRDB-Signature` (HMAC SHA-256 hex)

The canonical payload is:

```text
METHOD
PATH_WITH_QUERY
TIMESTAMP
NONCE
```

Notes:

- `METHOD` is uppercase, for example `GET`.
- `PATH_WITH_QUERY` must match the exact request path and query string sent to XRDB.
- `TIMESTAMP` and `NONCE` must be the same values sent in headers.

## Signing example (Node.js)

```js
import crypto from 'node:crypto';

function buildSignedHeaders({ method, pathWithQuery, partnerId, secret }) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = [method.toUpperCase(), pathWithQuery, timestamp, nonce].join('\n');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  return {
    'X-XRDB-Partner-Id': partnerId,
    'X-XRDB-Timestamp': timestamp,
    'X-XRDB-Nonce': nonce,
    'X-XRDB-Signature': signature,
  };
}
```

## Expected behavior

- `200`: request accepted.
- `401`: missing or invalid partner headers, signature mismatch, invalid timestamp, or replayed nonce.
- `429`: partner bucket exhausted. Respect `Retry-After` before retrying.

## Security expectations

- Send signed requests from the partner backend only, never from browser code.
- Keep secrets out of logs and client responses.
- Use long random secrets (at least 32 bytes of entropy).
- Rotate secrets periodically by replacing the env value and restarting XRDB.
- Keep backend clock synchronized (NTP) to avoid timestamp window rejections.

## Fallback behavior

If partner headers are not sent, XRDB uses normal request key protection (`XRDB_REQUEST_API_KEY` or `XRDB_REQUEST_API_KEYS`) when configured.

## Quick verification checklist

1. Configure a partner entry in env and restart XRDB.
2. Send a signed request and confirm it succeeds.
3. Reuse the same nonce and confirm XRDB rejects it.
4. Send an intentionally invalid signature and confirm `401`.
5. Burst above the configured limit and confirm `429` with `Retry-After`.
