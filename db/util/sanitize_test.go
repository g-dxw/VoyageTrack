package util

import (
	"strings"
	"testing"
)

func TestSanitizeWaypointTwoStepsImage(t *testing.T) {
	input := `<div><a href="https://down-files.2bulu.com/f/d1?downParams=9MbSBu7VbUrXt37988eSmQ%3D%3D%0A" target="_blank"><img style="height:360px" onerror="alert(1)" src="https://down-files.2bulu.com/f/d1?downParams=9MbSBu7VbUrXt37988eSmQ%3D%3D%0A" /></a></div>`
	got := sanitizeHTMLValue("waypoints", input)

	if !strings.Contains(got, `src="https://down-files.2bulu.com/f/d1?downParams=9MbSBu7VbUrXt37988eSmQ%3D%3D%0A"`) {
		t.Fatalf("expected Two Steps image URL to be preserved, got %q", got)
	}
	if !strings.Contains(got, `href="https://down-files.2bulu.com/f/d1?downParams=9MbSBu7VbUrXt37988eSmQ%3D%3D%0A"`) {
		t.Fatalf("expected Two Steps image link to be preserved, got %q", got)
	}
	for _, disallowed := range []string{"style=", "onerror=", "alert(1)"} {
		if strings.Contains(got, disallowed) {
			t.Fatalf("expected %q to be removed, got %q", disallowed, got)
		}
	}
}

func TestSanitizeWaypointRejectsUntrustedImageSources(t *testing.T) {
	for _, source := range []string{
		`javascript:alert(1)`,
		`data:image/svg+xml,<svg onload=alert(1)>`,
		`https://example.com/tracker.png`,
	} {
		got := sanitizeHTMLValue("waypoints", `<img src="`+source+`" onerror="alert(1)">`)
		if strings.Contains(got, source) || strings.Contains(got, "onerror") {
			t.Fatalf("expected untrusted source %q to be removed, got %q", source, got)
		}
	}
}

func TestSanitizeOtherCollectionsStillRemoveImages(t *testing.T) {
	got := sanitizeHTMLValue("trails", `<p>text</p><img src="https://down-files.2bulu.com/f/d1?downParams=test">`)
	if strings.Contains(got, "<img") {
		t.Fatalf("expected images to remain disallowed outside waypoints, got %q", got)
	}
}
