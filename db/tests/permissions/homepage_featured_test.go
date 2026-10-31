package permissions_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"pocketbase/routes"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

type homepageTestItem struct {
	ID     string            `json:"id"`
	Reason map[string]string `json:"reason,omitempty"`
}
type homepageTestDocument struct {
	Revision int64              `json:"revision"`
	Items    []homepageTestItem `json:"items"`
}
type homepageTestFixture struct {
	app                                                                *core.BaseApp
	mux                                                                http.Handler
	editor, ordinary, superuser, grant, first, second, private, author *core.Record
	editorToken, ordinaryToken, superToken                             string
}

func homepageRouter(t *testing.T, app core.App) http.Handler {
	t.Helper()
	r, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	r.GET("/homepage/editor", routes.HomepageEditor)
	r.GET("/homepage/admin/featured", routes.HomepageFeaturedAdminGet)
	r.PUT("/homepage/admin/featured", routes.HomepageFeaturedAdminPut)
	r.GET("/homepage/featured", routes.HomepageFeatured)
	mux, err := r.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	return mux
}
func newHomepageFixture(t *testing.T) *homepageTestFixture {
	t.Helper()
	f := &homepageTestFixture{app: newRulesTestApp(t)}
	user := func(name string) *core.Record {
		return saveRulesTestRecord(t, f.app, "users", map[string]any{
			"username": name, "password": "test-password", "email": name + "@example.com",
		})
	}
	f.editor, f.ordinary = user("homepage-editor"), user("homepage-reader")
	f.superuser = saveRulesTestRecord(t, f.app, "_superusers", map[string]any{
		"email": "homepage-admin@example.com", "password": "test-password",
	})
	f.grant = saveRulesTestRecord(t, f.app, "homepage_editors", map[string]any{"user": f.editor.Id})
	f.author = saveRulesTestRecord(t, f.app, "activitypub_actors", map[string]any{
		"username": "homepage-editor", "preferred_username": "homepage-editor", "user": f.editor.Id,
		"domain": "example.com", "is_local": true, "public_key": "test-key",
		"iri": "https://example.com/homepage-editor", "inbox": "https://example.com/homepage-editor/inbox",
	})
	trail := func(name string, public bool) *core.Record {
		return saveRulesTestRecord(t, f.app, "trails", map[string]any{"name": name, "author": f.author.Id, "public": public})
	}
	f.first, f.second, f.private = trail("first route", true), trail("second route", true), trail("private route", false)
	token := func(record *core.Record) string {
		value, err := record.NewAuthToken()
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	f.editorToken, f.ordinaryToken, f.superToken = token(f.editor), token(f.ordinary), token(f.superuser)
	f.mux = homepageRouter(t, f.app)
	return f
}
func homepageRequest(mux http.Handler, method, path, token string, body []byte) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", token)
	}
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, req)
	return response
}
func (f *homepageTestFixture) request(t *testing.T, method, path, token string, body any, status int, code string) *httptest.ResponseRecorder {
	t.Helper()
	var raw []byte
	if body != nil {
		if value, ok := body.([]byte); ok {
			raw = value
		} else {
			var err error
			raw, err = json.Marshal(body)
			if err != nil {
				t.Fatal(err)
			}
		}
	}
	response := homepageRequest(f.mux, method, path, token, raw)
	if response.Code != status {
		t.Fatalf("%s %s = %d, want %d: %s", method, path, response.Code, status, response.Body.String())
	}
	if code != "" {
		var result struct {
			Message string         `json:"message"`
			Data    map[string]any `json:"data"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if result.Message != code || result.Data["code"] != code {
			t.Fatalf("wrong stable error: %s", response.Body.String())
		}
	}
	return response
}
func (f *homepageTestFixture) document(t *testing.T) homepageTestDocument {
	t.Helper()
	response := f.request(t, "GET", "/homepage/admin/featured", f.editorToken, nil, 200, "")
	var result homepageTestDocument
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Items == nil {
		t.Fatal("items must be [] rather than null")
	}
	return result
}
func (f *homepageTestFixture) setItems(t *testing.T, items []homepageTestItem) homepageTestDocument {
	t.Helper()
	current := f.document(t)
	response := f.request(t, "PUT", "/homepage/admin/featured", f.editorToken,
		map[string]any{"revision": current.Revision, "items": items}, 200, "")
	var result homepageTestDocument
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Revision != current.Revision+1 {
		t.Fatal("save did not increment revision")
	}
	return result
}

func TestHomepageFeaturedManagement(t *testing.T) {
	f := newHomepageFixture(t)
	t.Run("initial state and real token authorization", func(t *testing.T) {
		initial := f.document(t)
		if initial.Revision != 0 || len(initial.Items) != 0 {
			t.Fatalf("unexpected initial config: %+v", initial)
		}
		for _, item := range []struct {
			token   string
			allowed bool
		}{
			{"", false}, {f.ordinaryToken, false}, {f.editorToken, true}, {f.superToken, true},
		} {
			response := f.request(t, "GET", "/homepage/editor", item.token, nil, 200, "")
			var result struct {
				CanManage bool `json:"canManageHomepage"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if result.CanManage != item.allowed {
				t.Fatalf("capability = %v, want %v", result.CanManage, item.allowed)
			}
			if response.Header().Get("Cache-Control") != "private, no-store" {
				t.Fatal("capabilities must not be cached")
			}
		}
		for _, method := range []string{"GET", "PUT"} {
			f.request(t, method, "/homepage/admin/featured", "", map[string]any{"revision": 0, "items": []any{}}, 401, "homepage_auth_required")
			f.request(t, method, "/homepage/admin/featured", f.ordinaryToken, map[string]any{"revision": 0, "items": []any{}}, 403, "homepage_editor_required")
		}
		f.request(t, "GET", "/homepage/admin/featured", f.superToken, nil, 200, "")
	})
	t.Run("native collection APIs cannot bypass the custom routes", func(t *testing.T) {
		config, err := f.app.FindFirstRecordByFilter("homepage_featured", "key='homepage'")
		if err != nil {
			t.Fatal(err)
		}
		for _, token := range []string{"", f.ordinaryToken, f.editorToken} {
			for _, collection := range []string{"homepage_editors", "homepage_featured"} {
				f.request(t, "GET", "/api/collections/"+collection+"/records", token, nil, 403, "")
			}
			f.request(t, "POST", "/api/collections/homepage_editors/records", token, map[string]any{"user": f.ordinary.Id}, 403, "")
			f.request(t, "POST", "/api/collections/homepage_featured/records", token, map[string]any{"key": "homepage", "items": []any{}}, 403, "")
			f.request(t, "GET", "/api/collections/homepage_featured/records/"+config.Id, token, nil, 403, "")
			f.request(t, "PATCH", "/api/collections/homepage_featured/records/"+config.Id, token, map[string]any{"items": []any{}}, 403, "")
			f.request(t, "DELETE", "/api/collections/homepage_editors/records/"+f.grant.Id, token, nil, 403, "")
		}
	})
	t.Run("migration enforces unique user grants and one fixed homepage key", func(t *testing.T) {
		f.request(t, "POST", "/api/collections/homepage_editors/records", f.superToken, map[string]any{"user": f.editor.Id}, 400, "")
		f.request(t, "POST", "/api/collections/homepage_featured/records", f.superToken, map[string]any{"key": "homepage", "items": []any{}}, 400, "")
		f.request(t, "POST", "/api/collections/homepage_featured/records", f.superToken, map[string]any{"key": "another", "items": []any{}}, 400, "")
	})
	t.Run("only superusers can grant and revoke editors and revocation is immediate", func(t *testing.T) {
		response := f.request(t, "POST", "/api/collections/homepage_editors/records", f.superToken, map[string]any{"user": f.ordinary.Id}, 200, "")
		var grant struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &grant); err != nil {
			t.Fatal(err)
		}
		f.request(t, "GET", "/homepage/admin/featured", f.ordinaryToken, nil, 200, "")
		f.request(t, "DELETE", "/api/collections/homepage_editors/records/"+grant.ID, f.superToken, nil, 204, "")
		response = f.request(t, "GET", "/homepage/editor", f.ordinaryToken, nil, 200, "")
		if strings.Contains(response.Body.String(), "true") {
			t.Fatal("revoked editor still has capability")
		}
		f.request(t, "PUT", "/homepage/admin/featured", f.ordinaryToken, map[string]any{"revision": 0, "items": []any{}}, 403, "homepage_editor_required")
	})
	reason := map[string]string{"en": "Verified route", "zh": "经核对的路线"}
	chosen := []homepageTestItem{{ID: f.second.Id, Reason: reason}, {ID: f.first.Id}}
	t.Run("ordered atomic save survives fresh database reads and keeps reasons", func(t *testing.T) {
		saved := f.setItems(t, chosen)
		if len(saved.Items) != 2 || saved.Items[0].ID != f.second.Id || saved.Items[0].Reason["zh"] != reason["zh"] {
			t.Fatalf("order/reason lost: %+v", saved)
		}
		fresh := f.document(t)
		if fresh.Revision != saved.Revision || fresh.Items[1].ID != f.first.Id {
			t.Fatal("saved list did not persist")
		}
		response := f.request(t, "GET", "/homepage/featured", "", nil, 200, "")
		if response.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("public config must not be cached")
		}
		var public homepageTestDocument
		if err := json.Unmarshal(response.Body.Bytes(), &public); err != nil {
			t.Fatal(err)
		}
		if len(public.Items) != 2 || public.Items[0].ID != f.second.Id {
			t.Fatal("public order differs")
		}
	})
	t.Run("invalid input and stale revisions never partially modify the list", func(t *testing.T) {
		current := f.document(t)
		thirteen := make([]homepageTestItem, 13)
		for i := range thirteen {
			thirteen[i].ID = fmt.Sprintf("a%014d", i)
		}
		cases := []struct {
			name   string
			body   any
			status int
			code   string
		}{
			{"missing revision", map[string]any{"items": []any{}}, 400, "homepage_invalid_revision"},
			{"negative revision", map[string]any{"revision": -1, "items": []any{}}, 400, "homepage_invalid_revision"},
			{"missing items", map[string]any{"revision": current.Revision}, 400, "homepage_invalid_request"},
			{"null items", map[string]any{"revision": current.Revision, "items": nil}, 400, "homepage_invalid_request"},
			{"too many", map[string]any{"revision": current.Revision, "items": thirteen}, 400, "homepage_too_many_items"},
			{"duplicate", map[string]any{"revision": current.Revision, "items": []homepageTestItem{{ID: f.first.Id}, {ID: f.first.Id}}}, 400, "homepage_duplicate_trail"},
			{"malformed id", map[string]any{"revision": current.Revision, "items": []homepageTestItem{{ID: "not-a-record"}}}, 400, "homepage_invalid_trail"},
			{"missing trail", map[string]any{"revision": current.Revision, "items": []homepageTestItem{{ID: "aaaaaaaaaaaaaaa"}}}, 400, "homepage_invalid_trail"},
			{"private trail", map[string]any{"revision": current.Revision, "items": []homepageTestItem{{ID: f.private.Id}}}, 400, "homepage_invalid_trail"},
			{"long unicode reason", map[string]any{"revision": current.Revision, "items": []homepageTestItem{{ID: f.first.Id, Reason: map[string]string{"zh": strings.Repeat("山", 241)}}}}, 400, "homepage_invalid_reason"},
			{"stale revision", map[string]any{"revision": current.Revision - 1, "items": []any{}}, 409, "homepage_revision_conflict"},
			{"malformed json", []byte(`{"revision":`), 400, "homepage_invalid_request"},
			{"wrong reason type", []byte(fmt.Sprintf(`{"revision":%d,"items":[{"id":%q,"reason":{"en":42}}]}`, current.Revision, f.first.Id)), 400, "homepage_invalid_request"},
			{"extra document", []byte(fmt.Sprintf(`{"revision":%d,"items":[]} {}`, current.Revision)), 400, "homepage_invalid_request"},
		}
		for _, test := range cases {
			t.Run(test.name, func(t *testing.T) {
				f.request(t, "PUT", "/homepage/admin/featured", f.editorToken, test.body, test.status, test.code)
				after := f.document(t)
				if after.Revision != current.Revision || len(after.Items) != 2 || after.Items[0].ID != chosen[0].ID {
					t.Fatal("rejected save changed state")
				}
			})
		}
	})
	t.Run("unicode length counts characters and an empty list can clear the homepage", func(t *testing.T) {
		f.setItems(t, []homepageTestItem{{ID: f.first.Id, Reason: map[string]string{"en": strings.Repeat("🌍", 240)}}})
		f.setItems(t, []homepageTestItem{})
		response := f.request(t, "GET", "/homepage/featured", "", nil, 200, "")
		if strings.TrimSpace(response.Body.String()) != `{"items":[]}` {
			t.Fatalf("empty list = %s", response.Body.String())
		}
	})
	t.Run("concurrent editors receive exactly one success and one conflict", func(t *testing.T) {
		current := f.document(t)
		body, _ := json.Marshal(map[string]any{"revision": current.Revision, "items": chosen})
		start := make(chan struct{})
		results := make(chan int, 2)
		for range 2 {
			go func() {
				<-start
				results <- homepageRequest(f.mux, "PUT", "/homepage/admin/featured", f.editorToken, body).Code
			}()
		}
		close(start)
		one, two := <-results, <-results
		if !((one == 200 && two == 409) || (one == 409 && two == 200)) {
			t.Fatalf("concurrent status = %d, %d", one, two)
		}
		if f.document(t).Revision != current.Revision+1 {
			t.Fatal("concurrent save lost version integrity")
		}
	})
	t.Run("public responses omit private and deleted choices together with their reasons", func(t *testing.T) {
		f.setItems(t, chosen)
		f.first.Set("public", false)
		if err := f.app.Save(f.first); err != nil {
			t.Fatal(err)
		}
		if err := f.app.Delete(f.second); err != nil {
			t.Fatal(err)
		}
		for _, token := range []string{"", f.editorToken, f.superToken} {
			response := f.request(t, "GET", "/homepage/featured?share=not-authority", token, nil, 200, "")
			if strings.TrimSpace(response.Body.String()) != `{"items":[]}` {
				t.Fatalf("private choice or reason leaked: %s", response.Body.String())
			}
		}
		if len(f.document(t).Items) != 2 {
			t.Fatal("administrators must retain unavailable choices for removal")
		}
	})
}

type homepageRuleFailureApp struct{ core.App }

func (a *homepageRuleFailureApp) CanAccessRecord(record *core.Record, info *core.RequestInfo, rule *string) (bool, error) {
	return false, errors.New("injected rule evaluation failure")
}

func TestHomepageFeaturedAnonymousRulesAndFailures(t *testing.T) {
	f := newHomepageFixture(t)
	f.setItems(t, []homepageTestItem{{ID: f.first.Id, Reason: map[string]string{"en": "must disappear if inaccessible"}}})
	t.Run("legacy missing names and unusable authors cannot remain public selections", func(t *testing.T) {
		for _, test := range []struct {
			mutate, restore string
			values          dbx.Params
		}{
			{"UPDATE trails SET name='' WHERE id={:trail}", "UPDATE trails SET name='first route' WHERE id={:trail}", dbx.Params{"trail": f.first.Id}},
			{"UPDATE trails SET author='' WHERE id={:trail}", "UPDATE trails SET author={:author} WHERE id={:trail}", dbx.Params{"trail": f.first.Id, "author": f.author.Id}},
			{"UPDATE activitypub_actors SET preferred_username='' WHERE id={:author}", "UPDATE activitypub_actors SET preferred_username='homepage-editor' WHERE id={:author}", dbx.Params{"author": f.author.Id}},
			{"UPDATE activitypub_actors SET is_local=0, domain='' WHERE id={:author}", "UPDATE activitypub_actors SET is_local=1, domain='example.com' WHERE id={:author}", dbx.Params{"author": f.author.Id}},
		} {
			if _, err := f.app.DB().NewQuery(test.mutate).Bind(test.values).Execute(); err != nil {
				t.Fatal(err)
			}
			response := f.request(t, "GET", "/homepage/featured", "", nil, 200, "")
			if strings.TrimSpace(response.Body.String()) != `{"items":[]}` {
				t.Fatalf("unusable choice leaked: %s", response.Body.String())
			}
			current := f.document(t)
			f.request(t, "PUT", "/homepage/admin/featured", f.editorToken, map[string]any{"revision": current.Revision, "items": current.Items}, 400, "homepage_invalid_trail")
			if _, err := f.app.DB().NewQuery(test.restore).Bind(test.values).Execute(); err != nil {
				t.Fatal(err)
			}
		}
	})
	trails, err := f.app.FindCollectionByNameOrId("trails")
	if err != nil {
		t.Fatal(err)
	}
	originalRule := trails.ViewRule
	for _, rule := range []string{`@request.auth.id != ""`, `@request.query.share = "secret"`} {
		trails.ViewRule = types.Pointer(rule)
		if err := f.app.Save(trails); err != nil {
			t.Fatal(err)
		}
		for _, token := range []string{"", f.editorToken, f.superToken} {
			response := f.request(t, "GET", "/homepage/featured?share=secret", token, nil, 200, "")
			if strings.TrimSpace(response.Body.String()) != `{"items":[]}` {
				t.Fatal("caller authentication/share was reused")
			}
		}
		current := f.document(t)
		f.request(t, "PUT", "/homepage/admin/featured", f.editorToken, map[string]any{"revision": current.Revision, "items": current.Items}, 400, "homepage_invalid_trail")
	}
	trails.ViewRule = originalRule
	if err := f.app.Save(trails); err != nil {
		t.Fatal(err)
	}
	authors, err := f.app.FindCollectionByNameOrId("activitypub_actors")
	if err != nil {
		t.Fatal(err)
	}
	authors.ViewRule = types.Pointer(`@request.auth.id != ""`)
	if err := f.app.Save(authors); err != nil {
		t.Fatal(err)
	}
	response := f.request(t, "GET", "/homepage/featured", f.superToken, nil, 200, "")
	if strings.TrimSpace(response.Body.String()) != `{"items":[]}` {
		t.Fatal("hidden author leaked")
	}

	t.Run("rule evaluation failures are unavailable rather than empty", func(t *testing.T) {
		previous := f.mux
		f.mux = homepageRouter(t, &homepageRuleFailureApp{App: f.app})
		defer func() { f.mux = previous }()
		f.request(t, "GET", "/homepage/featured", "", nil, 503, "homepage_unavailable")
	})
	t.Run("configuration and membership database failures are not false empty or denied", func(t *testing.T) {
		if _, err := f.app.DB().NewQuery("DROP TABLE homepage_featured").Execute(); err != nil {
			t.Fatal(err)
		}
		f.request(t, "GET", "/homepage/featured", "", nil, 503, "homepage_unavailable")
		f.request(t, "GET", "/homepage/admin/featured", f.editorToken, nil, 503, "homepage_unavailable")
		if _, err := f.app.DB().NewQuery("DROP TABLE homepage_editors").Execute(); err != nil {
			t.Fatal(err)
		}
		f.request(t, "GET", "/homepage/editor", f.editorToken, nil, 503, "homepage_unavailable")
		f.request(t, "PUT", "/homepage/admin/featured", f.editorToken, map[string]any{"revision": 0, "items": []any{}}, 503, "homepage_unavailable")
	})
}
