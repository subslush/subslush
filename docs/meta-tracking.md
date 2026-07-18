# Meta Pixel and Conversions API

The browser Pixel and server-side Conversions API use dataset/pixel ID
`2345279372968113`. The browser ID is intentionally fixed in
`frontend/src/app.html`;
the server dataset defaults to the same value.

## Production configuration

Set these values only in the backend environment:

```dotenv
META_DATASET_ID=2345279372968113
META_CONVERSIONS_API_ACCESS_TOKEN=<token generated in Meta Events Manager>
META_GRAPH_API_VERSION=v25.0
META_TEST_EVENT_CODE=
```

`META_CONVERSIONS_API_ACCESS_TOKEN` must never be exposed through a frontend
environment variable. Without it, browser events continue to work and CAPI is
disabled. `META_TEST_EVENT_CODE` is for Events Manager testing and must be blank
in production.

## Event lifecycle

| Meta event             | Trigger                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PageView`             | Initial document load and subsequent client-side navigation                                                                                      |
| `ViewContent`          | Product detail is viewed                                                                                                                         |
| `Search`               | A non-empty product search is submitted                                                                                                          |
| `AddToCart`            | Either **Add to cart** or **Buy now** adds/selects the product                                                                                   |
| `InitiateCheckout`     | A payment option is selected and the user presses **PAY**; merely opening `/checkout/payment` does not qualify                                   |
| `AddPaymentInfo`       | The selected payment option successfully creates the next payment step/session                                                                   |
| `CompleteRegistration` | The email-confirmation transaction changes `email_verified_at` from null to verified; repeated confirmation visits do not qualify                |
| `Purchase`             | A final provider return/status page receives a successful order state (`in_process`, `paid`, or `delivered`) after webhook/provider confirmation |

There is no wishlist action in the current product, so `AddToWishlist` is not
emitted. Add it only when a real wishlist mutation exists.

## Deduplication and matching

Every browser/server event pair uses the same standard event name and event ID.
The Pixel sends the ID as `eventID`; CAPI sends it as `event_id`. Purchase IDs
are stable per order, so refreshing a successful return page does not count a
second purchase.

CAPI sends normalized SHA-256 email, phone when available, and external user or
guest ID. Client IP, user agent, `_fbp`, and `_fbc` remain unhashed as required
by Meta. The access token is never logged.

Meta references:

- [Server event parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event)
- [Pixel/CAPI event deduplication](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events)

## Release verification

1. Deploy the backend with a generated CAPI access token and, in staging only,
   an Events Manager test-event code.
2. In Events Manager **Test Events**, exercise each lifecycle action and verify
   one browser event and one server event share the same event ID.
3. Verify pending, cancelled, and failed provider returns emit no `Purchase`.
4. Remove the test-event code before production traffic.
5. Monitor deduplication rate, event match quality, coverage, and freshness.
