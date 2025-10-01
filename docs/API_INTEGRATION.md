## GET /retailer/activation-history

Return a paginated, flat list of keys (activations) relevant to the authenticated retailer.

Authentication
--------------

Requires an Authorization header with a valid access token:

Authorization: Bearer <ACCESS_TOKEN>

Route
-----

GET /retailer/activation-history

Query parameters
----------------

- filter (optional) — one of: `all` (default), `today`, `pending`, `active`, `activations`
	- all: keys currently in parent pools OR assigned to children under this retailer
	- today: keys assigned to children today (local-day range)
	- pending: keys currently held by parents and not assigned to children
	- active: keys assigned to children with validUntil > now
	- activations: keys assigned to children (no date restriction)
- page (optional) — page number (default: 1)
- limit (optional) — page size (default: 20, max: 100)

Response shape (200)
--------------------

{
	"total": <number>,        // total matching keys
	"page": <number>,
	"limit": <number>,
	"keys": [
		{
			"id": "<keyId>",
			"key": "<key-string>",
			"isAssigned": true|false,
			"assignedAt": "<ISO date>" | null,
			"validUntil": "<ISO date>" | null,
			"currentOwner": "<userId>",
			"parent": { "id": "<parentId>", "name": "<parentName>" } | null,
			"child": { "id": "<childId>", "name": "<childName>", "parentId": "<parentId>" } | null,
			"status": "active"|"expired"|"pending"|"in_pool"|"unknown"
		}
	]
}

Example (curl)
--------------

```bash
curl -X GET "http://localhost:5000/retailer/activation-history?filter=active&page=1&limit=10" \
	-H "Authorization: Bearer <ACCESS_TOKEN>"
```

Important semantics & notes
---------------------------

- assignedTo and assignedAt are only populated when a key is assigned to a child (activation). Keys transferred between retailer and parent should NOT set these fields — they are moved into the parent's pool via `currentOwner` and `isAssigned: false`.
- The endpoint resolves parents (users with role `parent` created by this retailer) and their children to build the scope for filters (pending/active/today/activations).
- Pagination: always use `total`, `page`, and `limit` from the response when rendering pages in the UI. The server enforces a maximum `limit` (typically 100).
- Performance: queries use indexes on `Key.assignedTo`, `Key.currentOwner`, and `Key.validUntil`. For large datasets, prefer narrow filters and use pagination to avoid heavy responses.

Errors
------

- 401 Unauthorized — missing/invalid/expired access token
- 403 Forbidden — authenticated user does not have the `retailer` role
- 400 Bad Request — invalid query parameters (e.g., wrong filter value)
- 500 Internal Server Error — unexpected server error

If you need an OpenAPI spec, Postman collection, or a small client wrapper for this endpoint, tell me which format you prefer and I'll create it.

