package migrations

import (
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestSanitizeStoredHTMLBackfillIsBatchedSilentAndIdempotent(t *testing.T) {
	// Bootstrap only PocketBase's system schema. Historical application
	// migrations also initialize external services, which this backfill does not
	// need. The collections below represent the existing application schema.
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = app.ResetBootstrapState() })
	fields := map[string]string{
		"activitypub_actors": "summary", "comments": "text", "lists": "description", "settings": "bio",
		"summit_logs": "text", "trails": "description", "waypoints": "description",
	}
	type savedText struct{ collection, id, field, updated, want string }
	var records []savedText
	var trustedWaypointID, untrustedWaypointID string
	for name, field := range fields {
		collection := core.NewBaseCollection(name)
		limit := 0 // Most rich-text fields use PocketBase's default 5,000.
		if name == "trails" || name == "settings" {
			limit = 10000
		}
		collection.Fields.Add(&core.TextField{Name: field, Max: limit}, &core.TextField{Name: "name"}, &core.DateField{Name: "updated"})
		if err := app.Save(collection); err != nil {
			t.Fatal(err)
		}
		count := 1
		if name == "activitypub_actors" {
			count = 251 // Cross the backfill's page boundary.
		}
		for i := 0; i < count; i++ {
			record := core.NewRecord(collection)
			record.Id = fmt.Sprintf("%015d", i+1)
			record.Set("name", "unchanged")
			record.Set("updated", "2020-01-02 03:04:05.000Z")
			record.Set(field, `<p onclick="blocked()">Safe <strong>text</strong></p><script>blocked()</script>`+strings.Repeat("&", 9990))
			if err := app.SaveNoValidate(record); err != nil {
				t.Fatal(err)
			}
			records = append(records, savedText{name, record.Id, field, record.GetString("updated"), ""})
		}
		maximum := limit
		if maximum == 0 {
			maximum = 5000
		}
		quotes := strings.Repeat(`'"`, 2028) + "x"
		for i, input := range []string{
			quotes,
			strings.Repeat("x", maximum-3) + "&&",
		} {
			record := core.NewRecord(collection)
			record.Id = fmt.Sprintf("%015d", count+i+1)
			record.Set("name", "unchanged")
			record.Set("updated", "2020-01-02 03:04:05.000Z")
			record.Set(field, input)
			// These historical values were valid under the original schema.
			if err := app.Save(record); err != nil {
				t.Fatalf("valid historical text could not be stored before the backfill: %v", err)
			}
			want := quotes
			if i == 1 {
				// Required entity escaping exceeds the limit. The explicitly
				// bounded migration drops both trailing ampersands completely.
				want = strings.Repeat("x", maximum-3)
			}
			records = append(records, savedText{name, record.Id, field, record.GetString("updated"), want})
		}
		if name == "waypoints" {
			for i, input := range []string{
				`<p>Trusted</p><img style="height:360px" onerror="blocked()" src="https://down-files.2bulu.com/f/d1?downParams=test%0A" alt="Waterfall">`,
				`<p>Untrusted</p><img src="https://example.test/tracker.png" onerror="blocked()">`,
			} {
				record := core.NewRecord(collection)
				record.Id = fmt.Sprintf("%015d", count+3+i)
				record.Set(field, input)
				if err := app.SaveNoValidate(record); err != nil {
					t.Fatal(err)
				}
				if i == 0 {
					trustedWaypointID = record.Id
				} else {
					untrustedWaypointID = record.Id
				}
			}
		}
	}
	updates := 0
	app.OnRecordAfterUpdateSuccess().BindFunc(func(e *core.RecordEvent) error {
		updates++ // Includes federation, mentions and index writer hooks.
		return e.Next()
	})
	if err := upSanitizeStoredHTML1791110000(app); err != nil {
		t.Fatal(err)
	}
	first := map[string]string{}
	for _, record := range records {
		stored, err := app.FindRecordById(record.collection, record.id)
		if err != nil {
			t.Fatal(err)
		}
		value := stored.GetString(record.field)
		if strings.Contains(value, "blocked()") || (record.want == "" && !strings.Contains(value, "<strong>text</strong>")) {
			t.Fatalf("historical content not cleaned: %.100s", value)
		}
		if record.want != "" && value != record.want {
			t.Fatalf("%s: historical text was unnecessarily escaped or not explicitly bounded: output length %d, want %d", record.collection, len(value), len(record.want))
		}
		if err := app.Validate(stored); err != nil {
			t.Fatalf("backfilled HTML exceeds field constraints: %v", err)
		}
		if stored.GetString("name") != "unchanged" || stored.GetString("updated") != record.updated {
			t.Fatal("backfill changed unrelated data or historical update time")
		}
		first[record.collection+record.id] = value
	}
	trustedWaypoint, err := app.FindRecordById("waypoints", trustedWaypointID)
	if err != nil {
		t.Fatal(err)
	}
	trustedValue := trustedWaypoint.GetString("description")
	if !strings.Contains(trustedValue, `src="https://down-files.2bulu.com/f/d1?downParams=test%0A"`) ||
		!strings.Contains(trustedValue, `alt="Waterfall"`) || strings.Contains(trustedValue, "style=") ||
		strings.Contains(trustedValue, "onerror=") || strings.Contains(trustedValue, "blocked()") {
		t.Fatalf("trusted historical waypoint image was not safely preserved: %q", trustedValue)
	}
	untrustedWaypoint, err := app.FindRecordById("waypoints", untrustedWaypointID)
	if err != nil {
		t.Fatal(err)
	}
	if untrustedValue := untrustedWaypoint.GetString("description"); strings.Contains(untrustedValue, "<img") || strings.Contains(untrustedValue, "blocked()") {
		t.Fatalf("untrusted historical waypoint image survived cleanup: %q", untrustedValue)
	}
	if err := upSanitizeStoredHTML1791110000(app); err != nil {
		t.Fatal(err)
	}
	for _, record := range records {
		stored, _ := app.FindRecordById(record.collection, record.id)
		if stored.GetString(record.field) != first[record.collection+record.id] {
			t.Fatal("rerunning backfill changed already sanitized content")
		}
	}
	trustedWaypoint, _ = app.FindRecordById("waypoints", trustedWaypointID)
	if trustedWaypoint.GetString("description") != trustedValue {
		t.Fatal("rerunning the backfill changed a trusted waypoint image")
	}
	if updates != 0 {
		t.Fatalf("backfill triggered %d record-update side effects", updates)
	}
}
