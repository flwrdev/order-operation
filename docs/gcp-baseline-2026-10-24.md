# GCP baseline 2026-10-24

Project `jhay` (ID `jhay-510919`), billing account "Delivery Scheduler" (`017072-6E7F55-594170`).
Source: Google Cloud console, read-only, 2026-10-24. Times are UTC+8 as the console shows them. "ago" is relative to 2026-10-24.
Secret values were not opened.

## IAM (principals, "Include Google-provided role grants" off)
| Principal | Roles |
|---|---|
| `1030649952056-compute@developer.gserviceaccount.com` | Artifactregistry Editor, Cloud Build Editor, Logs Writer, Storage Object Viewer |
| `delivery-scheduler-runtime@jhay-510919.iam.gserviceaccount.com` | Artifact Registry Writer, Cloud Build Editor, Logs Writer, Secret Manager Secret Accessor, Storage Object Viewer |
| `janbradlieapelado-gmail-com@jhay-510919.iam.gserviceaccount.com` | Owner |
| `janbradlieapelado@gmail.com` | Cloud Hub Operator (Beta), Owner (13615/13872 excess permissions) |

## Service accounts (3)
| Email | Status | Keys |
|---|---|---|
| `1030649952056-compute@developer.gserviceaccount.com` | Enabled | none |
| `delivery-scheduler-runtime@jhay-510919.iam.gserviceaccount.com` | Enabled | none |
| `janbradlieapelado-gmail-com@jhay-510919.iam.gserviceaccount.com` | Enabled | none |

## Cloud Run
One service: `delivery-scheduler`, `us-central1`, `https://delivery-scheduler-1030649952056.us-central1.run.app`.

| Revision | Traffic | Deployed |
|---|---|---|
| delivery-scheduler-00009-bw2 | 100% (to latest) | 3 days ago |
| delivery-scheduler-00008-972 | 0% | 7 days ago |
| delivery-scheduler-00007-xgr | 0% | 7 days ago |
| delivery-scheduler-00006-xxv | 0% | 7 days ago |
| delivery-scheduler-00005-8h6 | 0% | 9 days ago |
| delivery-scheduler-00004-2qx | 0% | 11 days ago |
| delivery-scheduler-host-fix-1013 | 0% | 12 days ago |
| delivery-scheduler-00002-2t6 | 0% | 12 days ago |
| delivery-scheduler-00001-9mz | 0% | 12 days ago |

Revision `00009-bw2`: deployed by janbradlieapelado@gmail.com using gcloud. Request-based billing, startup CPU boost enabled, concurrency 80, timeout 300 s, max instances 2, CPU 1, memory 512MiB, port 8080, build via Cloud Build. Image `us-central1-docker.pkg.dev/jhay-510919/cloud-run-source-deploy/delivery-scheduler@sha256:7ac854e3db16823a437b0e7b40c1d968c8a1e3f673e85171cabd70ccbf056b1d`. Source `gs://run-sources-jhay-510919-us-central1/services/delivery-scheduler/1792542115.514462-2a31b8eed3d8426ea1161d4a16d9eaa7.zip`. Volumes 0, health checks 1, Cloud SQL connections 0.

Environment variables (14):
| Name | Source |
|---|---|
| SHOPIFY_API_KEY | plain |
| SHOPIFY_APP_URL | plain |
| SHOP_DOMAIN | plain |
| SCOPES | plain: read_orders,write_orders,write_order_edits,read_customers,write_products,write_payment_customizations,read_metaobjects,write_metaobjects,write_metaobject_definitions,read_fulfillments,write_fulfillments,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders,write_files,read_files,read_draft_orders,write_draft_orders |
| SHOPIFY_API_SECRET | secret SHOPIFY_API_SECRET:latest |
| DATABASE_URL | secret DATABASE_URL:latest |
| DIRECT_DATABASE_URL | secret DIRECT_DATABASE_URL:latest |
| EMAIL_SMTP_PASSWORD | secret SMPT_PASSWORD:latest |
| SHOPIFY_STOREFRONT_ACCESS_TOKEN | secret SHOPIFY_STOREFRONT_ACCESS_TOKEN:latest |
| EMAIL_SMTP_HOST | secret EMAIL_SMTP_HOST:latest |
| EMAIL_SMTP_PORT | secret EMAIL_SMTP_PORT:latest |
| EMAIL_SMTP_USER | secret EMAIL_SMTP_USER:latest |
| EMAIL_FROM_NAME | secret EMAIL_FROM_NAME:latest |
| GOOGLE_MAPS_API_KEY | secret GOOGLE_MAPS_API_KEY:latest |

## Secret Manager (10, automatically replicated, Google-managed encryption, no expiration)
| Secret | Created |
|---|---|
| DATABASE_URL | 10/12/26 5:20 PM |
| DIRECT_DATABASE_URL | 10/12/26 4:40 PM |
| EMAIL_FROM_NAME | 10/12/26 4:24 PM |
| EMAIL_SMTP_HOST | 10/12/26 4:22 PM |
| EMAIL_SMTP_PORT | 10/12/26 4:23 PM |
| EMAIL_SMTP_USER | 10/12/26 4:23 PM |
| GOOGLE_MAPS_API_KEY | 10/13/26 3:27 AM |
| SHOPIFY_API_SECRET | 10/12/26 5:19 PM |
| SHOPIFY_STOREFRONT_ACCESS_TOKEN | 10/12/26 4:42 PM |
| SMPT_PASSWORD | 10/12/26 3:49 PM |

## Artifact Registry
Repository `cloud-run-source-deploy`: Docker, Standard, `us-central1`, created 12 days ago, updated 3 days ago, 283.5 MB, vulnerability scanning disabled.

Image `delivery-scheduler`:
| Digest | Tag | Created | Size |
|---|---|---|---|
| c7f2ea9e39d7 | none | 7 days ago | 170.7 MB |
| 7ac854e3db16 | latest | 3 days ago | 170.7 MB |

## Cloud Build (`us-central1`, 11 builds)
| Build | Created | Duration |
|---|---|---|
| 28e5addd | 10/21/26 8:22 AM | 2 min 18 sec |
| 94294acb | 10/17/26 10:56 PM | 2 min 18 sec |
| ec4cc011 | 10/17/26 9:05 PM | 3 min 51 sec |
| c2133271 | 10/17/26 3:52 PM | 3 min 41 sec |
| 20be46d4 | 10/15/26 3:52 AM | 4 min 13 sec |
| b7ef4e40 | 10/15/26 12:28 AM | 4 min 44 sec |
| d4a46ebc | 10/14/26 11:57 PM | 4 min 23 sec |
| 85a4c8b6 | 10/14/26 11:48 PM | 4 min 32 sec |
| 2b2efdf6 | 10/14/26 11:24 PM | 4 min 55 sec |
| bc228380 | 10/13/26 2:15 AM | 5 min 5 sec |
| d5c2c6d9 | 10/12/26 5:23 PM | 4 min 26 sec |

## Cloud Storage
Bucket `run-sources-jhay-510919-us-central1`: us-central1 (Iowa), Standard, Soft Delete, objects not public. Folder `services/delivery-scheduler/`, 11 objects (the buckets list page showed no rows; the bucket was opened by its direct link).

| Object | Size | Created |
|---|---|---|
| 1791796974.156835-bc7bfe4e868c4e9685ed61722477dc19.zip | 946.3 KB | Oct 12, 2026 5:23 PM |
| 1791828929.414435-83eb18d812894b54b564c2ea41c24c0b.zip | 982.4 KB | Oct 13, 2026 2:15 AM |
| 1791989407.20691-60dfb8e3baf64d709ac85e9a2b010a67.zip | 956.8 KB | Oct 14, 2026 10:50 PM |
| 1791991478.479584-0d5c8c8c31624fa580d248b59dee4b25.zip | 956.8 KB | Oct 14, 2026 11:24 PM |
| 1791992929.034421-43f1430613424bb0a86f956cd4d706be.zip | 956.8 KB | Oct 14, 2026 11:48 PM |
| 1791995303.786388-988166b921cd4cd18d393a63d7157386.zip | 956.8 KB | Oct 15, 2026 12:28 AM |
| 1792007559.591009-5350479ea96c4d59ba6c0a45e4f86e5a.zip | 956.8 KB | Oct 15, 2026 3:52 AM |
| 1792223537.964028-6eb3df1e6a774f308791ca4bd61c062f.zip | 964.5 KB | Oct 17, 2026 3:52 PM |
| 1792242324.818897-9b4d2c377aa34bd29337282d7f3cf686.zip | 964.8 KB | Oct 17, 2026 9:05 PM |
| 1792248956.048095-137025c7d61c4e9d9604385b65c0de5b.zip | 934.4 KB | Oct 17, 2026 10:56 PM |
| 1792542115.514462-2a31b8eed3d8426ea1161d4a16d9eaa7.zip | 875.3 KB | Oct 21, 2026 8:22 AM |

## Enabled APIs (46)
Secret Manager API, Artifact Registry API, Gemini for Google Cloud API, Cloud Run Admin API, Gemini Cloud Assist API, App Optimize API, Cloud Build API, Analytics Hub API, App Hub API, App Topology API, BigQuery API, BigQuery Connection API, BigQuery Data Policy API, BigQuery Data Transfer API, BigQuery Migration API, BigQuery Reservation API, BigQuery Storage API, Cloud Asset API, Cloud Billing Budget API, Cloud Dataplex API, Cloud Datastore API, Cloud Logging API, Cloud Monitoring API, Cloud Pub/Sub API, Cloud Scheduler API, Cloud SQL, Cloud Storage, Cloud Storage API, Cloud Text-to-Speech API, Cloud Trace API, Container Analysis API, Container Registry API, Dataform API, Design Center API, Geocoding API, Google Cloud APIs, Google Cloud Storage JSON API, IAM Service Account Credentials API, Identity and Access Management (IAM) API, Maps JavaScript API, Places API (New), Privileged Access Manager API, Recommender API, Service Management API, Service Usage API, Telemetry API.

## Budget
`delivery-scheduler-free-guard`: monthly, specified amount, applies to this billing account, alerts at 50%, 90%, 100% and 100%, spend $0.00 / $1.00 (includes -$0.20 savings), spend cap not applicable.

## Not checked
Google-provided role grants in IAM, Shopify app, Cloud Scheduler jobs, which principal enabled each API.
