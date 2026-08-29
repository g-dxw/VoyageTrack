package util

import (
	"regexp"

	"github.com/microcosm-cc/bluemonday"
	"github.com/pocketbase/pocketbase/core"
)

var twoStepsImageURL = regexp.MustCompile(`^https://down-files\.2bulu\.com/f/[A-Za-z0-9/?=&%+._~-]+$`)

func SanitizeHTML() func(e *core.RecordRequestEvent) error {
	return func(e *core.RecordRequestEvent) error {
		fieldsToSanitize := map[string][]string{
			"lists":       {"description"},
			"settings":    {"bio"},
			"summit_logs": {"text"},
			"trails":      {"description"},
			"comments":    {"text"},
			"waypoints":   {"description"},
		}
		collection := e.Collection.Name
		fields, ok := fieldsToSanitize[collection]
		if !ok {
			return e.Next()
		}

		for _, field := range fields {
			if val, ok := e.Record.Get(field).(string); ok {
				sanitizedValue := sanitizeHTMLValue(collection, val)
				e.Record.Set(field, sanitizedValue)
			}
		}

		return e.Next()
	}
}

func sanitizeHTMLValue(collection, value string) string {
	p := bluemonday.NewPolicy()
	p.AllowStandardAttributes()
	p.AllowStandardURLs()
	p.AllowLists()
	p.AllowElements("br", "div", "hr", "p", "span", "wbr")
	p.AllowElements("b", "strong", "em", "u", "blockquote", "a")
	p.AllowAttrs("href").OnElements("a")
	p.AllowAttrs("target").OnElements("a")
	p.AllowAttrs("class").OnElements("a")

	if collection == "waypoints" {
		p.AllowElements("img")
		p.AllowAttrs("src").Matching(twoStepsImageURL).OnElements("img")
		p.AllowAttrs("alt").OnElements("img")
	}

	return p.Sanitize(value)
}
